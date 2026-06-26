# Trillink — Development Plan

Tasks are ordered by dependency. Complete each phase fully (including tests) before the next.

---

## Phase 0 — Repository bootstrap

- Init pnpm workspace with `pnpm-workspace.yaml`
- `tsconfig.base.json` with `strict: true`, `moduleResolution: bundler`, `target: ES2022`
- Root `package.json` with `test`, `build`, `lint` scripts delegating to all packages via `-r`
- Create package skeletons for `protocol`, `audio-web`, `sdk`, `ui`; each with own `tsconfig.json` extending base
- Configure `tsup` for library packages (ESM + CJS output, `.d.ts`)
- Configure `Vitest` at workspace root (shared config, coverage)
- `.gitignore`, `LICENSE` (MIT), `README.md` stub

---

## Phase 1 — @trillink/protocol

**Goal:** complete, fully-tested codec with no audio dependencies.

### 1.1 Types and constants

- `src/types.ts`: `MessageType` enum (all 10 values), `FrameFlags`, `TrilinkFrame`, `TrilinkMessage` union, all per-type message interfaces as specified in PROTOCOL.md §2
- `src/constants.ts`: `PROTOCOL_VERSION = 1`, `MAX_PAYLOAD = 22`, `MAX_SEGMENTS = 15`

### 1.2 CRC-16/CCITT-FALSE

- `src/crc16.ts`: pure function `crc16(data: Uint8Array): number`
- Parameters: poly=0x1021, init=0xFFFF, no reflection, no final XOR
- Verification: `crc16(new TextEncoder().encode("123456789")) === 0x29B1`
- Unit test: the check value, empty input, single byte

### 1.3 Frame encode/decode

- `src/frame.ts`:
  - `encodeFrame(frame: TrilinkFrame): Uint8Array` — serialize header + payload + CRC16
  - `decodeFrame(bytes: Uint8Array): TrilinkFrame` — parse and validate CRC; throw `CrcError` on mismatch
  - `FrameError` class hierarchy: `CrcError`, `VersionError`, `TruncatedError`
- Unit tests: round-trip for each field combination, CRC mismatch detection, truncated input

### 1.4 Per-type message serialization

One file per message type in `src/messages/`. Each exports:
```typescript
function encodePayload(msg: XxxMessage): Uint8Array
function decodePayload(bytes: Uint8Array): XxxMessage
```

MVP types first: **GEO, CONTACT, TEXT, TIME**.
Planned types after: RADIO, WIFI, URL, POI, ROUTE, BEACON.

- GEO: lat/lon int32 big-endian, alt int16 (0x7FFF = absent)
- CONTACT: type byte + UTF-8 value, validate E.164 for PHONE
- TEXT: encoding byte + UTF-8 bytes; `decodePayload` returns assembled string
- TIME: uint32 unix_ts + int16 tz_offset

Unit tests: known binary vectors for each type, round-trip, edge cases (alt absent, max length).

### 1.5 High-level encode/decode

- `src/messages/index.ts`:
  - `encodeMessage(msg, opts?): TrilinkFrame[]` — splits into fragments if payload > `opts.maxPayload` (default 22), sets FRAG + SEG fields
  - `decodeMessage(frame: TrilinkFrame): TrilinkMessage` — delegates to per-type decoder (only for non-FRAG frames or after reassembly)

### 1.6 Session context

- `src/session.ts`: `SessionContext` class as specified in ARCHITECTURE.md
  - Dedup key: `${msgType}:${segTot}:${cont}`
  - `feed(frame)` method with full state machine
  - Fragment timeout tracked via `Date.now()` (caller polls or passes a timer callback)
  - `reset()` clears all state

- `src/session.ts`: `buildSession(messages): TrilinkFrame[]`
  - Orders frames: non-CONT first, then CONT, fragments interleaved correctly
  - Returns flat ordered array ready for audio encoding

Unit tests for SessionContext: full fragment assembly, dedup, out-of-order fragments, timeout, CONT attachment.

### 1.7 Package exports

`src/index.ts` re-exports everything. Package `main`/`module`/`types` fields in `package.json`.

---

## Phase 2 — @trillink/audio-web

**Goal:** GGWave integration, browser audio I/O, no UI dependency.

### 2.1 GGWave WASM loader

- `src/ggwave.ts`: singleton loader
  - Dynamic `import('ggwave')` with await
  - Expose `getInstance(): Promise<GGWaveInstance>`
  - Cache instance; second call returns same instance
- Define TypeScript types for GGWave API (`GGWaveInstance`, protocol enum values)
- Unit test: loader resolves without error (mock WASM in test env)

### 2.2 Encoder

