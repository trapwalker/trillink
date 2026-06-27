#!/usr/bin/env node
/**
 * Trillink CLI — transmit, receive, and roundtrip-test the DTMF-FSK codec.
 *
 * Usage:
 *   pnpm --filter @trillink/cli roundtrip -- --type GEO --lat 55.7558 --lon 37.6176 --debug
 *   pnpm --filter @trillink/cli tx -- --type TEXT --text "hello" -o out.wav
 *   pnpm --filter @trillink/cli rx -- -i out.wav --debug
 *   cat out.wav | node src/main.ts rx --debug   (stdin/stdout pipe)
 */

import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';

// Direct source imports — tsx resolves .js → .ts automatically.
// Uses relative paths to avoid pulling in browser-specific code.
import {
  buildSession,
  encodeFrame,
  decodeFrame,
  SessionContext,
} from '../../../packages/protocol/src/index.js';
import {
  fskEncode,
  FskDecoder,
} from '../../../packages/audio-web/src/codecs/dtmf-fsk-core.js';
import { writeWav, readWav } from './wav.js';

// ── Arg parsing ───────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): Record<string, string> {
  const r: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '-o' || a === '-i') {
      if (argv[i + 1]) { r[a.slice(1)] = argv[++i]!; }
    } else if (a.startsWith('--')) {
      const key  = a.slice(2);
      const next = argv[i + 1];
      r[key] = next && !next.startsWith('-') ? (i++, next) : 'true';
    }
  }
  return r;
}

// ── Message builder ───────────────────────────────────────────────────────────

type AnyMessage = ReturnType<typeof encodeMessage>[0] extends { msgType: infer _ }
  ? never
  : Parameters<typeof encodeMessage>[0];

function buildMessage(args: Record<string, string>): AnyMessage {
  switch (args['type']) {
    case 'GEO': {
      const lat = parseFloat(args['lat'] ?? '');
      const lon = parseFloat(args['lon'] ?? '');
      if (isNaN(lat) || isNaN(lon)) die('--lat and --lon required');
      const m: AnyMessage = { type: 'GEO', lat, lon };
      if (args['alt']) (m as { alt?: number }).alt = parseInt(args['alt'], 10);
      return m;
    }
    case 'TEXT': {
      const text = args['text'];
      if (!text) die('--text required');
      return { type: 'TEXT', text };
    }
    case 'CONTACT': {
      const phone = args['phone'];
      if (!phone) die('--phone required');
      return { type: 'CONTACT', contactType: 1 as const, value: phone };
    }
    case 'TIME':
      return { type: 'TIME', unixTs: Math.floor(Date.now() / 1000), tzOffsetMin: -new Date().getTimezoneOffset() };
    default:
      die('--type required: GEO | TEXT | CONTACT | TIME');
  }
}

// ── TX helper ─────────────────────────────────────────────────────────────────

function tx(args: Record<string, string>): {
  samples: Float32Array;
  sampleRate: number;
  frameBytesList: Uint8Array[];
} {
  const message    = buildMessage(args);
  const sampleRate = parseInt(args['sample-rate'] ?? '48000', 10);
  const amplitude  = parseFloat(args['amplitude']   ?? '0.6');

  const frames   = buildSession([{ message }]);
  const bytesList = frames.map(f => encodeFrame(f));

  err(`[TX] type=${message.type} frames=${frames.length}`);
  for (const [i, fb] of bytesList.entries()) {
    err(`[TX] frame ${i}: ${fb.length} bytes  ${hex(fb)}`);
  }

  // Encode each frame separately; concatenate audio (each has its own sync tone)
  const pieces = bytesList.map(fb => fskEncode(fb, sampleRate, amplitude));
  const totalLen = pieces.reduce((s, p) => s + p.length, 0);
  const samples = new Float32Array(totalLen);
  let off = 0;
  for (const p of pieces) { samples.set(p, off); off += p.length; }

  const ms = Math.round(totalLen / sampleRate * 1000);
  err(`[TX] audio: ${totalLen} samples (${ms} ms) at ${sampleRate} Hz`);

  return { samples, sampleRate, frameBytesList: bytesList };
}

// ── RX helper ─────────────────────────────────────────────────────────────────

