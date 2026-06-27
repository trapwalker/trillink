/** Minimal WAV encoder/decoder — 16-bit signed PCM mono. */

export function writeWav(samples: Float32Array, sampleRate: number): Buffer {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    pcm[i] = Math.round(Math.max(-1, Math.min(1, samples[i]!)) * 32767);
  }

  const dataBytes = pcm.byteLength;
  const buf = Buffer.alloc(44 + dataBytes);
  let o = 0;

  buf.write('RIFF', o); o += 4;
  buf.writeUInt32LE(36 + dataBytes, o); o += 4;
  buf.write('WAVE', o); o += 4;
  buf.write('fmt ', o); o += 4;
  buf.writeUInt32LE(16, o); o += 4;           // chunk size
  buf.writeUInt16LE(1, o); o += 2;            // PCM
  buf.writeUInt16LE(1, o); o += 2;            // mono
  buf.writeUInt32LE(sampleRate, o); o += 4;
  buf.writeUInt32LE(sampleRate * 2, o); o += 4; // byte rate
  buf.writeUInt16LE(2, o); o += 2;            // block align
  buf.writeUInt16LE(16, o); o += 2;           // bits per sample
  buf.write('data', o); o += 4;
  buf.writeUInt32LE(dataBytes, o); o += 4;
  Buffer.from(pcm.buffer).copy(buf, o);

  return buf;
}

export function readWav(data: Buffer): { samples: Float32Array; sampleRate: number } {
  if (data.toString('ascii', 0, 4) !== 'RIFF') throw new Error('Not a RIFF file');
  if (data.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Not a WAVE file');

  let off = 12;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let audioFormat = 0;
  let channels = 1;
  let dataStart = 0;
  let dataSize = 0;

  while (off + 8 <= data.length) {
    const id   = data.toString('ascii', off, off + 4);
    const size = data.readUInt32LE(off + 4);

    if (id === 'fmt ') {
      audioFormat  = data.readUInt16LE(off + 8);
      channels     = data.readUInt16LE(off + 10);
      sampleRate   = data.readUInt32LE(off + 12);
      bitsPerSample = data.readUInt16LE(off + 22);
    } else if (id === 'data') {
      dataStart = off + 8;
      dataSize  = size;
      break;
    }
    off += 8 + size + (size & 1); // word-align
  }

  if (!sampleRate) throw new Error('No fmt chunk in WAV');
  if (!dataStart)  throw new Error('No data chunk in WAV');

  const frames  = Math.floor(dataSize / (bitsPerSample / 8) / channels);
  const samples = new Float32Array(frames);

  if (audioFormat === 1 && bitsPerSample === 16) {
    for (let i = 0; i < frames; i++) {
      samples[i] = data.readInt16LE(dataStart + i * channels * 2) / 32768;
    }
  } else if (audioFormat === 3 && bitsPerSample === 32) {
    for (let i = 0; i < frames; i++) {
      samples[i] = data.readFloatLE(dataStart + i * channels * 4);
    }
  } else {
    throw new Error(`Unsupported WAV format: audioFormat=${audioFormat} bits=${bitsPerSample}`);
  }

  return { samples, sampleRate };
}
