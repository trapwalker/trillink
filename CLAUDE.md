# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: Trillink

Open protocol and SDK for transmitting short structured messages over any voice audio channel — GSM phone calls, PTT/walkie-talkie radio, VoIP, or direct speaker→microphone — entirely in the browser without internet connectivity.

The protocol is designed as a public standard ("народный стандарт"): fully open, versioned, embeddable in any web or React Native application.

**Key documents (read before writing any code):**
- `PROTOCOL.md` — binary wire format, all message types, cyclic transmission rules
- `ARCHITECTURE.md` — package structure, TypeScript API contracts, platform adapter interface
- `PLAN.md` — phased development tasks in dependency order

---

## Repository structure

pnpm monorepo. Packages in dependency order:

```
packages/protocol/       @trillink/protocol      — zero-dep codec: encode/decode/CRC/session
packages/audio-web/      @trillink/audio-web     — DTMF-FSK codec + Web Audio API adapter
packages/audio-rn/       @trillink/audio-rn      — React Native audio adapter (expo-av)
packages/sdk/            @trillink/sdk           — TrilinkSender / TrilinkReceiver (platform-agnostic)
packages/coord-parser/   @trillink/coord-parser  — parse coordinates from any format/URL
packages/map-providers/  @trillink/map-providers — build map URLs for Google, Yandex, OSM, 2GIS
packages/ui/             @trillink/ui            — Web Components + Service Worker
apps/trillink/           (private)               — main SPA (Preact + Signals + Leaflet)
apps/cli/                (private)               — CLI for TX/RX/roundtrip testing
```

---

## Commands

```bash
pnpm install                                    # install all workspace deps
pnpm -r build                                   # build all packages
pnpm -r test                                    # run all tests
pnpm --filter @trillink/protocol test           # test one package
pnpm --filter @trillink/protocol test -- --watch  # watch mode
pnpm --filter trillink dev                      # app dev server (localhost + LAN)
pnpm --filter @trillink/ui build                # build UI package

# CLI tool (apps/cli) — no build step needed, tsx runs TypeScript directly
pnpm --filter @trillink/cli roundtrip -- --type GEO --lat 55.7558 --lon 37.6176
pnpm --filter @trillink/cli roundtrip -- --type GEO --lat 55.7558 --lon 37.6176 --debug
pnpm --filter @trillink/cli tx -- --type TEXT --text "hello" -o signal.wav
pnpm --filter @trillink/cli rx -- -i signal.wav --debug
# Pipe: tx → rx
pnpm --filter @trillink/cli tx -- --type GEO --lat 55 --lon 37 | pnpm --filter @trillink/cli rx
```

---

## Protocol version

Current: **v1**. The `VER` nibble in every frame header encodes this. Breaking wire-format changes require bumping VER. The protocol is a public standard — backwards compatibility of decoders is mandatory once v1 is published.

---

## Critical implementation constraints

### Frame size
Maximum audio-codec payload: **28 bytes** per frame. `MAX_PAYLOAD = 20` bytes for message payload (8 bytes overhead: 6-byte header + 2-byte CRC). Never produce frames larger than 28 bytes.

Frame layout: `VER|FLAGS` · `MSG_TYPE` · `SEG_IDX|SEG_TOT` · `PAYLOAD_LEN` · `SESSION_ID[2]` · `PAYLOAD[N]` · `CRC16[2]`

### CRC specification
**CRC-16/CCITT-FALSE**: poly=0x1021, init=0xFFFF, no reflection, no final XOR.
Check value: `crc16("123456789") === 0x29B1`.
CRC is computed over `frame[0 .. 5+PAYLOAD_LEN]`, appended big-endian.

### Integer encoding
All multi-byte integers in frame payloads: **big-endian**.

### Coordinates
`lat` and `lon` are stored as `int32 = degrees × 1_000_000`. Precision ~0.11 m at equator.
Sentinel for absent `alt` (int16): `0x7FFF`.
Sentinel for absent `orig_lat`/`orig_lon` in ROUTE (int32): `0x7FFFFFFF`.

### Audio channel bandwidth
All target channels (GSM, walkie-talkie, VoIP): usable range ~300–3000 Hz.
All codec tones must stay within this band. Never use ULTRASONIC modes.

### Codec layer (decided, replaces GGWave for TX)
GGWave was replaced with a swappable `AudioCodec` abstraction.

**Default codec: DTMF-FSK 16-tone** (`packages/audio-web/src/codecs/dtmf-fsk.ts`):
- Sync: 500 Hz for 400 ms (outside data range, Goertzel-detectable)
- Data tones: 700–2200 Hz, 100 Hz step, 16 tones = 4 bits/symbol
- Symbol: 36 ms tone + 4 ms silence = 40 ms total; 3 ms cosine fade
- Encoding: high nibble first per byte
- Duration: `0.4 + N × 0.08` seconds for N payload bytes
- TX implemented; RX not yet implemented

**`CodecSpec`** = `'dtmf-fsk' | AudioCodec`. String = default options, object = custom.
`TxHandle` has both `.stop()` and `.promise: Promise<TxResult>` — both await and abort patterns work.

GGWave is still used for RX (`decoder.ts`, `ggwave.ts`) until FSK RX is implemented.

### PTT/walkie-talkie preamble
Before the first frame in each cycle: play a **1500 Hz sine wave at −6 dBFS for 600–800 ms**.
Purpose: open remote squelch, activate VOX, allow AGC to settle.
Skip preamble for non-PTT channels (`preambleDurationMs = 0`).

### getUserMedia flags
Always request microphone with:
```javascript
{ echoCancellation: false, noiseSuppression: false, autoGainControl: false }
```
AEC would cancel the transmitted signal during same-device testing.

### iOS Safari
Web Audio API requires a user gesture before `AudioContext` can start.
`auto-start` attribute on `<trillink-receiver>` must show "Tap to start" if autostart is blocked.

### HTTPS requirement
`getUserMedia` and Service Worker require HTTPS (except `localhost`).

---

## Development priorities

1. `@trillink/protocol` — zero-dep, test in Node.js/Vitest first. Done.
2. `@trillink/audio-web` TX via DTMF-FSK — listen/tune in browser. In progress.
3. `@trillink/audio-web` RX via DTMF-FSK — Goertzel sync detection + nibble decoder.
4. PDR testing on real channels (GSM, walkie-talkie) with DTMF-FSK.
5. `@trillink/sdk` — thin orchestration layer; depends only on `AudioAdapter`.
6. `@trillink/ui` — last, after protocol and audio are validated.

---

## Tooling choices

| Tool | Role |
|------|------|
| TypeScript 5.x strict | All packages |
| tsup | Library package builds (ESM + CJS + `.d.ts`) |
| Vite | Demo SPA dev and build |
| Vitest | Tests across all packages |
| Preact | SPA UI (3 kB, JSX-compatible) |
| `ggwave` (npm) | GGWave WASM module |
| Workbox | Service Worker + PWA manifest |
| pnpm workspaces | Monorepo |

---

## Key risks to track

| Risk | Status |
|------|--------|
| GGWave PDR < 95% on walkie-talkie | Must test in Phase 2 before any UI work |
| GGWave frequency range incompatible with some radios | Verify tones stay within 300–3000 Hz |
| React Native GGWave integration path unclear | Investigate before starting Phase 5 |
| Multiple same-type messages in one session ambiguous (v1 limitation) | Known; fix in v2 via SESSION_SEQ |