function rx(
  samples: Float32Array,
  sampleRate: number,
  opts: { debug: boolean; threshold: number },
): Uint8Array | null {
  let result: Uint8Array | null = null;

  const decoder = new FskDecoder(
    sampleRate,
    {
      onSync: () => err('[SYNC] detected'),
      onByte: (byte, idx) => {
        if (!opts.debug)
          err(`[BYTE ${String(idx).padStart(3, '0')}] 0x${byte.toString(16).padStart(2, '0').toUpperCase()}`);
      },
      onEnd: (bytes) => {
        result = bytes;
        err(`\n[END] ${bytes.length} bytes total`);
        err(`[HEX] ${hex(bytes)}`);
      },
      onDebug: opts.debug ? (line) => err(line) : undefined,
    },
    opts.threshold,
  );

  decoder.process(samples);
  decoder.flush();

  return result;
}

// ── Subcommands ───────────────────────────────────────────────────────────────

const [sub, ...rest] = process.argv.slice(2);
const args = parseArgs(rest ?? []);

if (!sub || sub === '--help' || sub === '-h') {
  console.log(`trillink CLI

Commands:
  tx          --type TYPE [...fields] [-o output.wav]
  rx          [-i input.wav] [--debug] [--threshold 0.003]
  roundtrip   --type TYPE [...fields] [--debug] [--threshold 0.003]
  tx-play     --type TYPE [...fields]          encode and play through speakers
  rx-live     [--timeout 30] [--device :0]    receive from microphone in real-time

TX fields:
  --type GEO     --lat N --lon N [--alt N]
  --type TEXT    --text "message"
  --type CONTACT --phone "+79..."
  --type TIME    (uses current device time)

Options:
  --sample-rate N   default 48000
  --amplitude N     0–1, default 0.6
  --debug           show per-block Goertzel energies (rx/roundtrip/rx-live)
  --threshold N     energy threshold for tone detection, default 0.003
  --timeout N       rx-live: stop after N seconds if no message, default 30
  --device D        rx-live: audio device, default :0 (macOS) / default (Linux)
`);
  process.exit(0);
}

if (sub === 'tx') {
  const { samples, sampleRate } = tx(args);
  const wav = writeWav(samples, sampleRate);
  if (args['o']) {
    writeFileSync(args['o'], wav);
    err(`[TX] saved to ${args['o']}`);
  } else {
    process.stdout.write(wav);
  }
}

else if (sub === 'rx') {
  const raw = args['i'] ? readFileSync(args['i']) : readStdin();
  const { samples, sampleRate } = readWav(raw);
  const debug = args['debug'] === 'true';
  const threshold = parseFloat(args['threshold'] ?? '0.003');

  err(`[RX] ${samples.length} samples at ${sampleRate} Hz (${Math.round(samples.length / sampleRate * 1000)} ms)`);

  const bytes = rx(samples, sampleRate, { debug, threshold });
  if (!bytes) { err('[ERROR] no signal decoded'); process.exit(1); }

  try {
    const frame = decodeFrame(bytes);
    const ctx   = new SessionContext();
    const res   = ctx.feed(frame);
    if (res.status === 'ready') {
      process.stdout.write(JSON.stringify(res.message, null, 2) + '\n');
    } else {
      err(`[RX] session status: ${res.status}`);
    }
  } catch (e) {
    err(`[ERROR] frame decode: ${e}`);
    process.exit(1);
  }
}

else if (sub === 'roundtrip') {
  const debug     = args['debug'] === 'true';
  const threshold = parseFloat(args['threshold'] ?? '0.003');

  const { samples, sampleRate, frameBytesList } = tx(args);
  err('\n[ROUNDTRIP] decoding...\n');

  const bytes = rx(samples, sampleRate, { debug, threshold });

  if (!bytes) { err('\n[ROUNDTRIP] FAIL: no signal decoded'); process.exit(1); }

  const expected = frameBytesList[0]!;
  const pass = bytes.length === expected.length && bytes.every((b, i) => b === expected[i]);
  err(`\n[ROUNDTRIP] ${pass ? '✓ PASS' : '✗ FAIL'} (decoded ${bytes.length}/${expected.length} bytes)`);

  if (!pass) {
    err(`[EXPECTED] ${hex(expected)}`);
    err(`[GOT]      ${hex(bytes)}`);
    process.exit(1);
  }

  try {
    const frame = decodeFrame(bytes);
    const ctx   = new SessionContext();
    const res   = ctx.feed(frame);
    if (res.status === 'ready') {
      err('\n[MESSAGE]');
      process.stdout.write(JSON.stringify(res.message, null, 2) + '\n');
    }
  } catch (e) {
    err(`[ERROR] ${e}`);
    process.exit(1);
  }
}

