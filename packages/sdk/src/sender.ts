import { buildSession, encodeFrame, type SessionMessage } from '@trillink/protocol';
import type { AudioAdapter } from './adapter.js';
import type { SenderEvent } from './events.js';

export interface SenderOptions {
  audio: AudioAdapter;
  cycles?: number;
  interCycleGapMs?: number;
  preambleDurationMs?: number;
  interFrameGapMs?: number;
  onEvent?: (e: SenderEvent) => void;
}

export class TrilinkSender {
  private readonly audio: AudioAdapter;
  private readonly interCycleGapMs: number;
  private readonly preambleDurationMs: number;
  private readonly interFrameGapMs: number;
  private readonly onEvent: ((e: SenderEvent) => void) | undefined;
  private _baseCycles: number;
  private _extraCycles = 0;
  private _aborted = false;
  private _running = false;
  private _sleepResolve: (() => void) | null = null;

  constructor(opts: SenderOptions) {
    this.audio = opts.audio;
    this._baseCycles = opts.cycles ?? 1;
    this.interCycleGapMs = opts.interCycleGapMs ?? 1500;
    this.preambleDurationMs = opts.preambleDurationMs ?? 0;
    this.interFrameGapMs = opts.interFrameGapMs ?? 200;
    this.onEvent = opts.onEvent;
  }

  get isRunning(): boolean { return this._running; }

  /** Add one more transmission cycle while a send() is in progress (or before it starts). */
  addCycle(): void {
    this._extraCycles++;
  }

  async send(messages: SessionMessage[], sessionId?: number): Promise<void> {
    this._aborted = false;
    this._extraCycles = 0;
    this._running = true;
    const frames = buildSession(messages, sessionId);

    try {
      let cycle = 0;
      while (cycle < this._baseCycles + this._extraCycles) {
        if (this._aborted) {
          this.emit({ type: 'aborted' });
          return;
        }

        const total = this._baseCycles + this._extraCycles;
        this.emit({ type: 'cycle-start', cycle, total });

        if (this.preambleDurationMs > 0) {
          await this.audio.playPreamble(this.preambleDurationMs);
          if (this._aborted) { this.emit({ type: 'aborted' }); return; }
        }

        await this.audio.play(frames, {
          preambleDurationMs: 0,
          interFrameGapMs: this.interFrameGapMs,
        });

        if (this._aborted) { this.emit({ type: 'aborted' }); return; }

        for (const frame of frames) {
          this.emit({ type: 'frame-sent', frame, cycle });
        }

        this.emit({ type: 'cycle-complete', cycle });
        cycle++;

        if (cycle < this._baseCycles + this._extraCycles) {
          await this.sleepAbortable(this.interCycleGapMs);
          if (this._aborted) { this.emit({ type: 'aborted' }); return; }
        }
      }

      this.emit({ type: 'transmission-complete' });
    } finally {
      this._sleepResolve = null;
      this._running = false;
    }
  }

  abort(): void {
    this._aborted = true;
    this.audio.stopPlayback();
    this._sleepResolve?.();
    this._sleepResolve = null;
  }

  /**
   * Estimate total transmission duration in seconds for the given messages.
   * Pass frameDuration to use your codec's estimate; it receives the encoded
   * frame byte count and returns seconds for that one frame.
   */
  static estimateDuration(
    messages: SessionMessage[],
    opts: {
      cycles?: number;
      interCycleGapMs?: number;
      interFrameGapMs?: number;
      frameDuration: (frameBytes: number) => number;
    },
  ): number {
    const frames = buildSession(messages);
    const cycles = opts.cycles ?? 1;
    const interCycleGapMs = opts.interCycleGapMs ?? 1500;
    const interFrameGapMs = opts.interFrameGapMs ?? 200;

    const framesSec = frames.reduce((sum, f) => {
      return sum + opts.frameDuration(encodeFrame(f).length);
    }, 0);
    const gapsSec = (frames.length - 1) * (interFrameGapMs / 1000);
    const cycleSec = framesSec + gapsSec;
    const totalGapsSec = (cycles - 1) * (interCycleGapMs / 1000);
    return cycleSec * cycles + totalGapsSec;
  }

  private sleepAbortable(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      this._sleepResolve = resolve;
      setTimeout(() => {
        this._sleepResolve = null;
        resolve();
      }, ms);
    });
  }

  private emit(e: SenderEvent): void {
    this.onEvent?.(e);
  }
}