- `src/encoder.ts`:
  - `framesToAudioBuffer(frames: TrilinkFrame[], opts: EncoderOptions): Promise<AudioBuffer>`
  - Encodes each frame via `ggwave.encode(bytes, protocolId, volume)`
  - Concatenates audio buffers with `opts.interFrameGapMs` silence between frames
  - `opts.preambleDurationMs > 0`: prepend sine wave carrier (1500 Hz) before first frame

- `src/preamble.ts`: `generateCarrierTone(ctx: AudioContext, durationMs: number): AudioBuffer`

### 2.3 Decoder via AudioWorklet

- `worklet/ggwave-processor.ts`: `AudioWorkletProcessor` subclass
  - Accumulates PCM float32 samples from input
  - Calls `ggwave.decode(samples)` periodically (every 1024 samples)
  - Posts `{ type: 'frame', bytes: Uint8Array }` to main thread when GGWave emits a result
  - Posts `{ type: 'signal-detected' }` when GGWave reports sync found

- `src/decoder.ts`:
  - `startDecode(stream: MediaStream, onFrame, onSignal): Promise<StopFn>`
  - Sets up `AudioContext`, connects `MediaStreamSource → AudioWorkletNode`
  - Dispatches `Uint8Array` to caller; caller calls `decodeFrame()` from `@trillink/protocol`
  - Important: request `getUserMedia` with `echoCancellation: false`, `noiseSuppression: false`, `autoGainControl: false`

### 2.4 Player

- `src/player.ts`: `playBuffer(ctx: AudioContext, buffer: AudioBuffer): Promise<void>`
  - Creates `AudioBufferSourceNode`, connects to `ctx.destination`, resolves on `ended`

### 2.5 WebAudioAdapter

- `src/index.ts`: `WebAudioAdapter` class implementing `AudioAdapter` interface from ARCHITECTURE.md
  - Constructor receives `{ mode: GGWaveMode }` (default: `'AUDIBLE'`)
  - `play()`: encode frames → play buffer
  - `startListening()` / `stopListening()`: start/stop decoder
  - `playPreamble()`: generate and play carrier tone

### 2.6 GGWave mode investigation (critical)

Before completing this phase, run empirical PDR tests:
1. Direct (same device): loopback via virtual audio cable or room acoustics
2. GSM simulation: process audio with `sox` (AMR-NB filter: `rate -q 8000`, `rate -q 44100`)
3. Walkie-talkie: physical test with two handheld radios

Measure PDR for `AUDIBLE` and `AUDIBLE_FAST` modes. Adjust default in `WebAudioAdapter` based on results.

Verify GGWave `AUDIBLE` tone frequencies stay within 300–3000 Hz on both send and decode sides.

---

## Phase 3 — @trillink/sdk

**Goal:** platform-agnostic sender/receiver orchestration.

### 3.1 TrilinkSender

- `src/sender.ts`: implements `TrilinkSender` as specified in ARCHITECTURE.md
  - `send(messages)`: calls `buildSession()`, loops cycles, calls `audio.play()` per cycle
  - Emits typed events via `opts.onEvent`
  - `abort()`: sets flag, checked between frames

### 3.2 TrilinkReceiver

- `src/receiver.ts`: implements `TrilinkReceiver`
  - `start()`: calls `audio.startListening(onRawFrame)`
  - `onRawFrame`: calls `decodeFrame()` → feeds `SessionContext` → emits events
  - Fragment timeout: uses `setInterval` per buffered incomplete fragment group

### 3.3 Events

- `src/events.ts`: re-export of all event type unions (`SenderEvent`, `ReceiverEvent`)
- All event objects must be plain JSON-serializable (no class instances in `detail`)

### 3.4 Unit tests

- Mock `AudioAdapter` that returns pre-encoded frames on `startListening`
- Test full encode→decode cycle: message in → frames → audio adapter → frames back → message out
- Test fragment reassembly via sender+receiver round-trip
- Test CONT chain: GEO → TEXT with CONT=1 → verify `context-updated` event

---

## Phase 4 — @trillink/ui

**Goal:** embeddable Web Components and a Preact SPA shell.

### 4.1 Web Components

- `src/components/trillink-sender.ts`: `<trillink-sender>` custom element
  - Attributes: `types`, `cycles`, `channel` (`direct | voip | gsm | ptt`)
  - Shadow DOM with minimal form UI
  - Maps `channel` to `preambleDurationMs` and GGWave mode
  - Dispatches `trillink:sent`, `trillink:error` DOM events

- `src/components/trillink-receiver.ts`: `<trillink-receiver>` custom element
  - Attribute: `auto-start`, `channel`
  - Shows listening indicator, last received message
  - Dispatches `trillink:signal`, `trillink:fragment`, `trillink:message`, `trillink:error`
  - `auto-start` still requires user gesture on iOS; shows "Tap to start" if autostart blocked

