# Trillink — Software Architecture

## Overview

Trillink is a **pnpm monorepo** with a layered package structure. The protocol layer is completely decoupled from audio I/O, enabling the same codec to run in browsers, Node.js (tests), and React Native.

```
┌─────────────────────────────────────────────────────────────────┐
│  Applications                                                   │
│  apps/demo  (Preact SPA using @trillink/ui + @trillink/web)    │
├─────────────────────────────────────────────────────────────────┤
│  UI layer                                                       │
│  packages/ui   Web Components + Preact SPA shell               │
├──────────────────────────┬──────────────────────────────────────┤
│  SDK (platform-agnostic) │  Audio adapters                     │
│  packages/sdk            │  packages/audio-web   (browser)     │
│  TrilinkSender           │  packages/audio-rn    (React Native)│
│  TrilinkReceiver         │                                     │
│  SessionContext          │  Both implement AudioAdapter iface  │
├──────────────────────────┴──────────────────────────────────────┤
│  Protocol (zero dependencies)                                   │
│  packages/protocol                                              │
│  types · encode/decode · CRC16 · fragment reassembly           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Package manifest

| Package name         | npm name               | Deps                        |
|---------------------|------------------------|-----------------------------|
| packages/protocol   | `@trillink/protocol`   | none                        |
| packages/audio-web  | `@trillink/audio-web`  | `ggwave`, `@trillink/protocol` |
| packages/audio-rn   | `@trillink/audio-rn`   | `expo-av`, `@trillink/protocol` |
| packages/sdk        | `@trillink/sdk`        | `@trillink/protocol`        |
| packages/ui         | `@trillink/ui`         | `@trillink/sdk`, `@trillink/audio-web`, `preact` |
| apps/demo           | (private)              | all packages                |

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
│   │   │   ├── types.ts          # MessageType enum, TrilinkMessage union
│   │   │   ├── messages/
│   │   │   │   ├── geo.ts
│   │   │   │   ├── contact.ts
│   │   │   │   ├── text.ts
│   │   │   │   ├── time.ts
│   │   │   │   ├── radio.ts      # planned
│   │   │   │   ├── wifi.ts       # planned
│   │   │   │   ├── url.ts        # planned
│   │   │   │   ├── poi.ts        # planned
│   │   │   │   ├── route.ts      # planned
│   │   │   │   └── beacon.ts     # planned
│   │   │   ├── frame.ts          # Frame encode/decode, CRC16
│   │   │   ├── crc16.ts          # CRC-16/CCITT-FALSE
│   │   │   ├── session.ts        # SessionContext, fragment reassembly
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── audio-web/
│   │   ├── src/
│   │   │   ├── ggwave.ts         # WASM loader, singleton
│   │   │   ├── encoder.ts        # Frame[] → AudioBuffer
│   │   │   ├── decoder.ts        # MediaStream → Frame[] via AudioWorklet
│   │   │   ├── player.ts         # AudioBuffer → AudioContext playback
│   │   │   ├── preamble.ts       # carrier tone generator for PTT
│   │   │   └── index.ts          # exports WebAudioAdapter
│   │   ├── worklet/
│   │   │   └── ggwave-processor.ts  # AudioWorkletProcessor
│   │   └── package.json
│   │
│   ├── audio-rn/
│   │   ├── src/
│   │   │   ├── rn-adapter.ts     # expo-av / react-native-audio integration
│   │   │   └── index.ts          # exports RNAudioAdapter
│   │   └── package.json
│   │
│   ├── sdk/
│   │   ├── src/
│   │   │   ├── sender.ts         # TrilinkSender
│   │   │   ├── receiver.ts       # TrilinkReceiver
│   │   │   ├── events.ts         # event type definitions
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── ui/
│       ├── src/
│       │   ├── components/
│       │   │   ├── trillink-sender.ts    # Web Component
│       │   │   └── trillink-receiver.ts  # Web Component
│       │   ├── app/
│       │   │   ├── App.tsx
│       │   │   ├── SendView.tsx
│       │   │   └── ReceiveView.tsx
│       │   ├── sw.ts             # Service Worker
│       │   └── index.ts
│       └── package.json
│
└── apps/
    └── demo/
        ├── index.html
        ├── vite.config.ts
        └── src/
            └── main.ts
```

