import type { TrilinkFrame } from '@trillink/protocol';
import { encodeFrame } from '@trillink/protocol';
import { GGWaveProtocol, getGGWave, i8ToF32 } from './ggwave.js';

export interface EncodeAudioOptions {
  protocol?: GGWaveProtocol;
  volume?: number;         // 0–100 (GGWave volume, not system volume)
  interFrameGapMs?: number;
}

/**
 * Encode Trillink frames to an AudioBuffer using GGWave.
 * The returned buffer is suitable for direct playback via AudioContext.
 */
export async function framesToAudioBuffer(
  frames: TrilinkFrame[],
  ctx: AudioContext,
  opts: EncodeAudioOptions = {},
): Promise<AudioBuffer> {
  const protocol   = opts.protocol      ?? GGWaveProtocol.AUDIBLE_FASTEST;
  const volume     = opts.volume        ?? 10;
  const gapSamples = Math.ceil(((opts.interFrameGapMs ?? 200) / 1000) * ctx.sampleRate);

  const { gw, instance } = await getGGWave(ctx.sampleRate);

  const parts: Float32Array[] = [];

  for (const frame of frames) {
    const frameBytes = encodeFrame(frame);
    const waveI8 = gw.encode(instance, frameBytes, protocol, volume) as Int8Array | null;
    if (!waveI8) throw new Error('GGWave encode returned null');

    parts.push(i8ToF32(waveI8));

    if (gapSamples > 0) {
      parts.push(new Float32Array(gapSamples)); // silence between frames
    }
  }

  const totalSamples = parts.reduce((n, p) => n + p.length, 0);
  const buffer = ctx.createBuffer(1, totalSamples, ctx.sampleRate);
  const channelData = buffer.getChannelData(0);
  let offset = 0;
  for (const part of parts) {
    channelData.set(part, offset);
    offset += part.length;
  }
  return buffer;
}
