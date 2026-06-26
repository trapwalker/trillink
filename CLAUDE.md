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
packages/protocol/    @trillink/protocol   — zero-dep codec: encode/decode/CRC/session
packages/audio-web/   @trillink/audio-web  — GGWave WASM + Web Audio API adapter
packages/audio-rn/    @trillink/audio-rn   — React Native audio adapter (expo-av)
packages/sdk/         @trillink/sdk        — TrilinkSender / TrilinkReceiver (platform-agnostic)
packages/ui/          @trillink/ui         — Web Components + Preact SPA + Service Worker
apps/demo/            (private)            — demo SPA
```

---

## Commands

```bash
pnpm install                                    # install all workspace deps
pnpm -r build                                   # build all packages
pnpm -r test                                    # run all tests
pnpm --filter @trillink/protocol test           # test one package
pnpm --filter @trillink/protocol test -- --watch  # watch mode
pnpm --filter demo dev                          # demo SPA dev server
pnpm --filter @trillink/ui build                # build UI package
```

---

## Protocol version

Current: **v1**. The `VER` nibble in every frame header encodes this. Breaking wire-format changes require bumping VER. The protocol is a public standard — backwards compatibility of decoders is mandatory once v1 is published.

---

## Critical implementation constraints

### Frame size
Maximum GGWave payload: **28 bytes** per frame. Keep `MAX_PAYLOAD = 22` bytes for message payload (leaves 6 bytes for frame overhead). Never produce frames larger than 28 bytes.

### CRC specification
**CRC-16/CCITT-FALSE**: poly=0x1021, init=0xFFFF, no reflection, no final XOR.
Check value: `crc16("123456789") === 0x29B1`.
CRC is computed over `frame[0 .. 3+PAYLOAD_LEN]`, appended big-endian.

### Integer encoding
All multi-byte integers in frame payloads: **big-endian**.

### Coordinates
`lat` and `lon` are stored as `int32 = degrees × 1_000_000`. Precision ~0.11 m at equator.
Sentinel for absent `alt` (int16): `0x7FFF`.
Sentinel for absent `orig_lat`/`orig_lon` in ROUTE (int32): `0x7FFFFFFF`.

### Audio channel bandwidth
All target channels (GSM, walkie-talkie, VoIP): usable range ~300–3000 Hz.
GGWave `AUDIBLE` mode uses ~1400–2100 Hz — within range.
Never configure GGWave to use `ULTRASONIC` or `ULTRASONIC_FAST` modes.

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

1. Implement and fully test `@trillink/protocol` before touching audio — it has no browser dependencies and can be tested in Node.js/Vitest
2. Integrate GGWave in `@trillink/audio-web` and run PDR tests on real channels **early** (Phase 2) — GGWave channel behaviour is the biggest unknown
3. `@trillink/sdk` — thin orchestration layer; depends only on the `AudioAdapter` interface
4. `@trillink/ui` — last, after protocol and audio are validated

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
