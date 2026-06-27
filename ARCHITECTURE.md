# Trillink — Software Architecture

## Overview

Trillink is a **pnpm monorepo** with a layered package structure. The protocol layer is completely decoupled from audio I/O, enabling the same codec to run in browsers, Node.js (tests), and React Native.

```
┌─────────────────────────────────────────────────────────────────┐
│  Applications                                                   │
│  apps/trillink  (Preact SPA — the main app)                    │
│  apps/cli       (Node.js CLI for roundtrip testing)            │
├─────────────────────────────────────────────────────────────────┤
│  UI helpers (coord parsing, map links)                          │
│  packages/coord-parser   parseCoord() — all formats            │
│  packages/map-providers  buildUrl() — Google/Yandex/OSM/2GIS   │
├─────────────────────────────────────────────────────────────────┤
│  UI Web Components (lower-priority; SDK is primary for apps)    │
│  packages/ui   Web Components + Preact shell                    │
├──────────────────────────┬──────────────────────────────────────┤
│  SDK (platform-agnostic) │  Audio adapters                     │
│  packages/sdk            │  packages/audio-web   (browser)     │
│  TrilinkSender           │  packages/audio-rn    (React Native)│
│  TrilinkReceiver         │                                     │
│                          │  Both implement AudioAdapter iface  │
├──────────────────────────┴──────────────────────────────────────┤
│  Protocol (zero dependencies)                                   │
│  packages/protocol                                              │
│  types · encode/decode · CRC16 · fragment reassembly · session │
└─────────────────────────────────────────────────────────────────┘
```

---

## Package manifest

| Package name           | npm name                 | Deps                                       |
|------------------------|--------------------------|--------------------------------------------|
| packages/protocol      | `@trillink/protocol`     | none                                       |
| packages/audio-web     | `@trillink/audio-web`    | `ggwave`, `@trillink/protocol`             |
| packages/audio-rn      | `@trillink/audio-rn`     | `expo-av`, `@trillink/protocol`            |
| packages/sdk           | `@trillink/sdk`          | `@trillink/protocol`                       |
| packages/coord-parser  | `@trillink/coord-parser` | none                                       |
| packages/map-providers | `@trillink/map-providers`| none                                       |
| packages/ui            | `@trillink/ui`           | `@trillink/sdk`, `@trillink/audio-web`, `preact` |
| apps/trillink          | (private)                | all packages, `leaflet`, `@preact/signals` |
| apps/cli               | (private)                | `@trillink/protocol`, `@trillink/audio-web`|

---

## Repository layout

