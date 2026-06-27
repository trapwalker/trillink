import { describe, it, expect } from 'vitest';
import { fskEncode, FskDecoder, SYNC_MS, SYMBOL_MS, BASE_HZ, STEP_HZ, TONES } from './dtmf-fsk-core.js';

const SR = 48_000;

// Round-trip helper: encode payload, feed to decoder, collect decoded bytes.
function roundTrip(payload: Uint8Array, threshold = 1e-6): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const decoder = new FskDecoder(SR, {
      onEnd: (bytes) => resolve(bytes),
    }, threshold);

    const samples = fskEncode(payload, SR);
    const CHUNK = 256;
    for (let i = 0; i < samples.length; i += CHUNK) {
      decoder.process(samples.subarray(i, i + CHUNK));
    }
    decoder.flush();

    // If onEnd was not called, reject
    setTimeout(() => reject(new Error('decoder never fired onEnd')), 0);
  });
}

describe('DTMF-FSK core — TX', () => {
  it('produces the correct sample count for 0-byte payload', () => {
    const samples = fskEncode(new Uint8Array(0), SR);
    const syncN   = Math.round(SR * SYNC_MS   / 1000);
    expect(samples.length).toBe(syncN);
  });

  it('produces the correct sample count for N-byte payload', () => {
    const N       = 8;
    const syncN   = Math.round(SR * SYNC_MS   / 1000);
    const symN    = Math.round(SR * SYMBOL_MS / 1000);
    const samples = fskEncode(new Uint8Array(N), SR);
    expect(samples.length).toBe(syncN + N * 2 * symN);
  });

  it('stays within −1…+1 range', () => {
    const samples = fskEncode(new Uint8Array([0x42, 0xAB, 0xFF]), SR, 0.95);
    for (const s of samples) {
      expect(s).toBeGreaterThanOrEqual(-1.01);
      expect(s).toBeLessThanOrEqual(1.01);
    }
  });
});

describe('DTMF-FSK core — RX round-trip', () => {
  it('round-trips a single byte', async () => {
    const payload = new Uint8Array([0xA5]);
    const decoded = await roundTrip(payload);
    expect(decoded).toEqual(payload);
  });

  it('round-trips all 256 single-byte values', async () => {
    for (let b = 0; b < 256; b++) {
      const decoded = await roundTrip(new Uint8Array([b]));
      expect(decoded[0]).toBe(b);
    }
  });

  it('round-trips a short binary frame (8 bytes)', async () => {
    const payload = new Uint8Array([0x10, 0x01, 0x00, 0x03, 0x12, 0x34, 0x2A, 0x4B]);
    const decoded = await roundTrip(payload);
    expect(decoded).toEqual(payload);
  });

  it('round-trips a 20-byte payload (max)', async () => {
    const payload = new Uint8Array(20).fill(0).map((_, i) => (i * 13 + 7) & 0xFF);
    const decoded = await roundTrip(payload);
    expect(decoded).toEqual(payload);
  });

  it('round-trips all-zeros', async () => {
    const payload = new Uint8Array(10);
    const decoded = await roundTrip(payload);
    expect(decoded).toEqual(payload);
  });

  it('round-trips all-0xFF', async () => {
    const payload = new Uint8Array(10).fill(0xFF);
    const decoded = await roundTrip(payload);
    expect(decoded).toEqual(payload);
  });

  it('fires onSync before onEnd', async () => {
    const events: string[] = [];
    await new Promise<void>((resolve) => {
      const decoder = new FskDecoder(SR, {
        onSync: () => events.push('sync'),
        onEnd:  (bytes) => { events.push('end'); resolve(); },
      }, 1e-6);
      const samples = fskEncode(new Uint8Array([0x42, 0x99]), SR);
      decoder.process(samples);
      decoder.flush();
    });
    expect(events).toEqual(['sync', 'end']);
  });

  it('handles chunk boundaries at any offset', async () => {
    const payload = new Uint8Array([0x12, 0x34, 0x56, 0x78]);
    const samples = fskEncode(payload, SR);

    for (const chunkSize of [64, 128, 256, 512, 1024]) {
      const decoded = await new Promise<Uint8Array>((resolve) => {
        const dec = new FskDecoder(SR, { onEnd: resolve }, 1e-6);
        for (let i = 0; i < samples.length; i += chunkSize) {
          dec.process(samples.subarray(i, i + chunkSize));
        }
        dec.flush();
      });
      expect(decoded).toEqual(payload);
    }
  });

  it('reset() allows receiving a second message', async () => {
    const payloadA = new Uint8Array([0x11, 0x22]);
    const payloadB = new Uint8Array([0x33, 0x44]);
    const results: Uint8Array[] = [];

    const decoder = new FskDecoder(SR, {
      onEnd: (b) => results.push(new Uint8Array(b)),
    }, 1e-6);

    decoder.process(fskEncode(payloadA, SR));
    decoder.flush();
    decoder.reset();
    decoder.process(fskEncode(payloadB, SR));
    decoder.flush();

    expect(results.length).toBe(2);
    expect(results[0]).toEqual(payloadA);
    expect(results[1]).toEqual(payloadB);
  });
});

describe('DTMF-FSK core — tone frequencies', () => {
  it('data tones cover exactly 700–2200 Hz in 100 Hz steps', () => {
    expect(BASE_HZ).toBe(700);
    expect(STEP_HZ).toBe(100);
    expect(TONES).toBe(16);
    expect(BASE_HZ + (TONES - 1) * STEP_HZ).toBe(2200);
  });
});
