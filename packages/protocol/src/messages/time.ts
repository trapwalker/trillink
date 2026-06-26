import { PayloadError } from '../errors.js';
import { type TimeMessage } from '../types.js';

// TIME payload: 6 bytes
//   uint32 big-endian: unix_ts (seconds since 1970-01-01T00:00:00Z)
//   int16  big-endian: tz_offset (minutes from UTC; e.g. +180 = UTC+3)

export const TIME_PAYLOAD_SIZE = 6;

export function encodeTime(msg: TimeMessage): Uint8Array {
  const buf = new DataView(new ArrayBuffer(TIME_PAYLOAD_SIZE));
  buf.setUint32(0, msg.unixTs >>> 0, false);
  buf.setInt16(4, msg.tzOffsetMin, false);
  return new Uint8Array(buf.buffer);
}

export function decodeTime(payload: Uint8Array): TimeMessage {
  if (payload.length < TIME_PAYLOAD_SIZE) {
    throw new PayloadError(`TIME payload too short: ${payload.length}`);
  }
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const unixTs = dv.getUint32(0, false);
  const tzOffsetMin = dv.getInt16(4, false);
  return { type: 'TIME', unixTs, tzOffsetMin };
}
