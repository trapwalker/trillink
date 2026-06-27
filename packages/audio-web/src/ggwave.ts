// GGWave WASM singleton — loaded once per page, shared across encoder and decoder.

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — ggwave has no bundled type definitions
import ggwave_factory from 'ggwave';

export type GGWaveModule = Awaited<ReturnType<typeof ggwave_factory>>;

// Verified against ggwave@0.4.0: ProtocolId enum values
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
    // Default sampleFormatInp/Out is already F32 in ggwave@0.4.0 — keep it explicit
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const F32 = (gw as any).SampleFormat.GGWAVE_SAMPLE_FORMAT_F32;
    params.sampleFormatInp = F32;
    params.sampleFormatOut = F32;
    _instance = gw.init(params) as number;
    _sampleRate = sampleRate;
  }

  return { gw, instance: _instance };
}

/**
 * Convert GGWave encode output (Int8Array of raw F32 bytes) to Float32Array.
 * GGWave with GGWAVE_SAMPLE_FORMAT_F32 packs 4 bytes per audio sample.
 */
export function i8ToF32(src: Int8Array): Float32Array {
  return new Float32Array(src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength));
}

/**
 * Convert Float32Array from Web Audio API to raw F32 bytes for GGWave decode.
 * Inverse of i8ToF32 — no scaling, just byte reinterpretation.
 */
export function f32ToI8(src: Float32Array): Int8Array {
  return new Int8Array(src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength));
}