---

## @trillink/protocol — Public API

### Types

```typescript
// MessageType enum
enum MessageType {
  GEO     = 0x01,
  CONTACT = 0x02,
  TEXT    = 0x03,
  RADIO   = 0x04,
  WIFI    = 0x05,
  URL     = 0x06,
  POI     = 0x07,
  ROUTE   = 0x08,
  BEACON  = 0x09,
  TIME    = 0x0A,
}

// Decoded message union (one per logical message, after fragment assembly)
type TrilinkMessage =
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

interface GeoMessage     { type: 'GEO';     lat: number; lon: number; alt?: number }
interface ContactMessage { type: 'CONTACT'; contactType: ContactType; value: string }
interface TextMessage    { type: 'TEXT';    text: string }
interface TimeMessage    { type: 'TIME';    unixTs: number; tzOffsetMin: number }
interface RadioMessage   { type: 'RADIO';   freqHz: number; mode: RadioMode; ctcssX10?: number }
interface WifiMessage    { type: 'WIFI';    security: WifiSecurity; ssid: string; password: string }
interface UrlMessage     { type: 'URL';     url: string }
interface PoiMessage     { type: 'POI';     lat: number; lon: number; alt?: number; poiId?: number }
interface RouteMessage   { type: 'ROUTE';   destLat: number; destLon: number; origLat?: number; origLon?: number }
interface BeaconMessage  { type: 'BEACON';  guid: Uint8Array }  // 16 bytes
```

### Frame encode/decode

```typescript
interface TrilinkFrame {
  version: number;       // protocol version
  flags: FrameFlags;     // { cont: boolean; frag: boolean }
  msgType: MessageType;
  segIdx: number;        // 0 if FRAG=0
  segTot: number;        // 0 if FRAG=0
  payload: Uint8Array;
  crc: number;           // uint16
}

// Encode a TrilinkMessage into one or more Frames (handles fragmentation automatically)
function encodeMessage(
  msg: TrilinkMessage,
  opts?: { cont?: boolean; maxPayload?: number }
): TrilinkFrame[];

// Encode a TrilinkFrame to raw bytes (for GGWave)
function encodeFrame(frame: TrilinkFrame): Uint8Array;

// Decode raw bytes from GGWave into a TrilinkFrame; throws on CRC mismatch
function decodeFrame(bytes: Uint8Array): TrilinkFrame;
```

### Session context

```typescript
class SessionContext {
  // Feed a decoded frame; returns assembled TrilinkMessage when ready, null otherwise
  feed(frame: TrilinkFrame): SessionFeedResult;

  // Reset all state (start of new session)
  reset(): void;

  // Current primary context message (null if none received yet)
  readonly context: TrilinkMessage | null;
}

type SessionFeedResult =
  | { status: 'buffered' }                              // fragment stored, waiting for rest
  | { status: 'duplicate' }                             // already received
  | { status: 'ready'; message: TrilinkMessage; isCont: boolean }  // complete message
  | { status: 'crc-error' }                            // should not happen (decodeFrame already checks)
```

### Session builder (sender side)

```typescript
// Build an ordered Frame[] from a set of messages for one transmission session
function buildSession(messages: SessionMessage[]): TrilinkFrame[];

interface SessionMessage {
  message: TrilinkMessage;
  cont?: boolean;  // set CONT=1 on these frames
}
```

---

## AudioCodec interface (`@trillink/audio-web`)

Sits between the frame byte layer and the platform audio API. Encapsulates one
modulation scheme. The adapter holds a codec instance; swap it to change modulation.

