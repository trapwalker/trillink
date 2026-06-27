# Trillink — Development Plan

Tasks are ordered by dependency. ✅ = done.

---

## Phase 0 — Repository bootstrap ✅

pnpm workspace, tsconfig, tsup, Vitest, package skeletons.

---

## Phase 1 — @trillink/protocol ✅

Complete zero-dependency codec:

- Types, constants, CRC-16/CCITT-FALSE
- `encodeFrame` / `decodeFrame` with full CRC validation
- Per-type payloads: GEO, CONTACT, TEXT, TIME (RADIO/WIFI/URL/POI/ROUTE/BEACON planned for v2)
- `buildSession(messages)` → ordered `TrilinkFrame[]`
- `SessionContext` with dedup, fragment reassembly, CONT chaining by SESSION_ID
- 65 unit tests, all passing

---

## Phase 2 — @trillink/audio-web ✅

DTMF-FSK 16-tone codec, Web Audio API adapter.

**Decision: GGWave replaced with custom DTMF-FSK.**
GGWave source files (`ggwave.ts`, `decoder.ts`, `encoder.ts`, `player.ts`, `preamble.ts`) remain
in the package but are unused — clean up in a future pass.

### Codec spec

- Sync: 500 Hz for 400 ms (Goertzel dominance-checked against 400/600 Hz neighbours)
- Data: 700–2200 Hz, 100 Hz step, 16 tones = 4 bits/symbol, high nibble first
- Symbol: 36 ms tone + 4 ms silence = 40 ms; 3 ms cosine fade on each edge
- Bandwidth: all tones 500–2200 Hz — safely within 300–3000 Hz of GSM/walkie-talkie

### TX ✅

`fskEncode(payload, sampleRate, amplitude): Float32Array` in `codecs/dtmf-fsk-core.ts`.
`DtmfFskCodec.transmit()` wraps it behind the `AudioCodec` interface.

### RX ✅

`FskDecoder` in `codecs/dtmf-fsk-core.ts`:
- 10 ms Goertzel window, 2 ms step
- Tone confirmed after 3 consecutive matching windows (6 ms hysteresis)
- Same-frequency consecutive symbols split by force-split at 40 ms
- End-of-message: 80 ms silence
- `reset(clearBuffer = false)`: resets FSK state, keeps audio accumulator so
  the `process()` loop continues decoding subsequent frames in the same stream

`DtmfFskCodec.startReceiving()` wraps it behind the `AudioCodec` interface.

### Adapter ✅

`WebAudioAdapter` in `web-adapter.ts`:
- `play(frames, opts)`: preamble → frames with `interFrameGapMs` between
- `startListening(onFrame, onSignal, onLevel)`: getUserMedia (echoCancellation/noiseSuppression/autoGainControl = false)
- `analyser`: AnalyserNode exposed for waterfall / VU meter

### New packages added alongside ✅

- `@trillink/coord-parser` — parse coordinates from plain text, Google/Yandex/OSM/2GIS URLs
- `@trillink/map-providers` — build map URLs for all four providers

---

## Phase 3 — @trillink/sdk ✅

- `TrilinkSender.send(messages, opts)` — buildSession → audio.play, cycle loop, abort support
- `TrilinkReceiver.start()` — audio.startListening → decodeFrame → SessionContext → events
- Events: `listening`, `signal-detected`, `message-ready`, `cycle-start`, `transmission-complete`, `aborted`
- 11 unit tests, all passing

---

## Phase 4 — apps/trillink (main SPA) ✅

Preact + Signals + Leaflet, served at localhost:5173 / LAN.

### Features done

- Waterfall (FFT frequency display, shows incoming audio only)
- VU meter (RMS level bar)
- Journal with IndexedDB persistence (flat `StoredEntry` → nested `JournalEntry[]`)
- CONT chain display (GEO + TEXT/CONTACT attachments in one card)
- GEO detail modal with Leaflet map, context markers, map links (Google/Yandex/OSM/2GIS), copy coords
- Send modals: GEO, TEXT, CONTACT, TIME
- PTT toggle (adds 700 ms preamble carrier)
- Toast notifications (Clipboard copy, 1.8 s auto-clear)
- Keyboard: Escape → close modal, Cmd/Ctrl+C → copy latest entry
- PWA: manifest, icons, Workbox service worker (cache-first, offline)
- Re-transmit button in GEO detail modal

