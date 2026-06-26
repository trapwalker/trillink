import type { TrilinkFrame } from '@trillink/protocol';
import type { AudioAdapter, PlayOptions } from '@trillink/sdk';
import type { StopListening } from './decoder.js';
import { startDecoder } from './decoder.js';
import { framesToAudioBuffer, type EncodeAudioOptions } from './encoder.js';
import { createPreambleBuffer } from './preamble.js';
import { playBuffer } from './player.js';
import { GGWaveProtocol, type GGWaveProtocol as GGWaveProtocolType } from './ggwave.js';

export type AudioChannel = 'direct' | 'voip' | 'gsm' | 'ptt';

const CHANNEL_PROTOCOL: Record<AudioChannel, GGWaveProtocolType> = {
  direct: GGWaveProtocol.AUDIBLE_FASTEST,
  voip:   GGWaveProtocol.AUDIBLE_FAST,
  gsm:    GGWaveProtocol.AUDIBLE_NORMAL,
  ptt:    GGWaveProtocol.AUDIBLE_NORMAL,
};

const CHANNEL_PREAMBLE_MS: Record<AudioChannel, number> = {
  direct: 0,
  voip:   0,
  gsm:    0,
  ptt:    700,
};

export interface WebAudioAdapterOptions {
  channel?: AudioChannel;
  protocol?: GGWaveProtocolType;
  volume?: number;
}

/**
 * Browser AudioAdapter implementation using GGWave WASM and Web Audio API.
 *
 * Requires HTTPS (or localhost) and a prior user gesture before start().
 * Pass getUserMedia with echoCancellation/noiseSuppression/autoGainControl all false.
 */
export class WebAudioAdapter implements AudioAdapter {
  private _ctx: AudioContext | null = null;
  private _stream: MediaStream | null = null;
  private _stopListening: StopListening | null = null;
  private readonly encodeOpts: EncodeAudioOptions;
  private readonly defaultPreambleMs: number;

  constructor(opts: WebAudioAdapterOptions = {}) {
    const channel = opts.channel ?? 'voip';
    this.encodeOpts = {
      protocol: opts.protocol ?? CHANNEL_PROTOCOL[channel],
      volume: opts.volume ?? 10,
    };
    this.defaultPreambleMs = CHANNEL_PREAMBLE_MS[channel];
  }

  get isListening(): boolean {
    return this._stopListening !== null;
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

    const buffer = await framesToAudioBuffer(frames, ctx, {
      ...this.encodeOpts,
      interFrameGapMs: opts.interFrameGapMs ?? 200,
    });
    await playBuffer(ctx, buffer);
  }

  async playPreamble(durationMs: number): Promise<void> {
    const ctx = this.getOrCreateContext();
    if (ctx.state === 'suspended') await ctx.resume();
    await playBuffer(ctx, createPreambleBuffer(ctx, durationMs > 0 ? durationMs : this.defaultPreambleMs));
  }

  async startListening(
    onFrame: (frame: TrilinkFrame) => void,
    onSignal?: () => void,
  ): Promise<void> {
    if (this._stopListening) return;

    this._stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    const ctx = this.getOrCreateContext();
    if (ctx.state === 'suspended') await ctx.resume();

    this._stopListening = await startDecoder(ctx, this._stream, onFrame, onSignal);
  }

  async stopListening(): Promise<void> {
    if (this._stopListening) {
      this._stopListening();
      this._stopListening = null;
    }
    if (this._stream) {
      this._stream.getTracks().forEach((t) => t.stop());
      this._stream = null;
    }
  }
}
