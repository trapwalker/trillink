import { buildSession, type SessionMessage } from '@trillink/protocol';
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
  private readonly cycles: number;
  private readonly interCycleGapMs: number;
  private readonly preambleDurationMs: number;
  private readonly interFrameGapMs: number;
  private readonly onEvent: ((e: SenderEvent) => void) | undefined;
  private aborted = false;

  constructor(opts: SenderOptions) {
    this.audio = opts.audio;
    this.cycles = opts.cycles ?? 3;
    this.interCycleGapMs = opts.interCycleGapMs ?? 1500;
    this.preambleDurationMs = opts.preambleDurationMs ?? 0;
    this.interFrameGapMs = opts.interFrameGapMs ?? 200;
    this.onEvent = opts.onEvent;
  }

  async send(messages: SessionMessage[]): Promise<void> {
    this.aborted = false;
    const frames = buildSession(messages);

    for (let cycle = 0; cycle < this.cycles; cycle++) {
      if (this.aborted) {
        this.emit({ type: 'aborted' });
        return;
      }

      this.emit({ type: 'cycle-start', cycle, total: this.cycles });

      if (this.preambleDurationMs > 0) {
        await this.audio.playPreamble(this.preambleDurationMs);
      }

      await this.audio.play(frames, {
        preambleDurationMs: 0,
        interFrameGapMs: this.interFrameGapMs,
      });

      for (const frame of frames) {
        this.emit({ type: 'frame-sent', frame, cycle });
      }

      this.emit({ type: 'cycle-complete', cycle });

      if (cycle < this.cycles - 1) {
        await sleep(this.interCycleGapMs);
      }
    }

    this.emit({ type: 'transmission-complete' });
  }

  abort(): void {
    this.aborted = true;
  }

  private emit(e: SenderEvent): void {
    this.onEvent?.(e);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