```
trillink/
├── CLAUDE.md
├── PROTOCOL.md
├── ARCHITECTURE.md
├── PLAN.md
├── package.json            # pnpm workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json      # shared TS config
│
├── packages/
│   ├── protocol/
│   │   ├── src/
│   │   │   ├── types.ts          # MessageType enum, TrilinkMessage union, MAX_PAYLOAD
│   │   │   ├── messages/
│   │   │   │   ├── geo.ts
│   │   │   │   ├── contact.ts
│   │   │   │   ├── text.ts
│   │   │   │   ├── time.ts
│   │   │   │   └── index.ts      # encodeMessage()
│   │   │   ├── frame.ts          # encodeFrame / decodeFrame, HEADER_SIZE=6, SESSION_ID
│   │   │   ├── crc16.ts          # CRC-16/CCITT-FALSE
│   │   │   ├── session.ts        # SessionContext, buildSession(), fragment reassembly
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── audio-web/
│   │   ├── src/
│   │   │   ├── ggwave.ts         # WASM loader, singleton (used for RX)
│   │   │   ├── decoder.ts        # MediaStream → Frame[] via GGWave
│   │   │   ├── web-adapter.ts    # WebAudioAdapter implements AudioAdapter
│   │   │   ├── codec.ts          # AudioCodec interface, TxHandle, RxHandlers
│   │   │   ├── codecs/
│   │   │   │   └── dtmf-fsk.ts   # DTMF-FSK 16-tone codec (TX; RX pending)
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── audio-rn/             # React Native adapter (stub; Capacitor is current mobile path)
│   │
│   ├── sdk/
│   │   ├── src/
│   │   │   ├── sender.ts         # TrilinkSender
│   │   │   ├── receiver.ts       # TrilinkReceiver
│   │   │   ├── events.ts         # SenderEvent / ReceiverEvent unions
│   │   │   ├── adapter.ts        # AudioAdapter interface
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── coord-parser/
│   │   ├── src/
│   │   │   ├── parsers/
│   │   │   │   ├── decimal.ts    # "55.7558, 37.6176"
│   │   │   │   ├── dms.ts        # DMS with N/S/E/W
│   │   │   │   ├── geo-uri.ts    # geo:lat,lon
│   │   │   │   ├── google.ts     # maps.google.com/@lat,lon or ?q=lat,lon
│   │   │   │   ├── yandex.ts     # yandex.ru/maps with ?ll=lon,lat (reversed!)
│   │   │   │   └── osm.ts        # openstreetmap.org/?mlat=lat&mlon=lon
│   │   │   └── index.ts          # parseCoord(input, extraParsers?)
│   │   └── package.json
│   │
│   ├── map-providers/
│   │   ├── src/
│   │   │   ├── providers/
│   │   │   │   ├── google.ts
│   │   │   │   ├── yandex.ts     # ll param uses lon,lat order
│   │   │   │   ├── osm.ts
│   │   │   │   └── maps2gis.ts
│   │   │   └── index.ts          # defaultProviders[], MapProvider interface
│   │   └── package.json
│   │
│   └── ui/                   # Web Components (lower priority; not used by apps/trillink)
│
└── apps/
    ├── trillink/             # Main Preact SPA (dev: pnpm --filter trillink dev)
    │   ├── index.html
    │   ├── vite.config.ts    # aliases workspace packages → TS source
    │   └── src/
    │       ├── main.tsx
    │       ├── App.tsx
    │       ├── store/
    │       │   └── index.ts  # Preact Signals state, JournalEntry, modal state
    │       └── components/
    │           ├── Toolbar.tsx
    │           ├── Journal.tsx
    │           ├── StatusBar.tsx
    │           ├── WaterfallPanel.tsx
    │           ├── Modal.tsx
    │           ├── LeafletMap.tsx
    │           └── modals/
    │               ├── GeoSendModal.tsx
    │               ├── GeoDetailModal.tsx
    │               ├── ContactSendModal.tsx
    │               ├── TextSendModal.tsx
    │               └── TimeSendModal.tsx
    │
    └── cli/                  # Node.js CLI (roundtrip, tx, rx — no build step)
        └── src/main.ts
```

---

## @trillink/protocol — Public API

### Frame format (v1)

```
Offset  Size  Field
──────────────────────────────────────────────────────
  0      1    VER[4] | FLAGS[4]     (VER=1; FLAGS: bit0=CONT, bit1=FRAG)
  1      1    MSG_TYPE              (MessageType enum, 0x01–0x0A)
  2      1    SEG[4] | SEG_TOT[4]  (segment index and total, 0 if FRAG=0)
  3      1    PAYLOAD_LEN           (bytes in payload field)
  4      2    SESSION_ID            (uint16 big-endian; groups one transmission)
  6      N    PAYLOAD               (N = PAYLOAD_LEN, max 20 bytes)
  6+N    2    CRC16                 (over bytes 0..5+N, big-endian)
```

Total frame size: 8 + PAYLOAD_LEN bytes. MAX_PAYLOAD = 20 (GGWave max 28 − 8 overhead).

CRC: **CRC-16/CCITT-FALSE** (poly=0x1021, init=0xFFFF, no reflection, no XOR-out).

### Types

