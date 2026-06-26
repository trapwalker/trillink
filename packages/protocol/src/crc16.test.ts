import { describe, expect, it } from 'vitest';
import { crc16 } from './crc16.js';

describe('crc16', () => {
  it('produces the standard check value for "123456789"', () => {
    expect(crc16(new TextEncoder().encode('123456789'))).toBe(0x29b1);
  });

  it('returns 0xFFFF for empty input', () => {
    // init=0xFFFF, no data processed → unchanged
    expect(crc16(new Uint8Array(0))).toBe(0xffff);
  });

  it('single byte 0x00', () => {
    expect(crc16(new Uint8Array([0x00]))).toBe(0xe1f0);
  });

  it('single byte 0xFF', () => {
    // idx = (0xFF ^ 0xFF) = 0x00 → TABLE[0] = 0 → crc = (0xFFFF << 8) & 0xFFFF = 0xFF00
    expect(crc16(new Uint8Array([0xff]))).toBe(0xff00);
  });

  it('different byte sequences produce different CRCs', () => {
    const a = crc16(new Uint8Array([0x01, 0x02]));
    const b = crc16(new Uint8Array([0x02, 0x01]));
    expect(a).not.toBe(b);
  });
});
