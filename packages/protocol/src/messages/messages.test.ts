import { describe, expect, it } from 'vitest';
import { PayloadError } from '../errors.js';
import { ContactType, type GeoMessage } from '../types.js';
import { decodeContact, encodeContact } from './contact.js';
import { decodeGeo, encodeGeo, GEO_PAYLOAD_SIZE } from './geo.js';
import { decodeText, encodeText } from './text.js';
import { decodeTime, encodeTime, TIME_PAYLOAD_SIZE } from './time.js';
import { encodeMessage, decodeMessage } from './index.js';
import { MessageType } from '../types.js';

// ── GEO ──────────────────────────────────────────────────────────────────────

describe('GEO', () => {
  const msg: GeoMessage = { type: 'GEO', lat: 55.755826, lon: 37.617300 };

  it('encodes to exactly 10 bytes', () => {
    expect(encodeGeo(msg).length).toBe(GEO_PAYLOAD_SIZE);
  });

  it('round-trips lat/lon', () => {
    const decoded = decodeGeo(encodeGeo(msg));
    expect(decoded.lat).toBeCloseTo(msg.lat, 5);
    expect(decoded.lon).toBeCloseTo(msg.lon, 5);
    expect(decoded.alt).toBeUndefined();
  });

  it('round-trips with altitude', () => {
    const withAlt = { ...msg, alt: 256 };
    const decoded = decodeGeo(encodeGeo(withAlt));
    expect(decoded.alt).toBe(256);
  });

  it('preserves negative altitude', () => {
    const decoded = decodeGeo(encodeGeo({ ...msg, alt: -50 }));
    expect(decoded.alt).toBe(-50);
  });

  it('round-trips extreme coordinates', () => {
    const extreme = { type: 'GEO' as const, lat: -90, lon: 180 };
    const decoded = decodeGeo(encodeGeo(extreme));
    expect(decoded.lat).toBeCloseTo(-90, 5);
    expect(decoded.lon).toBeCloseTo(180, 5);
  });

  it('throws on short payload', () => {
    expect(() => decodeGeo(new Uint8Array(5))).toThrow(PayloadError);
  });
});

// ── CONTACT ───────────────────────────────────────────────────────────────────

describe('CONTACT', () => {
  it('round-trips a phone number', () => {
    const msg = { type: 'CONTACT' as const, contactType: ContactType.PHONE, value: '+79161234567' };
    const decoded = decodeContact(encodeContact(msg));
    expect(decoded.contactType).toBe(ContactType.PHONE);
    expect(decoded.value).toBe('+79161234567');
  });

  it('round-trips a callsign', () => {
    const msg = { type: 'CONTACT' as const, contactType: ContactType.CALLSIGN, value: 'UA3ABC' };
    const decoded = decodeContact(encodeContact(msg));
    expect(decoded.value).toBe('UA3ABC');
  });

  it('round-trips UTF-8 handle', () => {
    const msg = { type: 'CONTACT' as const, contactType: ContactType.HANDLE, value: 'Андрей' };
    const decoded = decodeContact(encodeContact(msg));
    expect(decoded.value).toBe('Андрей');
  });

  it('throws on empty payload', () => {
    expect(() => decodeContact(new Uint8Array(1))).toThrow(PayloadError);
  });

  it('throws on unknown contact type', () => {
    const bad = new Uint8Array([0xff, 0x41]);
    expect(() => decodeContact(bad)).toThrow(PayloadError);
  });
});

// ── TEXT ──────────────────────────────────────────────────────────────────────