```typescript
const MAX_PAYLOAD = 20;  // bytes per frame payload

interface TrilinkFrame {
  version:   number;      // protocol version (1)
  flags:     FrameFlags;  // { cont: boolean; frag: boolean }
  msgType:   MessageType;
  segIdx:    number;
  segTot:    number;
  sessionId: number;      // uint16; 0 = unset
  payload:   Uint8Array;
  crc:       number;
}

type TrilinkMessage =
  | GeoMessage | ContactMessage | TextMessage | RadioMessage | WifiMessage
  | UrlMessage | PoiMessage | RouteMessage | BeaconMessage | TimeMessage;

interface GeoMessage     { type: 'GEO';     lat: number; lon: number; alt?: number }
interface ContactMessage { type: 'CONTACT'; contactType: ContactType; value: string }
interface TextMessage    { type: 'TEXT';    text: string }
interface TimeMessage    { type: 'TIME';    unixTs: number; tzOffsetMin: number }
```

### Session API

```typescript
// Encode message(s) into frames, assign shared random SESSION_ID
function buildSession(messages: SessionMessage[], sessionId?: number): TrilinkFrame[];

interface SessionMessage { message: TrilinkMessage; cont?: boolean; }

// Reassemble frames into messages, dedup per session
class SessionContext {
  feed(frame: TrilinkFrame): SessionFeedResult;
  reset(): void;
  pruneTimedOut(timeoutMs: number): MessageType[];
  readonly context: TrilinkMessage | null;
}
```

---

## AudioCodec interface (`@trillink/audio-web`)

Swappable modulation scheme sitting between frame bytes and the platform audio API.

```typescript
type CodecSpec = 'dtmf-fsk' | AudioCodec;

interface AudioCodec {
  readonly id:   string;
  readonly name: string;
  estimateDuration(payloadBytes: number): number;
  transmit(payload: Uint8Array, ctx: AudioContext, handlers?: TxHandlers): TxHandle;
  startReceiving(ctx: AudioContext, stream: MediaStream, handlers: RxHandlers): Promise<RxHandle>;
}

interface TxHandle {
  stop(): void;
  readonly promise: Promise<TxResult>;
}
```

### Current codec: DTMF-FSK 16-tone (`packages/audio-web/src/codecs/dtmf-fsk.ts`)

| Parameter       | Value                                   |
|----------------|-----------------------------------------|
| Sync tone      | 500 Hz, 400 ms                          |
| Data tones     | 700–2200 Hz, 100 Hz step, 16 tones      |
| Symbol         | 40 ms (36 ms tone + 4 ms silence)       |
| Fade           | 3 ms cosine ramp (click-free)           |
| Encoding       | High nibble first, 4 bits/symbol        |
| Duration       | `0.4 + N × 0.08` sec for N bytes        |

TX implemented. RX (Goertzel sync + nibble decoder) is the next priority.
GGWave is still used for RX as an interim measure.

---

## AudioAdapter interface

Implemented by `@trillink/audio-web` (`WebAudioAdapter`) and `@trillink/audio-rn`.

```typescript
interface AudioAdapter {
  play(frames: TrilinkFrame[], opts?: PlayOptions): Promise<void>;
  startListening(
    onFrame:         (frame: TrilinkFrame) => void,
    onSignalDetected?: () => void,
    onLevel?:         (rms: number) => void,
  ): Promise<void>;
  stopListening(): Promise<void>;
  readonly isListening: boolean;
  readonly analyser: AnalyserNode | undefined;  // for waterfall (web only)
}
```

---

## apps/trillink — SPA architecture

State managed entirely with **Preact Signals** (`@preact/signals`). No Context, no reducers.

```typescript
// store/index.ts
journal:        Signal<JournalEntry[]>   // newest first
isListening:    Signal<boolean>
audioLevel:     Signal<number>           // RMS 0–1
signalDetected: Signal<boolean>
isSending:      Signal<boolean>
showWaterfall:  Signal<boolean>
modal:          Signal<ModalState>
pttEnabled:     Signal<boolean>          // persisted to localStorage

interface JournalEntry {
  id:            number;
  message:       TrilinkMessage;
  direction:     'in' | 'out';
  sessionId:     number;
  ts:            Date;
  continuations: JournalEntry[];         // CONT messages attached to this entry
}

type ModalState =
  | { type: 'none' }
  | { type: 'geo-send' }
  | { type: 'geo-detail'; entry: JournalEntry }
  | { type: 'contact-send' }
  | { type: 'text-send' }
  | { type: 'time-send' };
```