```typescript
// Spec accepted by WebAudioAdapter: string name or custom object
type CodecSpec = 'dtmf-fsk' | AudioCodec;

interface AudioCodec {
  readonly id: string;
  readonly name: string;
  estimateDuration(payloadBytes: number): number;   // seconds
  transmit(payload: Uint8Array, ctx: AudioContext, handlers?: TxHandlers): TxHandle;
  startReceiving(ctx: AudioContext, stream: MediaStream, handlers: RxHandlers): Promise<RxHandle>;
}

interface TxHandle {
  stop(): void;
  readonly promise: Promise<TxResult>;   // resolves when done or after stop()
}

interface TxResult { elapsedSec: number; completed: boolean; }

interface RxHandlers {
  onStart?(): void;
  /**
   * Called per received byte. Return true to declare the buffer complete early —
   * lets the protocol layer signal "frame done" without the codec knowing frame format.
   */
  onProgress?(buffer: Uint8Array, elapsedSec: number): boolean | void;
  onEnd?(buffer: Uint8Array, elapsedSec: number): void;
  onLevel?(rms: number): void;
  onError?(reason: 'framing' | 'timeout' | 'noise'): void;
}
```

### Current codec: DTMF-FSK 16-tone (`packages/audio-web/src/codecs/dtmf-fsk.ts`)

```
[SYNC 500 Hz · 400 ms] [symbol × 2N · 40 ms each]
```

| Parameter       | Value              |
|----------------|--------------------|
| Sync tone      | 500 Hz, 400 ms     |
| Data tones     | 700–2200 Hz (100 Hz step, 16 tones) |
| Symbol duration| 40 ms (36 ms tone + 4 ms silence)   |
| Fade in/out    | 3 ms cosine ramp (click-free)        |
| Encoding       | High nibble first, 4 bits/symbol     |

Duration formula: `0.4 + N × 0.08` seconds for N payload bytes (vs GGWave ~3 s).

Tones are in the 300–3000 Hz GSM/radio usable band. The 500 Hz sync frequency
is outside the data-tone range (700–2200 Hz), making it unambiguous for Goertzel
detection. RX not yet implemented — TX-only for now.

---

## AudioAdapter interface

Both `@trillink/audio-web` and `@trillink/audio-rn` implement this interface.
The SDK depends only on this interface, not on concrete adapters.

```typescript
interface AudioAdapter {
  // Encode frames as audio and play through speaker/radio output
  play(frames: TrilinkFrame[], opts?: PlayOptions): Promise<void>;

  // Start listening; decoded frames are emitted via onFrame callback
  startListening(onFrame: (frame: TrilinkFrame) => void): Promise<void>;

  stopListening(): Promise<void>;

  // Play a carrier preamble tone (for PTT/walkie-talkie)
  playPreamble(durationMs: number): Promise<void>;

  readonly isListening: boolean;
}

interface PlayOptions {
  preambleDurationMs?: number;   // 0 = no preamble (non-PTT channels)
  interFrameGapMs?: number;      // default 200
}
```

---

## @trillink/sdk — TrilinkSender / TrilinkReceiver

### TrilinkSender

```typescript
interface SenderOptions {
  audio: AudioAdapter;
  cycles?: number;              // how many transmission cycles (default: 3)
  interCycleGapMs?: number;     // gap between cycles (default: 1500)
  preambleDurationMs?: number;  // 0 for non-PTT (default: 0)
  onEvent?: (e: SenderEvent) => void;
}

class TrilinkSender {
  constructor(opts: SenderOptions);

  // Encode and transmit messages; resolves when all cycles complete
  send(messages: SessionMessage[]): Promise<void>;

  // Stop transmission after current frame
  abort(): void;
}

type SenderEvent =
  | { type: 'cycle-start'; cycle: number; total: number }
  | { type: 'frame-sent'; frame: TrilinkFrame; cycle: number }
  | { type: 'cycle-complete'; cycle: number }
  | { type: 'transmission-complete' }
  | { type: 'aborted' };
```

### TrilinkReceiver

