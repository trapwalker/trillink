import { PayloadError } from '../errors.js';
import { ALT_ABSENT, type GeoMessage } from '../types.js';

// GEO payload: 10 bytes
//   lat:  int32 big-endian  (degrees × 1_000_000)
//   lon:  int32 big-endian  (degrees × 1_000_000)
//   alt:  int16 big-endian  (meters; 0x7FFF = absent)

export const GEO_PAYLOAD_SIZE = 10;

export function encodeGeo(msg: GeoMessage): Uint8Array {
  const buf = new DataView(new ArrayBuffer(GEO_PAYLOAD_SIZE));
  buf.setInt32(0, Math.round(msg.lat * 1_000_000), false);
  buf.setInt32(4, Math.round(msg.lon * 1_000_000), false);
  buf.setInt16(8, msg.alt !== undefined ? msg.alt : ALT_ABSENT, false);
  return new Uint8Array(buf.buffer);
}

export function decodeGeo(payload: Uint8Array): GeoMessage {
  if (payload.length < GEO_PAYLOAD_SIZE) {
    throw new PayloadError(`GEO payload too short: ${payload.length}`);
  }
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const lat = dv.getInt32(0, false) / 1_000_000;
  const lon = dv.getInt32(4, false) / 1_000_000;
  const rawAlt = dv.getInt16(8, false);
  const alt = rawAlt === ALT_ABSENT ? undefined : rawAlt;
  return { type: 'GEO', lat, lon, ...(alt !== undefined && { alt }) };
}
