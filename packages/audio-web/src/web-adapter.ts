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
}

function resolveCodec(spec: CodecSpec, amplitude: number): AudioCodec {
  if (typeof spec === 'object') return spec;
  return new DtmfFskCodec({ amplitude });
}

export class WebAudioAdapter implements AudioAdapter {
  private _ctx: AudioContext | null = null;
  private _stream: MediaStream | null = null;
  private _rxHandle: RxHandle | null = null;
  private _playHandle: PlayHandle | null = null;
  private _txHandle: TxHandle | null = null;

  private readonly codec: AudioCodec;
  private readonly defaultPreambleMs: number;

  constructor(opts: WebAudioAdapterOptions = {}) {
    const amplitude = (opts.volume ?? 60) / 100;
    this.codec = resolveCodec(opts.codec ?? 'dtmf-fsk', amplitude);
    this.defaultPreambleMs = opts.ptt ? 700 : 0;
    if (opts.ctx) this._ctx = opts.ctx;
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

    this._rxHandle = await this.codec.startReceiving(ctx, this._stream, {
      ...(onSignal !== undefined && { onStart: onSignal }),
      onEnd: (bytes) => {
        try { onFrame(decodeFrame(bytes)); } catch { /* CRC / framing error */ }
      },
      ...(onLevel !== undefined && { onLevel }),
    });
  }

  async stopListening(): Promise<void> {
    this._rxHandle?.stop();
    this._rxHandle = null;
    this._stream?.getTracks().forEach((t) => t.stop());
    this._stream = null;
  }
}
