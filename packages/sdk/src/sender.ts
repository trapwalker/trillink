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
   * Calibrated empirically at 48 kHz against ggwave@0.4.0.
   * All AUDIBLE_* protocols produce identical output length in this library version.
   */
  static estimateDuration(
    messages: SessionMessage[],
    opts: { cycles?: number; interCycleGapMs?: number; interFrameGapMs?: number },
  ): number {
    const frames = buildSession(messages);
    const cycles = opts.cycles ?? 1;
    const interCycleGapMs = opts.interCycleGapMs ?? 1500;
    const interFrameGapMs = opts.interFrameGapMs ?? 200;

    const framesSec = frames.reduce((sum, f) => {
      return sum + ggwaveFrameDurationSec(encodeFrame(f).length);
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

/**
 * Empirical ggwave@0.4.0 frame duration table at 48 kHz (GGWAVE_SAMPLE_FORMAT_F32).
 * Steps follow Reed-Solomon block boundaries. Max trillink frame = 28 bytes.
 */
function ggwaveFrameDurationSec(frameBytes: number): number {
  if (frameBytes <= 1)  return 1.067;
  if (frameBytes <= 2)  return 1.259;
  if (frameBytes <= 4)  return 1.451;
  if (frameBytes <= 8)  return 1.643;
  if (frameBytes <= 12) return 2.027;
  if (frameBytes <= 18) return 2.411;
  if (frameBytes <= 22) return 2.795;
  if (frameBytes <= 24) return 2.987;
  if (frameBytes <= 26) return 3.179;
  return 3.371; // 27-28 bytes
}
