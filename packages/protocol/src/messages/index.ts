import { PayloadError } from '../errors.js';
import {
  MAX_PAYLOAD,
  MAX_SEGMENTS,
  PROTOCOL_VERSION,
  type TrilinkFrame,
  type TrilinkMessage,
  MessageType,
} from '../types.js';
import { decodeContact, encodeContact } from './contact.js';
import { decodeGeo, encodeGeo } from './geo.js';
import { decodeText, encodeText } from './text.js';
import { decodeTime, encodeTime } from './time.js';

export interface EncodeOptions {
  cont?: boolean;
  maxPayload?: number;
}

function encodePayload(msg: TrilinkMessage): Uint8Array {
  switch (msg.type) {
    case 'GEO':     return encodeGeo(msg);
    case 'CONTACT': return encodeContact(msg);
    case 'TEXT':    return encodeText(msg);
    case 'TIME':    return encodeTime(msg);
    default:
      throw new PayloadError(`Encoding not implemented for type: ${(msg as TrilinkMessage).type}`);
  }
}

function msgTypeToEnum(type: TrilinkMessage['type']): MessageType {
  const map: Record<TrilinkMessage['type'], MessageType> = {
    GEO:     MessageType.GEO,
    CONTACT: MessageType.CONTACT,
    TEXT:    MessageType.TEXT,
    RADIO:   MessageType.RADIO,
    WIFI:    MessageType.WIFI,
    URL:     MessageType.URL,
    POI:     MessageType.POI,
    ROUTE:   MessageType.ROUTE,
    BEACON:  MessageType.BEACON,
    TIME:    MessageType.TIME,
  };
  return map[type];
}

export function encodeMessage(msg: TrilinkMessage, opts: EncodeOptions = {}): TrilinkFrame[] {
  const cont = opts.cont ?? false;
  const maxPayload = opts.maxPayload ?? MAX_PAYLOAD;
  const fullPayload = encodePayload(msg);
  const msgType = msgTypeToEnum(msg.type);

  if (fullPayload.length <= maxPayload) {
    return [{
      version: PROTOCOL_VERSION,
      flags: { cont, frag: false },
      msgType,
      segIdx: 0,
      segTot: 0,
      payload: fullPayload,
      crc: 0,
    }];
  }

  // Fragment
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < fullPayload.length; offset += maxPayload) {
    chunks.push(fullPayload.slice(offset, offset + maxPayload));
  }

  if (chunks.length > MAX_SEGMENTS) {
    throw new PayloadError(
      `Message too large: ${chunks.length} fragments needed, max is ${MAX_SEGMENTS}`
    );
  }

  return chunks.map((chunk, i) => ({
    version: PROTOCOL_VERSION,
    flags: { cont, frag: true },
    msgType,
    segIdx: i,
    segTot: chunks.length,
    payload: chunk,
    crc: 0,
  }));
}

export function decodeMessage(payload: Uint8Array, msgType: MessageType): TrilinkMessage {
  switch (msgType) {
    case MessageType.GEO:     return decodeGeo(payload);
    case MessageType.CONTACT: return decodeContact(payload);
    case MessageType.TEXT:    return decodeText(payload);
    case MessageType.TIME:    return decodeTime(payload);
    default:
      throw new PayloadError(`Decoding not implemented for type: 0x${msgType.toString(16)}`);
  }
}

export * from './geo.js';
export * from './contact.js';
export * from './text.js';
export * from './time.js';
