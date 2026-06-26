import { PayloadError } from '../errors.js';
import { type TextMessage } from '../types.js';

// TEXT payload:
//   byte 0:   encoding (0x00 = UTF-8)
//   bytes 1+: text bytes

const ENCODING_UTF8 = 0x00;
const enc = new TextEncoder();
const dec = new TextDecoder();

export function encodeText(msg: TextMessage): Uint8Array {
  const textBytes = enc.encode(msg.text);
  const buf = new Uint8Array(1 + textBytes.length);
  buf[0] = ENCODING_UTF8;
  buf.set(textBytes, 1);
  return buf;
}

export function decodeText(payload: Uint8Array): TextMessage {
  if (payload.length < 1) {
    throw new PayloadError('TEXT payload empty');
  }
  const encoding = payload[0]!;
  if (encoding !== ENCODING_UTF8) {
    throw new PayloadError(`Unsupported TEXT encoding: 0x${encoding.toString(16)}`);
  }
  const text = dec.decode(payload.subarray(1));
  return { type: 'TEXT', text };
}
