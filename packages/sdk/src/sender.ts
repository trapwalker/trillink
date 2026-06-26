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

  async send(messages: SessionMessage[]): Promise<void> {
    this._aborted = false;
    this._extraCycles = 0;
    this._running = true;
    const frames = buildSession(messages);

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
        }

        await this.audio.play(frames, {
          preambleDurationMs: 0,
          interFrameGapMs: this.interFrameGapMs,
        });

        for (const frame of frames) {
          this.emit({ type: 'frame-sent', frame, cycle });
        }

        this.emit({ type: 'cycle-complete', cycle });
        cycle++;

        if (cycle < this._baseCycles + this._extraCycles) {
          await sleep(this.interCycleGapMs);
        }
      }

      this.emit({ type: 'transmission-complete' });
    } finally {
      this._running = false;
    }
  }

  abort(): void {
    this._aborted = true;
  }

  /** Estimate total transmission duration in seconds for the given messages. */
  static estimateDuration(
    messages: SessionMessage[],
    opts: { mode?: 'fast' | 'balanced' | 'robust'; cycles?: number; interCycleGapMs?: number; interFrameGapMs?: number }
  ): number {
    const frames = buildSession(messages);
    const cycles = opts.cycles ?? 1;
    const interCycleGapMs = opts.interCycleGapMs ?? 1500;
    const interFrameGapMs = opts.interFrameGapMs ?? 200;

    // Calibrated at 48 kHz (from empirical GGWave benchmarks):
    //   fast (AUDIBLE_FASTEST):  overhead=2.56s, 0.133s/byte
    //   balanced (AUDIBLE_FAST): overhead=3.86s, 0.216s/byte
    //   robust (AUDIBLE_NORMAL): overhead=4.43s, 0.323s/byte
    const [overhead, perByte] =
      opts.mode === 'robust'   ? [4.43, 0.323] :
      opts.mode === 'balanced' ? [3.86, 0.216] :
                                 [2.56, 0.133];

    const framesSec = frames.reduce((sum, f) => {
      const bytes = encodeFrame(f).length;
      return sum + overhead + perByte * bytes;
    }, 0);
    const gapsSec = (frames.length - 1) * (interFrameGapMs / 1000);
    const cycleSec = framesSec + gapsSec;
    const totalGapsSec = (cycles - 1) * (interCycleGapMs / 1000);
    return cycleSec * cycles + totalGapsSec;
  }

  private emit(e: SenderEvent): void {
    this.onEvent?.(e);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