else if (sub === 'tx-play') {
  const { samples, sampleRate } = tx(args);
  const wav = writeWav(samples, sampleRate);
  const tmp = `/tmp/trillink_tx_${Date.now()}.wav`;
  writeFileSync(tmp, wav);
  err(`[TX-PLAY] playing...`);
  const player = process.platform === 'linux' ? 'aplay' : 'afplay';
  const result = spawnSync(player, [tmp], { stdio: ['ignore', 'inherit', 'inherit'] });
  unlinkSync(tmp);
  if (result.error) die(`${player} not found: ${result.error.message}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

else if (sub === 'rx-live') {
  const debug     = args['debug']   === 'true';
  const threshold = parseFloat(args['threshold'] ?? '0.003');
  const timeout   = parseInt(args['timeout'] ?? '30', 10);
  const device    = args['device'] ?? (process.platform === 'linux' ? 'default' : ':0');

  const ffmpegInput: string[] = process.platform === 'linux'
    ? ['-f', 'alsa',        '-i', device]
    : ['-f', 'avfoundation', '-i', device];

  const ffmpegArgs = [
    ...ffmpegInput,
    '-ar', '48000',
    '-ac', '1',
    '-f', 's16le',
    '-t', String(timeout),
    'pipe:1',
  ];

  err(`[RX-LIVE] listening for up to ${timeout}s (threshold=${threshold}, Ctrl+C to stop)...`);

  const ffmpeg = spawn('ffmpeg', ffmpegArgs, {
    stdio: ['ignore', 'pipe', debug ? 'inherit' : 'pipe'],
  });
  if (!debug) (ffmpeg.stderr as NodeJS.ReadableStream | null)?.resume();

  const decoder = new FskDecoder(48000, {
    onSync: () => err('\n[SYNC] signal detected!'),
    onByte: (byte, idx) => {
      if (!debug)
        err(`[BYTE ${String(idx).padStart(3, '0')}] 0x${byte.toString(16).padStart(2, '0').toUpperCase()}`);
    },
    onEnd: (bytes) => {
      err(`\n[END] ${bytes.length} bytes`);
      err(`[HEX] ${hex(bytes)}`);
      try {
        const frame = decodeFrame(bytes);
        const ctx   = new SessionContext();
        const res   = ctx.feed(frame);
        if (res.status === 'ready') {
          process.stdout.write(JSON.stringify(res.message, null, 2) + '\n');
        } else {
          err(`[RX-LIVE] session status: ${res.status}`);
        }
      } catch (e) {
        err(`[ERROR] frame decode: ${e}`);
      }
      ffmpeg.kill();
      process.exit(0);
    },
    onDebug: debug ? (line) => err(line) : undefined,
  }, threshold);

  ffmpeg.stdout!.on('data', (chunk: Buffer) => {
    const samples = new Float32Array(chunk.length / 2);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = chunk.readInt16LE(i * 2) / 32768;
    }
    decoder.process(samples);
  });

  ffmpeg.on('error', (e) => die(`ffmpeg not found: ${e.message}`));

  ffmpeg.on('close', () => {
    decoder.flush();
    err('[RX-LIVE] stream ended');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    ffmpeg.kill();
    decoder.flush();
    process.exit(0);
  });
}

else {
  err(`Unknown command: ${sub}`);
  process.exit(1);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function err(msg: string): void { process.stderr.write(msg + '\n'); }
function die(msg: string): never { err(`[ERROR] ${msg}`); process.exit(1); }
function hex(b: Uint8Array): string {
  return Array.from(b).map(x => x.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

function readStdin(): Buffer {
  return readFileSync('/dev/stdin');
}
