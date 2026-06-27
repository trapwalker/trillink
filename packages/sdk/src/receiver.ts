import {
  CrcError,
  SessionContext,
  TruncatedError,
  VersionError,
  type TrilinkFrame,
} from '@trillink/protocol';
import type { AudioAdapter } from './adapter.js';
import type { ReceiverEvent } from './events.js';

export interface ReceiverOptions {
  audio: AudioAdapter;
  fragmentTimeoutMs?: number;
  onEvent?: (e: ReceiverEvent) => void;
  onLevel?: (rms: number) => void;
}

export class TrilinkReceiver {
  private readonly audio: AudioAdapter;
  private readonly fragmentTimeoutMs: number;
  private readonly onEvent: ((e: ReceiverEvent) => void) | undefined;
  private readonly onLevel: ((rms: number) => void) | undefined;
  private readonly ctx = new SessionContext();
  private pruneTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: ReceiverOptions) {
    this.audio = opts.audio;
    this.fragmentTimeoutMs = opts.fragmentTimeoutMs ?? 30_000;
    this.onEvent = opts.onEvent;
    this.onLevel = opts.onLevel;
  }

  async start(): Promise<void> {
    await this.audio.startListening(
      (frame) => this.handleFrame(frame),
      () => this.emit({ type: 'signal-detected' }),
      this.onLevel,
    );

    this.pruneTimer = setInterval(() => {
      const timedOut = this.ctx.pruneTimedOut(this.fragmentTimeoutMs);
      for (const msgType of timedOut) {
        this.emit({ type: 'fragment-timeout', msgType, received: 0, total: 0 });
      }
    }, Math.min(this.fragmentTimeoutMs / 2, 5_000));

    this.emit({ type: 'listening' });
  }

  async stop(): Promise<void> {
    if (this.pruneTimer !== null) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }
    await this.audio.stopListening();
  }

  reset(): void {
    this.ctx.reset();
  }

  get isListening(): boolean {
    return this.audio.isListening;
  }

  private handleFrame(frame: TrilinkFrame): void {
    this.emit({ type: 'frame-received', frame });

    if (frame.flags.frag) {
      this.emit({
        type: 'fragment-received',
        msgType: frame.msgType,
        segIdx: frame.segIdx,
        segTotal: frame.segTot,
      });
    }

    const result = this.ctx.feed(frame);

    if (result.status === 'ready') {
      const prevContext = this.ctx.context;
      this.emit({ type: 'message-ready', message: result.message, isCont: result.isCont, sessionId: frame.sessionId });
      if (result.isCont && prevContext !== null) {
        this.emit({ type: 'context-updated', context: prevContext, continuation: result.message });
      }
    }
  }

  private emit(e: ReceiverEvent): void {
    this.onEvent?.(e);
  }
}

export function classifyFrameError(err: unknown): ReceiverEvent {
  if (err instanceof CrcError) return { type: 'frame-error', reason: 'crc' };
  if (err instanceof VersionError) return { type: 'frame-error', reason: 'version' };
  if (err instanceof TruncatedError) return { type: 'frame-error', reason: 'truncated' };
  return { type: 'frame-error', reason: 'unknown' };
}
