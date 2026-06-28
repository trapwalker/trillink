/** Encode a mono Float32 PCM buffer into a WAV Blob (16-bit PCM). */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const numSamples = samples.length;
  const buf  = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buf);

  const str = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  str(0,  'RIFF');
  view.setUint32(4,  36 + numSamples * 2, true);
  str(8,  'WAVE');
  str(12, 'fmt ');
  view.setUint32(16, 16, true);             // chunk size
  view.setUint16(20, 1,  true);             // PCM
  view.setUint16(22, 1,  true);             // mono
  view.setUint32(24, sampleRate,      true);
  view.setUint32(28, sampleRate * 2,  true);  // byte rate
  view.setUint16(32, 2,  true);             // block align
  view.setUint16(34, 16, true);             // bits per sample
  str(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(44 + i * 2, s * 0x7fff, true);
  }

  return new Blob([buf], { type: 'audio/wav' });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
