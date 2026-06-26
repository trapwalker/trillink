import { crc16 } from './crc16.js';
import { CrcError, TruncatedError, VersionError } from './errors.js';
import { PROTOCOL_VERSION, type TrilinkFrame } from './types.js';

// Frame layout:
//   byte 0: VER(4) | FLAGS(4)
//   byte 1: MSG_TYPE
//   byte 2: SEG_IDX(4) | SEG_TOT(4)
//   byte 3: PAYLOAD_LEN
//   bytes 4..3+N: PAYLOAD
//   last 2 bytes: CRC16 big-endian (over bytes 0..3+N)

const HEADER_SIZE = 4;
const CRC_SIZE = 2;

export function encodeFrame(frame: TrilinkFrame): Uint8Array {
  const payloadLen = frame.payload.length;
  const total = HEADER_SIZE + payloadLen + CRC_SIZE;
  const buf = new Uint8Array(total);

  const flagByte = (frame.flags.cont ? 0x01 : 0) | (frame.flags.frag ? 0x02 : 0);
  buf[0] = ((frame.version & 0x0f) << 4) | (flagByte & 0x0f);
  buf[1] = frame.msgType;
  buf[2] = frame.flags.frag
    ? (((frame.segIdx & 0x0f) << 4) | (frame.segTot & 0x0f))
    : 0x00;
  buf[3] = payloadLen;
  buf.set(frame.payload, HEADER_SIZE);

  const crcData = buf.subarray(0, HEADER_SIZE + payloadLen);
  const crc = crc16(crcData);
  buf[HEADER_SIZE + payloadLen] = (crc >> 8) & 0xff;
  buf[HEADER_SIZE + payloadLen + 1] = crc & 0xff;

  return buf;
}

export function decodeFrame(bytes: Uint8Array): TrilinkFrame {
  if (bytes.length < HEADER_SIZE + CRC_SIZE) {
    throw new TruncatedError(HEADER_SIZE + CRC_SIZE, bytes.length);
  }

  const version = (bytes[0]! >> 4) & 0x0f;
  if (version !== PROTOCOL_VERSION) {
    throw new VersionError(version);
  }

  const flagByte = bytes[0]! & 0x0f;
  const flags = {
    cont: (flagByte & 0x01) !== 0,
    frag: (flagByte & 0x02) !== 0,
  };

  const msgType = bytes[1]!;
  const segByte = bytes[2]!;
  const segIdx = (segByte >> 4) & 0x0f;
  const segTot = segByte & 0x0f;
  const payloadLen = bytes[3]!;

  const expectedTotal = HEADER_SIZE + payloadLen + CRC_SIZE;
  if (bytes.length < expectedTotal) {
    throw new TruncatedError(expectedTotal, bytes.length);
  }

  const payload = bytes.slice(HEADER_SIZE, HEADER_SIZE + payloadLen);

  const crcData = bytes.subarray(0, HEADER_SIZE + payloadLen);
  const expectedCrc = crc16(crcData);
  const actualCrc = ((bytes[HEADER_SIZE + payloadLen]! << 8) | bytes[HEADER_SIZE + payloadLen + 1]!) & 0xffff;

  if (expectedCrc !== actualCrc) {
    throw new CrcError(expectedCrc, actualCrc);
  }

  return { version, flags, msgType, segIdx, segTot, payload, crc: actualCrc };
}
