// Generates a carrier sine-wave tone for PTT/walkie-talkie VOX activation.
// Must be played before the first GGWave frame each cycle.

const PREAMBLE_FREQ = 1500; // Hz — within all target channel bandwidths
const PREAMBLE_AMP  = 0.5;  // −6 dBFS

export function createPreambleBuffer(ctx: AudioContext, durationMs: number): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.ceil((durationMs / 1000) * sampleRate);
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  const twoPiF = (2 * Math.PI * PREAMBLE_FREQ) / sampleRate;
  for (let i = 0; i < length; i++) {
    data[i] = PREAMBLE_AMP * Math.sin(twoPiF * i);
  }
  return buffer;
}
