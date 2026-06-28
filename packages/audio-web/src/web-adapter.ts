import { decodeFrame, encodeFrame, type TrilinkFrame } from '@trillink/protocol';
import type { AudioAdapter, PlayOptions } from '@trillink/sdk';
import type { AudioCodec, RxHandle, TxHandle } from './codec.js';
import { DtmfFskCodec } from './codecs/dtmf-fsk.js';
import { createPreambleBuffer } from './preamble.js';
import type { PlayHandle } from './player.js';
import { playBuffer } from './player.js';

/** 'dtmf-fsk' resolves to DtmfFskCodec with default options. Pass an object for custom config. */
export type CodecSpec = 'dtmf-fsk' | AudioCodec;

export interface WebAudioAdapterOptions {
  codec?: CodecSpec;
  /** PTT/walkie-talkie: play a carrier tone before each cycle to open squelch */
  ptt?: boolean;
  volume?: number;
  /** Pre-created AudioContext — pass one created synchronously inside a user-gesture
   *  handler to guarantee it starts in 'running' state (avoids Chrome autoplay suspension). */
  ctx?: AudioContext;
  /** Called when bytes arrive from the decoder but CRC / framing validation fails.
   *  Use with getCapture() to retrieve the raw audio for debugging. */
  onDecodeError?: (rawBytes: Uint8Array) => void;
}

function resolveCodec(spec: CodecSpec, amplitude: number): AudioCodec {
  if (typeof spec === 'object') return spec;
  return new DtmfFskCodec({ amplitude });
}

const RING_SECS = 45;

export class WebAudioAdapter implements AudioAdapter {
  private _ctx: AudioContext | null = null;
  private _stream: MediaStream | null = null;
  private _rxHandle: RxHandle | null = null;
  private _playHandle: PlayHandle | null = null;
  private _txHandle: TxHandle | null = null;

  private readonly codec: AudioCodec;
  private readonly defaultPreambleMs: number;
  private readonly onDecodeError: ((raw: Uint8Array) => void) | undefined;

  // Ring buffer — always filled while listening; enables post-hoc debug capture
  private _ring: Float32Array | null = null;
  private _ringPos = 0;
  private _ringRate = 48000;

  constructor(opts: WebAudioAdapterOptions = {}) {
    const amplitude = (opts.volume ?? 60) / 100;
    this.codec = resolveCodec(opts.codec ?? 'dtmf-fsk', amplitude);
    this.defaultPreambleMs = opts.ptt ? 700 : 0;
    this.onDecodeError = opts.onDecodeError;
    if (opts.ctx) this._ctx = opts.ctx;
  }

  /**
   * Return the last `durationSec` seconds of microphone audio as a linear PCM
   * Float32Array at the AudioContext sample rate.  Returns null before listening starts.
   */
  getCapture(durationSec = RING_SECS): { samples: Float32Array; sampleRate: number } | null {
    if (!this._ring) return null;
    const n = Math.min(Math.round(this._ringRate * durationSec), this._ring.length);
    const out = new Float32Array(n);
    const start = ((this._ringPos - n) + this._ring.length) % this._ring.length;
    for (let i = 0; i < n; i++) {
      out[i] = this._ring[(start + i) % this._ring.length]!;
    }
    return { samples: out, sampleRate: this._ringRate };
  }

  get isListening(): boolean { return this._rxHandle !== null; }

  /** AnalyserNode from the active receiver — for waterfall / VU meter. */
  get analyser(): AnalyserNode | null { return this._rxHandle?.analyser ?? null; }

  stopPlayback(): void {
    this._playHandle?.stop();  this._playHandle = null;
    this._txHandle?.stop();    this._txHandle   = null;
  }

  private getOrCreateContext(): AudioContext {
    if (!this._ctx || this._ctx.state === 'closed') this._ctx = new AudioContext();
    return this._ctx;
  }

  async play(frames: TrilinkFrame[], opts: PlayOptions = {}): Promise<void> {
    const ctx = this.getOrCreateContext();
    if (ctx.state === 'suspended') await ctx.resume();

    const preambleMs = opts.preambleDurationMs ?? 0;
    if (preambleMs > 0) {
      const h = playBuffer(ctx, createPreambleBuffer(ctx, preambleMs));
      this._playHandle = h;
      await h.promise;
      this._playHandle = null;
    }

    const gapMs = opts.interFrameGapMs ?? 200;
    for (const [i, frame] of frames.entries()) {
      if (i > 0 && gapMs > 0) await new Promise<void>((r) => setTimeout(r, gapMs));
      const tx = this.codec.transmit(encodeFrame(frame), ctx);
      this._txHandle = tx;
      await tx.promise;
      this._txHandle = null;
    }
  }

  async playPreamble(durationMs: number): Promise<void> {
    const ctx = this.getOrCreateContext();
    if (ctx.state === 'suspended') await ctx.resume();
    const ms = durationMs > 0 ? durationMs : this.defaultPreambleMs;
    const h = playBuffer(ctx, createPreambleBuffer(ctx, ms));
    this._playHandle = h;
    await h.promise;
    this._playHandle = null;
  }

  async startListening(
    onFrame: (frame: TrilinkFrame) => void,
    onSignal?: () => void,
    onLevel?: (rms: number) => void,
  ): Promise<void> {
    if (this._rxHandle) return;

    this._stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });

    const ctx = this.getOrCreateContext();
    if (ctx.state === 'suspended') await ctx.resume();

    // Allocate ring buffer now that we know the sample rate
    this._ringRate = ctx.sampleRate;
    this._ring    = new Float32Array(Math.round(ctx.sampleRate * RING_SECS));
    this._ringPos = 0;

    const fillRing = (chunk: Float32Array) => {
      for (let i = 0; i < chunk.length; i++) {
        this._ring![this._ringPos] = chunk[i]!;
        this._ringPos = (this._ringPos + 1) % this._ring!.length;
      }
    };

    this._rxHandle = await this.codec.startReceiving(ctx, this._stream, {
      ...(onSignal !== undefined && { onStart: onSignal }),
      onEnd: (bytes) => {
        try {
          onFrame(decodeFrame(bytes));
        } catch {
          this.onDecodeError?.(bytes);
        }
      },
      ...(onLevel !== undefined && { onLevel }),
      onSamples: fillRing,
    });
  }

  async stopListening(): Promise<void> {
    this._rxHandle?.stop();
    this._rxHandle = null;
    this._stream?.getTracks().forEach((t) => t.stop());
    this._stream = null;
    this._ring    = null;
    this._ringPos = 0;
  }
}
