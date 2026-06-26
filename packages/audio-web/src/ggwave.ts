// GGWave WASM singleton — loaded once per page, shared across encoder and decoder.

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — ggwave has no bundled type definitions
import ggwave_factory from 'ggwave';

export type GGWaveModule = Awaited<ReturnType<typeof ggwave_factory>>;

export const GGWaveProtocol = {
  AUDIBLE_NORMAL:   0,
  AUDIBLE_FAST:     1,
  AUDIBLE_FASTEST:  2,
} as const;
export type GGWaveProtocol = (typeof GGWaveProtocol)[keyof typeof GGWaveProtocol];

let _modulePromise: Promise<GGWaveModule> | null = null;
let _instance: number | null = null;
let _sampleRate = 48_000;

function loadModule(): Promise<GGWaveModule> {
  if (!_modulePromise) {
    _modulePromise = ggwave_factory() as Promise<GGWaveModule>;
  }
  return _modulePromise;
}

export async function getGGWave(sampleRate = 48_000): Promise<{ gw: GGWaveModule; instance: number }> {
  const gw = await loadModule();

  if (_instance === null || _sampleRate !== sampleRate) {
    if (_instance !== null) gw.free(_instance);
    const params = gw.getDefaultParameters();
    params.sampleRateInp = sampleRate;
    params.sampleRateOut = sampleRate;
    params.sampleRate = sampleRate;
    _instance = gw.init(params) as number;
    _sampleRate = sampleRate;
  }

  return { gw, instance: _instance };
}

/** Convert the Int8Array from GGWave encode to Float32 for Web Audio API (−1.0..1.0). */
export function i8ToF32(src: Int8Array): Float32Array {
  const dst = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) dst[i] = (src[i] ?? 0) / 128.0;
  return dst;
}

/** Convert Float32 samples from Web Audio API to Int8 for GGWave decode. */
export function f32ToI8(src: Float32Array): Int8Array {
  const dst = new Int8Array(src.length);
  for (let i = 0; i < src.length; i++) {
    dst[i] = Math.max(-128, Math.min(127, Math.round((src[i] ?? 0) * 128.0)));
  }
  return dst;
}