### Features remaining

- [ ] Browser Notification API — background alerts when new message arrives (HIGH)
- [ ] QR code button in GEO detail modal
- [ ] `prefers-color-scheme` dark/light toggle in settings panel
- [ ] Beacon API for optional server-side logging
- [ ] Web Share Target API ("Share via Trillink" on Android)
- [ ] Offline Leaflet tile caching

---

## Phase 4b — apps/cli ✅

CLI tool for TX/RX/roundtrip testing without a browser.

```
tx          encode message → WAV stdout or -o file
rx          decode WAV stdin or -i file → JSON stdout
roundtrip   encode + decode in memory, verify byte-for-byte
tx-play     encode + play through speakers (afplay/aplay)
rx-live     receive from microphone via ffmpeg stdin pipe
```

Runs via `tsx` (no build step). Multi-frame sessions decode correctly.

---

## Phase 5 — @trillink/audio-rn (React Native)

Not started. Prerequisite: Phase 6 PDR validation.

### Investigation needed

1. Custom DTMF-FSK TX via `expo-av` PCM buffer — most likely path since we control the codec
2. RX: record via `expo-av`, process PCM in JS with `FskDecoder` (shared from `dtmf-fsk-core.ts`)
3. `react-native-webview` hosting a Web Audio worklet — fallback only

### RNAudioAdapter

- `play()`: `fskEncode` → Float32Array → PCM WAV → `expo-av` Sound
- `startListening()`: `expo-av` recording at 48 kHz → feed chunks to `FskDecoder`

---

## Phase 6 — PDR testing on real channels

**Goal: ≥95% PDR on all target channels.**

All testing uses DTMF-FSK (GGWave is retired).

### 6.1 CLI automated tests

Use `apps/cli` for reproducible in-process roundtrips:

```bash
pnpm --filter @trillink/cli roundtrip -- --type GEO --lat 55.7558 --lon 37.6176
pnpm --filter @trillink/cli tx -- --type GEO --lat 55 --lon 37 | pnpm --filter @trillink/cli rx
```

Synthetic degradation tests (TBD):
- Additive noise at −20 dBFS, −10 dBFS
- Playback speed ±15%
- Band-limit to 300–3000 Hz via sox

### 6.2 Physical channel tests (requires hardware)

- **Direct (same device)**: `tx-play` → `rx-live` on same machine
- **GSM**: phone A → browser `tx-play`, phone B receives → browser `rx-live`
- **Walkie-talkie**: two PMR446; browser `tx-play` → radio A TX → radio B RX → browser `rx-live`
- **VoIP**: Telegram/WhatsApp/Discord voice call between two browser tabs

Tuning levers if PDR < 95%:
1. Increase `cycles` (redundancy)
2. Adjust symbol duration / Goertzel window
3. Add Reed-Solomon outer FEC around the frame bytes
4. Increase `interFrameGapMs`

---

## Phase 7 — Polish, publish, docs

### 7.1 Package cleanup

- Remove dead GGWave code from `@trillink/audio-web` (`ggwave.ts`, `decoder.ts`, `encoder.ts`, stale exports)
- Audit all `package.json` `exports` maps

### 7.2 npm publish

- All `packages/*` under `@trillink` scope
- Semantic versioning; PROTOCOL.md version locked to package major

### 7.3 Capacitor wrapper (Android/iOS)

- `apps/capacitor/`: thin shell wrapping `apps/trillink` as a native app
- WKWebView on iOS, WebView on Android — Web Audio API available in both

### 7.4 Documentation site

- `docs/`: VitePress or Starlight
- Protocol spec (PROTOCOL.md rendered), quick-start, API reference (typedoc)

---

## Open questions / risks

| # | Question | Status |
|---|----------|--------|
| 1 | PDR via walkie-talkie with DTMF-FSK — meets 95%? | **Must test (Phase 6)** |
| 2 | PDR via GSM (8 kHz, lossy) — do 40 ms symbols survive AMR-NB? | **Must test (Phase 6)** |
| 3 | iOS WKWebView Web Audio recording latency — acceptable for FSK? | Investigate in Phase 7 |
| 4 | Multiple same-type messages in one session ambiguous (v1 limitation) | Known; fix in v2 via SESSION_SEQ |
