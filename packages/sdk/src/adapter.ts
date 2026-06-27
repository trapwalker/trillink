import type { TrilinkFrame } from '@trillink/protocol';

export interface PlayOptions {
  preambleDurationMs?: number;
  interFrameGapMs?: number;
}

/**
 * Platform-agnostic audio I/O interface.
 * Implementations: @trillink/audio-web (browser), @trillink/audio-rn (React Native).
 */
export interface AudioAdapter {
  play(frames: TrilinkFrame[], opts?: PlayOptions): Promise<void>;
  /** Immediately interrupt any in-progress play() or playPreamble() call. */
  stopPlayback(): void;
  startListening(onFrame: (frame: TrilinkFrame) => void, onSignal?: () => void, onLevel?: (rms: number) => void): Promise<void>;
  stopListening(): Promise<void>;
  playPreamble(durationMs: number): Promise<void>;
  readonly isListening: boolean;
}