Single-page layout (top-to-bottom flex column, 100dvh):
1. **Toolbar** — logo, action buttons (GEO/Contact/Text/Time), waterfall toggle, PTT
2. **WaterfallPanel** — incoming audio canvas (collapsible)
3. **StatusBar** — Start/Stop, VU meter, send progress
4. **Journal** — message list, newest first; left-border blue=incoming, green=outgoing
5. **Modals** — bottom-sheet dialogs (z-indexed over layout)

Dev server: `pnpm --filter trillink dev` → `http://0.0.0.0:5173` (LAN accessible).
Vite aliases map all workspace packages to their TypeScript source (no dist build needed in dev).

---

## @trillink/coord-parser

Parses coordinates from any common text format or URL into `{ lat, lon }`.

```typescript
function parseCoord(input: string, extraParsers?: CoordParser[]): ParsedCoord | null;
interface ParsedCoord { lat: number; lon: number; label?: string; }
```

Registry order: geo URI → Google Maps → Yandex Maps (lon,lat!) → OSM → DMS → decimal.

## @trillink/map-providers

Builds deep-link URLs for external map apps from lat/lon.

```typescript
interface MapProvider {
  readonly id:    string;
  readonly name:  string;
  readonly label: string;  // short chip label: "G", "Я", "OSM", "2Г"
  buildUrl(lat: number, lon: number, zoom?: number): string;
}
const defaultProviders: MapProvider[];  // [google, yandex, osm, maps2gis]
```

Note: Yandex `buildUrl` uses `${lon},${lat}` order in the `ll` param (reversed vs standard).

---

## Tooling

| Tool             | Purpose                            |
|-----------------|------------------------------------|
| pnpm workspaces  | Monorepo package management        |
| TypeScript 5.x   | Strict mode across all packages    |
| tsup             | Library builds (ESM + CJS + .d.ts) |
| Vite             | SPA dev server and build           |
| Vitest           | Unit and integration tests         |
| Preact           | SPA UI (~3 kB, JSX-compatible)     |
| @preact/signals  | Reactive state (no Context)        |
| Leaflet          | Offline-capable map in GEO modals  |
| GGWave WASM      | Audio modem (RX interim; TX replaced by DTMF-FSK) |
| Workbox          | Service Worker + PWA manifest (planned) |

---

## Platform notes

### Browser

- `getUserMedia` and Service Worker require **HTTPS** (except `localhost`)
- Web Audio API requires a **user gesture** before `AudioContext` can start (iOS Safari)
- AEC must be disabled: `{ echoCancellation: false, noiseSuppression: false, autoGainControl: false }` — AEC cancels the transmitted signal during same-device testing

### Mobile

- Current path: **Preact + Capacitor** (Android/iOS native wrapper around the web app)
- React Native path deferred; `@trillink/audio-rn` is a future stub
- iOS Safari: `auto-start` must show "Tap to start" fallback when user gesture is missing

### GGWave WASM

- The `.wasm` binary must be served at a stable path and cached by Service Worker
- Initialise GGWave once per page load; share the singleton
- GGWave is not thread-safe: all calls on the same thread

---

## Key risks

| Risk | Status |
|------|--------|
| DTMF-FSK RX not implemented | Next priority; GGWave RX is interim |
| GGWave PDR < 95% on walkie-talkie | Must test in Phase 2 before UI work |
| iOS Safari user-gesture restriction | Tap-to-start fallback required in UI |
| React Native audio path unclear | Deferred; Capacitor is current mobile path |
| Offline Leaflet tile caching | Deferred isolated task |
