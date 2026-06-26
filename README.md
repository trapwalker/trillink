# Trillink

Transmit short structured messages over any voice audio channel — GSM calls, walkie-talkies, VoIP, or direct speaker-to-microphone — using only a web browser.

**No app installation. No internet required for data transfer. Works on any voice channel.**

## How it works

Trillink encodes structured messages (GPS coordinates, contacts, radio frequencies, etc.) into audio tones using [GGWave](https://github.com/ggerganov/ggwave) and plays them through the device speaker. Any other device with a microphone and a browser can decode them in real time — even if the audio passes through a phone call, walkie-talkie, or VoIP service.

Messages are transmitted in cycles. The receiver stops as soon as it has collected all frames with valid checksums, making transmission robust against partial packet loss.

## Message types

| Type    | Description                              | Status  |
|---------|------------------------------------------|---------|
| GEO     | GPS coordinates                          | MVP     |
| CONTACT | Phone number, email, callsign            | MVP     |
| TEXT    | Arbitrary text (segmented if long)       | MVP     |
| TIME    | Date and time with timezone              | MVP     |
| RADIO   | Radio channel (frequency, mode, CTCSS)   | planned |
| WIFI    | Wi-Fi SSID and password                  | planned |
| URL     | Hyperlink (segmented if long)            | planned |
| POI     | Named point of interest                  | planned |
| ROUTE   | Navigation route with waypoints          | planned |
| BEACON  | Device/entity UUID identifier            | planned |

## Packages

| Package               | Description                              |
|-----------------------|------------------------------------------|
| `@trillink/protocol`  | Binary codec, CRC-16, session management |
| `@trillink/audio-web` | Browser audio adapter (GGWave + Web Audio API) |
| `@trillink/audio-rn`  | React Native audio adapter               |
| `@trillink/sdk`       | Platform-agnostic sender/receiver        |
| `@trillink/ui`        | Web Components + offline-ready PWA       |

## Quick start

```typescript
import { TrilinkSender } from '@trillink/sdk';
import { WebAudioAdapter } from '@trillink/audio-web';

const tx = new TrilinkSender({
  audio: new WebAudioAdapter({ mode: 'AUDIBLE' }),
  cycles: 3,
});

await tx.send([
  { message: { type: 'GEO', lat: 55.7558, lon: 37.6176 } },
  { message: { type: 'TEXT', text: 'Meet here' }, cont: true },
]);
```

```typescript
import { TrilinkReceiver } from '@trillink/sdk';
import { WebAudioAdapter } from '@trillink/audio-web';

const rx = new TrilinkReceiver({
  audio: new WebAudioAdapter({ mode: 'AUDIBLE' }),
  onEvent(e) {
    if (e.type === 'message-ready') console.log(e.message);
  },
});

await rx.start();
```

## Protocol

The wire format is documented in [PROTOCOL.md](PROTOCOL.md). Trillink is designed as an open standard — the protocol specification is stable across patch and minor releases.

## Development

```bash
pnpm install
pnpm test          # run all tests
pnpm build         # build all packages
pnpm --filter demo dev  # start demo app
```

Requires Node.js ≥ 20 and pnpm ≥ 9.

## License

MIT
