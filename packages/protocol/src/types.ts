export const PROTOCOL_VERSION = 1 as const;
export const MAX_PAYLOAD = 22 as const;
export const MAX_SEGMENTS = 15 as const;
export const ALT_ABSENT = 0x7fff as const;
export const COORD_ABSENT = 0x7fffffff as const;
export const POI_ID_ABSENT = 0x00000000 as const;

export enum MessageType {
  GEO     = 0x01,
  CONTACT = 0x02,
  TEXT    = 0x03,
  RADIO   = 0x04,
  WIFI    = 0x05,
  URL     = 0x06,
  POI     = 0x07,
  ROUTE   = 0x08,
  BEACON  = 0x09,
  TIME    = 0x0a,
}

export enum ContactType {
  PHONE    = 0x01,
  EMAIL    = 0x02,
  CALLSIGN = 0x03,
  HANDLE   = 0x04,
}

export enum RadioMode {
  FM    = 0x00,
  AM    = 0x01,
  NFM   = 0x02,
  USB   = 0x03,
  LSB   = 0x04,
  DMR   = 0x05,
  DSTAR = 0x06,
  C4FM  = 0x07,
  P25   = 0x08,
}

export enum WifiSecurity {
  OPEN     = 0x00,
  WEP      = 0x01,
  WPA_WPA2 = 0x02,
  WPA3     = 0x03,
}

export interface FrameFlags {
  cont: boolean;
  frag: boolean;
}

export interface TrilinkFrame {
  version: number;
  flags: FrameFlags;
  msgType: MessageType;
  segIdx: number;
  segTot: number;
  payload: Uint8Array;
  crc: number;
}

// ── Per-type message interfaces ───────────────────────────────────────────────

export interface GeoMessage {
  type: 'GEO';
  lat: number;
  lon: number;
  alt?: number;
}

export interface ContactMessage {
  type: 'CONTACT';
  contactType: ContactType;
  value: string;
}

export interface TextMessage {
  type: 'TEXT';
  text: string;
}

export interface RadioMessage {
  type: 'RADIO';
  freqHz: number;
  mode: RadioMode;
  ctcssX10?: number;
}

export interface WifiMessage {
  type: 'WIFI';
  security: WifiSecurity;
  ssid: string;
  password: string;
}

export interface UrlMessage {
  type: 'URL';
  url: string;
}

export interface PoiMessage {
  type: 'POI';
  lat: number;
  lon: number;
  alt?: number;
  poiId?: number;
}

export interface RouteMessage {
  type: 'ROUTE';
  destLat: number;
  destLon: number;
  origLat?: number;
  origLon?: number;
}

export interface BeaconMessage {
  type: 'BEACON';
  guid: Uint8Array;
}

export interface TimeMessage {
  type: 'TIME';
  unixTs: number;
  tzOffsetMin: number;
}

export type TrilinkMessage =
  | GeoMessage
  | ContactMessage
  | TextMessage
  | RadioMessage
  | WifiMessage
  | UrlMessage
  | PoiMessage
  | RouteMessage
  | BeaconMessage
  | TimeMessage;