```typescript
interface ReceiverOptions {
  audio: AudioAdapter;
  fragmentTimeoutMs?: number;   // default: 30_000
  onEvent?: (e: ReceiverEvent) => void;
}

class TrilinkReceiver {
  constructor(opts: ReceiverOptions);

  // Start continuous listening
  start(): Promise<void>;

  // Stop listening
  stop(): Promise<void>;

  // Reset session context (discard buffered fragments)
  reset(): void;

  readonly isListening: boolean;
}

type ReceiverEvent =
  | { type: 'listening' }
  | { type: 'signal-detected' }                                         // GGWave sync found
  | { type: 'frame-received'; frame: TrilinkFrame }                     // valid CRC
  | { type: 'frame-error'; reason: 'crc' | 'unknown' }                 // invalid frame
  | { type: 'fragment-received'; msgType: MessageType; segIdx: number; segTotal: number }
  | { type: 'fragment-timeout'; msgType: MessageType; received: number; total: number }
  | { type: 'message-ready'; message: TrilinkMessage; isCont: boolean } // complete message assembled
  | { type: 'context-updated'; context: TrilinkMessage; continuation: TrilinkMessage };
```

---

## @trillink/ui — Web Components

### trillink-sender

```html
<trillink-sender
  types="GEO,TEXT,CONTACT"
  cycles="3"
  channel="voip"            <!-- "direct" | "voip" | "gsm" | "ptt" -->
></trillink-sender>
```

Fires DOM events: `trillink:sent`, `trillink:error`.

### trillink-receiver

```html
<trillink-receiver
  auto-start
  channel="voip"
></trillink-receiver>
```

Fires DOM events:
- `trillink:signal` — sync detected
- `trillink:fragment` — `detail: { msgType, segIdx, segTotal }`
- `trillink:message` — `detail: TrilinkMessage`
- `trillink:error` — `detail: { reason }`

### Programmatic use (without DOM)

```typescript
import { TrilinkSender, TrilinkReceiver } from '@trillink/sdk';
import { WebAudioAdapter } from '@trillink/audio-web';

const audio = new WebAudioAdapter({ codec: 'dtmf-fsk' });

// Sender
const tx = new TrilinkSender({ audio, cycles: 3 });
await tx.send([
  { message: { type: 'GEO', lat: 55.7558, lon: 37.6176 } },
  { message: { type: 'TEXT', text: 'Встречаемся здесь' }, cont: true },
]);

// Receiver
const rx = new TrilinkReceiver({
  audio,
  onEvent(e) {
    if (e.type === 'message-ready') console.log(e.message);
  },
});
await rx.start();
```

---

## Tooling

| Tool            | Purpose                           |
|----------------|-----------------------------------|
| pnpm workspaces | Monorepo package management       |
| TypeScript 5.x  | Strict mode across all packages   |
| tsup            | Library builds (ESM + CJS + .d.ts)|
| Vite            | Demo SPA dev server and build     |
| Vitest          | Unit and integration tests        |
| Preact          | SPA UI (~3 kB, JSX-compatible)    |
| GGWave WASM     | Audio modem (`ggwave` npm package)|
| Workbox         | Service Worker + PWA manifest     |

---

## Platform notes

### Browser

- `getUserMedia` and Service Worker require **HTTPS** (except `localhost`)
- Web Audio API requires a **user gesture** before `AudioContext` can start (iOS Safari enforces strictly)
- AEC (acoustic echo cancellation): disable via `getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })` — necessary for loopback testing, recommended for all use

### React Native

- `@trillink/audio-rn` uses `expo-av` for playback and recording
- GGWave processing: run in a native module or via `react-native-ggwave` (investigate availability)
- If no native GGWave module: implement GGWave WASM inside a WebView (fallback)
- `@trillink/protocol` and `@trillink/sdk` are platform-agnostic; include them directly

### GGWave WASM loading

- The `.wasm` binary must be served at a stable path and cached by Service Worker
- Initialise GGWave once per page load; share the singleton across encoder and decoder
- GGWave is not thread-safe: all calls must be on the same thread (main or dedicated Worker)

---

## Key risks

| Risk | Mitigation |
|------|-----------|
| GGWave PDR < 95% on walkie-talkie | Test early (Phase 2); fall back to slower GGWave mode |
| GGWave frequency range incompatible with some radios | Verify default `AUDIBLE` stays within 300–3000 Hz band |
| React Native GGWave port unavailable | Use WebView + WASM fallback for RN |
| Multiple same-type messages in one session ambiguous (v1 limitation) | Document workaround; fix in v2 |
| iOS Safari user-gesture restriction breaks auto-receive | Require tap-to-start in UI; document in Web Component |
