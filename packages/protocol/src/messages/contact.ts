import { PayloadError } from '../errors.js';
import { ContactType, type ContactMessage } from '../types.js';

// CONTACT payload:
//   byte 0:   contact_type (uint8)
//   bytes 1+: value (UTF-8, no NUL terminator)

const enc = new TextEncoder();
const dec = new TextDecoder();

export function encodeContact(msg: ContactMessage): Uint8Array {
  const valueBytes = enc.encode(msg.value);
  const buf = new Uint8Array(1 + valueBytes.length);
  buf[0] = msg.contactType;
  buf.set(valueBytes, 1);
  return buf;
}

export function decodeContact(payload: Uint8Array): ContactMessage {
  if (payload.length < 2) {
    throw new PayloadError(`CONTACT payload too short: ${payload.length}`);
  }
  const contactType = payload[0]! as ContactType;
  if (!Object.values(ContactType).includes(contactType)) {
    throw new PayloadError(`Unknown contact type: 0x${contactType.toString(16)}`);
  }
  const value = dec.decode(payload.subarray(1));
  return { type: 'CONTACT', contactType, value };
}
