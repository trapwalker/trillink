import { describe, expect, it } from 'vitest';
import { CrcError, TruncatedError, VersionError } from './errors.js';
import { decodeFrame, encodeFrame } from './frame.js';
import { MessageType, PROTOCOL_VERSION } from './types.js';

const baseFrame = {
  version: PROTOCOL_VERSION,
  flags: { cont: false, frag: false },
  msgType: MessageType.GEO,
  segIdx: 0,
  segTot: 0,
  sessionId: 0x1234,
  payload: new Uint8Array([0x01, 0x02, 0x03]),
  crc: 0,
};

describe('encodeFrame / decodeFrame', () => {
  it('round-trips a basic frame', () => {
    const encoded = encodeFrame(baseFrame);
    const decoded = decodeFrame(encoded);

    expect(decoded.version).toBe(PROTOCOL_VERSION);
    expect(decoded.flags).toEqual({ cont: false, frag: false });
    expect(decoded.msgType).toBe(MessageType.GEO);
    expect(decoded.sessionId).toBe(0x1234);
    expect(decoded.payload).toEqual(baseFrame.payload);
  });

  it('round-trips CONT flag', () => {
    const encoded = encodeFrame({ ...baseFrame, flags: { cont: true, frag: false } });
    const decoded = decodeFrame(encoded);
    expect(decoded.flags.cont).toBe(true);
    expect(decoded.flags.frag).toBe(false);
  });

  it('round-trips FRAG flag with segment fields', () => {
    const frame = {
      ...baseFrame,
      flags: { cont: false, frag: true },
      segIdx: 2,
      segTot: 5,
    };
    const decoded = decodeFrame(encodeFrame(frame));
    expect(decoded.flags.frag).toBe(true);
    expect(decoded.segIdx).toBe(2);
    expect(decoded.segTot).toBe(5);
  });

  it('sets SEG byte to 0x00 when FRAG is false', () => {
    const encoded = encodeFrame({ ...baseFrame, segIdx: 3, segTot: 7 });
    expect(encoded[2]).toBe(0x00);
  });

  it('round-trips empty payload', () => {
    const frame = { ...baseFrame, payload: new Uint8Array(0) };
    const decoded = decodeFrame(encodeFrame(frame));
    expect(decoded.payload.length).toBe(0);
  });

  it('round-trips all message types', () => {
    for (const msgType of Object.values(MessageType).filter((v) => typeof v === 'number')) {
      const frame = { ...baseFrame, msgType: msgType as MessageType };
      expect(decodeFrame(encodeFrame(frame)).msgType).toBe(msgType);
    }
  });

  it('throws CrcError on corrupted byte', () => {
    const encoded = encodeFrame(baseFrame);
    encoded[4] ^= 0xff;
    expect(() => decodeFrame(encoded)).toThrow(CrcError);
  });

  it('throws TruncatedError when frame is too short', () => {
    // Min frame = 8 bytes (6 header + 0 payload + 2 CRC); 7 bytes is too short
    expect(() => decodeFrame(new Uint8Array([0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00]))).toThrow(TruncatedError);
  });

  it('throws VersionError for unknown protocol version', () => {
    const encoded = encodeFrame(baseFrame);
    encoded[0] = (encoded[0]! & 0x0f) | (0x09 << 4);
    expect(() => decodeFrame(encoded)).toThrow(VersionError);
  });

  it('frame size equals 8 + payload length', () => {
    const payload = new Uint8Array(10);
    const encoded = encodeFrame({ ...baseFrame, payload });
    expect(encoded.length).toBe(8 + 10);
  });

  it('CRC covers header and payload', () => {
    const a = encodeFrame(baseFrame);
    const b = encodeFrame({ ...baseFrame, msgType: MessageType.CONTACT });
    const crcA = ((a[a.length - 2]! << 8) | a[a.length - 1]!);
    const crcB = ((b[b.length - 2]! << 8) | b[b.length - 1]!);
    expect(crcA).not.toBe(crcB);
  });
});