### 4.2 Preact SPA

- `src/app/App.tsx`: tab navigation → `/send` and `/receive`
- `src/app/SendView.tsx`: message type selector → dynamic form fields → Send button → progress/status
- `src/app/ReceiveView.tsx`: Start/Stop button → signal indicator → scrollable log of received messages
- Minimal CSS, no external UI framework

### 4.3 Service Worker

- `src/sw.ts`: cache-first strategy for all static assets including `ggwave.wasm`
- Precache list generated by Workbox during build
- Offline fallback to `index.html`
- On update: `skipWaiting` + `clients.claim`

### 4.4 PWA manifest

- `public/manifest.webmanifest`: name, icons, `display: standalone`, `start_url`
- Icons: at minimum 192×192 and 512×512

### 4.5 Build

- Vite config:
  - `rollupOptions.input`: `index.html`
  - `worker`: bundle `ggwave-processor.ts` as `AudioWorklet` module
  - `assetsInlineLimit: 0`: never inline `ggwave.wasm`
  - SW registered by Workbox Vite plugin

---

## Phase 5 — @trillink/audio-rn

**Goal:** React Native audio adapter; same protocol, different I/O.

### 5.1 Investigation

Determine which of the following is viable:
1. `ggwave-react-native` — native module (ideal if maintained)
2. GGWave WASM running inside `react-native-webview` (fallback)
3. Custom AFSK implementation using `expo-av` audio buffers (last resort)

### 5.2 RNAudioAdapter

- `src/rn-adapter.ts`: `RNAudioAdapter implements AudioAdapter`
- `play()`: encode frames to PCM WAV bytes, write to temp file, play via `expo-av`
- `startListening()`: record via `expo-av`, feed PCM to GGWave decoder at intervals
- `playPreamble()`: generate sine wave PCM, write to temp file, play

### 5.3 Expo example app

- `apps/rn-example/`: minimal Expo app demonstrating send and receive
- Must work on iOS and Android

---

## Phase 6 — Integration testing and channel validation

**Goal:** verify ≥95% PDR on all target channels.

### 6.1 Automated PDR test harness

- `tests/pdr/`: Node.js scripts using `naudiodon` or pre-recorded WAV files
- Encode 100 random sessions → simulate channel degradation → decode → count valid frames
- Channels to simulate:
  - Clean (identity transform): baseline
  - GSM AMR-NB: resample to 8 kHz via `sox`, re-encode with AMR codec, decode
  - Band-limited noise: additive white noise at −20 dBFS
  - VoIP jitter: random 20–200 ms packet drops on 20 ms audio chunks

### 6.2 Physical channel tests

- Walkie-talkie: two PMR446 or CB radios; measure PDR for `AUDIBLE` and `AUDIBLE` with preamble
- GSM: two SIM-capable phones; one browser tab → call → other tab
- VoIP: Telegram/WhatsApp/Discord voice call between two browser tabs

### 6.3 Tuning

If PDR < 95% on a channel:
1. Try slower GGWave mode
2. Increase cycle count (more redundancy)
3. Investigate Reed-Solomon as outer FEC layer (wrap entire frame in RS before GGWave)
4. Increase inter-frame gap to reduce overlap distortion

Document final recommended parameters per channel in `README.md`.

---

## Phase 7 — Demo app and documentation

### 7.1 Demo SPA (apps/demo)

- Fully functional send/receive app using `@trillink/ui`
- Channel selector (direct / VoIP / GSM / PTT) that sets all parameters correctly
- QR code display of received GEO, URL, WIFI messages (using `qrcode` library)
- Hosted at GitHub Pages or similar static host

### 7.2 npm publish

- All `packages/*` published under `@trillink` npm scope
- `trillink` (no scope) as convenience meta-package re-exporting `@trillink/sdk` + `@trillink/audio-web`
- Semantic versioning; PROTOCOL.md version locked to package major version

### 7.3 Protocol documentation site

- `docs/` static site (VitePress or Starlight)
- Public-facing protocol spec (PROTOCOL.md rendered)
- Quick-start guide
- API reference (auto-generated from TypeScript types via `typedoc`)

---

## Open questions / risks (track actively)

| # | Question | Blocks |
|---|----------|--------|
| 1 | Does GGWave `AUDIBLE` mode stay within 300–3000 Hz? | Phase 2 |
| 2 | PDR via walkie-talkie with GGWave — meets 95%? | Phase 6 |
| 3 | Viable React Native GGWave integration path? | Phase 5 |
| 4 | iOS Safari user-gesture restriction — can `<trillink-receiver auto-start>` be made to work? | Phase 4 |
| 5 | Are ≤15 fragments per message enough for WIFI/URL use cases? | Phase 1 |
