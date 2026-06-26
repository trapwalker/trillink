import type { TrilinkFrame } from '@trillink/protocol';
import type { AudioAdapter, PlayOptions } from '@trillink/sdk';
import { type DecoderHandle, startDecoder } from './decoder.js';
import { framesToAudioBuffer, type EncodeAudioOptions } from './encoder.js';
import { GGWaveProtocol, type GGWaveProtocol as GGWaveProtocolType } from './ggwave.js';
import { createPreambleBuffer } from './preamble.js';
import { playBuffer } from './player.js';

/**
 * Reliability preset for the transmitter.
 * Reception always auto-detects the protocol — this setting only affects TX.
 *
 *  fast     — AUDIBLE_FASTEST — best speed, good for direct/VoIP
 *  balanced — AUDIBLE_FAST   — medium, good for GSM
 *  robust   — AUDIBLE_NORMAL — slowest, most resilient, good for PTT radio
 */
export type ReliabilityMode = 'fast' | 'balanced' | 'robust';

const MODE_PROTOCOL: Record<ReliabilityMode, GGWaveProtocolType> = {
  fast:     GGWaveProtocol.AUDIBLE_FASTEST,
  balanced: GGWaveProtocol.AUDIBLE_FAST,
  robust:   GGWaveProtocol.AUDIBLE_NORMAL,
};

export interface WebAudioAdapterOptions {
  mode?: ReliabilityMode;
  /** PTT/walkie-talkie: play a carrier tone before each cycle to open squelch */
  ptt?: boolean;
  volume?: number;
}

export class WebAudioAdapter implements AudioAdapter {
  private _ctx: AudioContext | null = null;
  private _stream: MediaStream | null = null;
  private _decoder: DecoderHandle | null = null;
  private readonly protocol: GGWaveProtocolType;
  private readonly volume: number;
  private readonly defaultPreambleMs: number;

  constructor(opts: WebAudioAdapterOptions = {}) {
    this.protocol = MODE_PROTOCOL[opts.mode ?? 'fast'];
    this.volume = opts.volume ?? 10;
    this.defaultPreambleMs = opts.ptt ? 700 : 0;
  }

  get isListening(): boolean {
    return this._decoder !== null;
  }

  /** The AnalyserNode from the active decoder, for spectrum/VU meter display. */
  get analyser(): AnalyserNode | null {
    return this._decoder?.analyser ?? null;
  }

  private getOrCreateContext(): AudioContext {
    if (!this._ctx || this._ctx.state === 'closed') {
      this._ctx = new AudioContext();
    }
    return this._ctx;
  }

  async play(frames: TrilinkFrame[], opts: PlayOptions = {}): Promise<void> {
    const ctx = this.getOrCreateContext();
    if (ctx.state === 'suspended') await ctx.resume();

    const preambleMs = opts.preambleDurationMs ?? 0;
    if (preambleMs > 0) {
      await playBuffer(ctx, createPreambleBuffer(ctx, preambleMs));
    }

    const encodeOpts: EncodeAudioOptions = {
      protocol: this.protocol,
      volume: this.volume,
      interFrameGapMs: opts.interFrameGapMs ?? 200,
    };
    const buffer = await framesToAudioBuffer(frames, ctx, encodeOpts);
    await playBuffer(ctx, buffer);
  }

  async playPreamble(durationMs: number): Promise<void> {
    const ctx = this.getOrCreateContext();
    if (ctx.state === 'suspended') await ctx.resume();
    const ms = durationMs > 0 ? durationMs : this.defaultPreambleMs;
    await playBuffer(ctx, createPreambleBuffer(ctx, ms));
  }

  async startListening(
    onFrame: (frame: TrilinkFrame) => void,
    onSignal?: () => void,
    onLevel?: (rms: number) => void,
  ): Promise<void> {
    if (this._decoder) return;

    this._stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    const ctx = this.getOrCreateContext();
    if (ctx.state === 'suspended') await ctx.resume();

    this._decoder = await startDecoder(ctx, this._stream, onFrame, {
      ...(onSignal !== undefined && { onSignal }),
      ...(onLevel !== undefined && { onLevel }),
      onError: () => {},
    });
  }

  async stopListening(): Promise<void> {
    this._decoder?.stop();
    this._decoder = null;
    this._stream?.getTracks().forEach((t) => t.stop());
    this._stream = null;
  }
}
