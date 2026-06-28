// ── TX ────────────────────────────────────────────────────────────────────────

export interface TxProgress {
  elapsedSec: number;
  remainingSec: number;
  bytesSent: number;
  totalBytes: number;
}

export interface TxResult {
  elapsedSec: number;
  /** false if stop() was called before natural completion */
  completed: boolean;
}

export interface TxHandlers {
  onProgress?: (progress: TxProgress) => void;
  onDone?: (result: TxResult) => void;
}

export interface TxHandle {
  stop(): void;
  /** Resolves with TxResult when TX finishes naturally or after stop() */
  readonly promise: Promise<TxResult>;
}

// ── RX ────────────────────────────────────────────────────────────────────────

export interface RxHandlers {
  onStart?: () => void;
  onProgress?: (buffer: Uint8Array, elapsedSec: number) => boolean | void;
  onEnd?: (buffer: Uint8Array, elapsedSec: number) => void;
  onLevel?: (rms: number) => void;
  onError?: (reason: 'framing' | 'timeout' | 'noise') => void;
  /** Raw PCM chunk from onaudioprocess — used to fill the ring buffer. */
  onSamples?: (chunk: Float32Array) => void;
}

export interface RxHandle {
  stop(): void;
  analyser: AnalyserNode;
}

// ── Codec ─────────────────────────────────────────────────────────────────────

export interface AudioCodec {
  readonly id: string;
  readonly name: string;
  /** Estimated TX time in seconds for a payload of this many bytes */
  estimateDuration(payloadBytes: number): number;
  /**
   * Start transmitting payload immediately. Returns a handle to abort early
   * (handle.stop()) or await completion (handle.promise).
   */
  transmit(payload: Uint8Array, ctx: AudioContext, handlers?: TxHandlers): TxHandle;
  startReceiving(ctx: AudioContext, stream: MediaStream, handlers: RxHandlers): Promise<RxHandle>;
}