describe('TEXT', () => {
  it('round-trips ASCII text', () => {
    const msg = { type: 'TEXT' as const, text: 'Hello!' };
    expect(decodeText(encodeText(msg)).text).toBe('Hello!');
  });

  it('round-trips Cyrillic text', () => {
    const msg = { type: 'TEXT' as const, text: 'Встречаемся здесь' };
    expect(decodeText(encodeText(msg)).text).toBe('Встречаемся здесь');
  });

  it('round-trips empty string', () => {
    const msg = { type: 'TEXT' as const, text: '' };
    expect(decodeText(encodeText(msg)).text).toBe('');
  });

  it('throws on empty payload', () => {
    expect(() => decodeText(new Uint8Array(0))).toThrow(PayloadError);
  });

  it('throws on unsupported encoding byte', () => {
    expect(() => decodeText(new Uint8Array([0x01, 0x41]))).toThrow(PayloadError);
  });
});

// ── TIME ──────────────────────────────────────────────────────────────────────

describe('TIME', () => {
  it('round-trips a timestamp with UTC+3', () => {
    const msg = { type: 'TIME' as const, unixTs: 1_700_000_000, tzOffsetMin: 180 };
    const decoded = decodeTime(encodeTime(msg));
    expect(decoded.unixTs).toBe(1_700_000_000);
    expect(decoded.tzOffsetMin).toBe(180);
  });

  it('round-trips negative UTC offset', () => {
    const msg = { type: 'TIME' as const, unixTs: 0, tzOffsetMin: -300 };
    expect(decodeTime(encodeTime(msg)).tzOffsetMin).toBe(-300);
  });

  it('encodes to exactly 6 bytes', () => {
    expect(encodeTime({ type: 'TIME', unixTs: 0, tzOffsetMin: 0 }).length).toBe(TIME_PAYLOAD_SIZE);
  });

  it('throws on short payload', () => {
    expect(() => decodeTime(new Uint8Array(3))).toThrow(PayloadError);
  });
});

// ── encodeMessage fragmentation ───────────────────────────────────────────────

describe('encodeMessage', () => {
  it('produces one frame for short text', () => {
    const frames = encodeMessage({ type: 'TEXT', text: 'Hi' });
    expect(frames.length).toBe(1);
    expect(frames[0]!.flags.frag).toBe(false);
  });

  it('fragments long text across multiple frames', () => {
    const text = 'A'.repeat(100);
    const frames = encodeMessage({ type: 'TEXT', text });
    expect(frames.length).toBeGreaterThan(1);
    frames.forEach((f, i) => {
      expect(f.flags.frag).toBe(true);
      expect(f.segIdx).toBe(i);
      expect(f.segTot).toBe(frames.length);
    });
  });

  it('sets CONT flag on all fragments', () => {
    const text = 'A'.repeat(100);
    const frames = encodeMessage({ type: 'TEXT', text }, { cont: true });
    frames.forEach((f) => expect(f.flags.cont).toBe(true));
  });

  it('single-frame GEO has no FRAG', () => {
    const frames = encodeMessage({ type: 'GEO', lat: 0, lon: 0 });
    expect(frames.length).toBe(1);
    expect(frames[0]!.flags.frag).toBe(false);
  });

  it('throws on too-large message', () => {
    // Max = 15 fragments × 20 bytes = 300 payload bytes.
    // TEXT prefix is 1 byte (encoding), so max text = 299 ASCII chars.
    const text = 'A'.repeat(400);
    expect(() => encodeMessage({ type: 'TEXT', text })).toThrow(PayloadError);
  });
});

// ── decodeMessage ─────────────────────────────────────────────────────────────

describe('decodeMessage', () => {
  it('decodes GEO from raw payload', () => {
    const msg = { type: 'GEO' as const, lat: 55.0, lon: 37.0 };
    const payload = encodeGeo(msg);
    const decoded = decodeMessage(payload, MessageType.GEO);
    expect(decoded.type).toBe('GEO');
    if (decoded.type === 'GEO') expect(decoded.lat).toBeCloseTo(55.0, 5);
  });

  it('throws for unimplemented type', () => {
    expect(() => decodeMessage(new Uint8Array(16), MessageType.BEACON)).toThrow(PayloadError);
  });
});
