import type { AudioCodec, RxHandlers, RxHandle, TxHandlers, TxHandle, TxResult } from '../codec.js';
import { fskEncode, FskDecoder, SYMBOL_MS, SYNC_MS } from './dtmf-fsk-core.js';
import { playBuffer } from '../player.js';

export interface DtmfFskOptions {
  amplitude?: number;  // 0–1 peak, default 0.6
}

export class DtmfFskCodec implements AudioCodec {
  readonly id   = 'dtmf-fsk';
  readonly name = 'DTMF-FSK 16-tone';

  private readonly amp: number;

  constructor(opts: DtmfFskOptions = {}) {
    this.amp = opts.amplitude ?? 0.6;
  }

  estimateDuration(payloadBytes: number): number {
    return (SYNC_MS + payloadBytes * 2 * SYMBOL_MS) / 1000;
  }

  transmit(payload: Uint8Array, ctx: AudioContext, handlers?: TxHandlers): TxHandle {
    const samples  = fskEncode(payload, ctx.sampleRate, this.amp);
    const buf      = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    buf.getChannelData(0).set(samples);

    const totalSec = this.estimateDuration(payload.length);
    const t0       = Date.now();
    const play     = playBuffer(ctx, buf);

    let stopped = false;
    let tick: ReturnType<typeof setInterval> | null = null;

    if (handlers?.onProgress) {
      const syncSec   = SYNC_MS   / 1000;
      const symbolSec = SYMBOL_MS / 1000;
      tick = setInterval(() => {
        const elapsed = (Date.now() - t0) / 1000;
        handlers.onProgress!({
          elapsedSec:   elapsed,
          remainingSec: Math.max(0, totalSec - elapsed),
          bytesSent:    Math.min(payload.length,
            Math.floor(Math.max(0, elapsed - syncSec) / (symbolSec * 2))),
          totalBytes: payload.length,
        });
      }, 40);
    }

    const finish = (completed: boolean): TxResult => {
      if (tick !== null) { clearInterval(tick); tick = null; }
      const result: TxResult = { elapsedSec: (Date.now() - t0) / 1000, completed };
      handlers?.onDone?.(result);
      return result;
    };

    const promise = play.promise.then(() => finish(!stopped));
    return { stop() { stopped = true; play.stop(); }, promise };
  }

  async startReceiving(
    ctx: AudioContext,
    stream: MediaStream,
    handlers: RxHandlers,
  ): Promise<RxHandle> {
    const source   = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    // ScriptProcessorNode gives us sample-level access. 2048 samples (≈42 ms)
    // is a reliable buffer size; we accumulate to Goertzel windows internally.
    // eslint-disable-next-line deprecation/deprecation
    const proc = ctx.createScriptProcessor(2048, 1, 1);
    analyser.connect(proc);
    const mute = ctx.createGain();
    mute.gain.value = 0;
    proc.connect(mute);
    mute.connect(ctx.destination); // must be connected or onaudioprocess stops

    let rxStart = 0;
    // Use `let` so onEnd can call decoder.reset() via closure after assignment.
    let decoder: FskDecoder;
    decoder = new FskDecoder(ctx.sampleRate, {
      onSync: () => {
        rxStart = Date.now();
        handlers.onStart?.();
        console.log('[FSK-RX] SYNC detected');
      },
      onEnd: (bytes) => {
        console.log(`[FSK-RX] END: ${bytes.length} bytes – ${Array.from(bytes, b => b.toString(16).padStart(2,'0')).join(' ')}`);
        handlers.onEnd?.(bytes, (Date.now() - rxStart) / 1000);
        decoder.reset();  // stay ready for the next transmission
      },
    }, 1e-6);  // real-world acoustic path: signal is ~1e-6–1e-5 energy (≈ −50 dBFS)

    proc.onaudioprocess = (e: AudioProcessingEvent) => {
      const chunk = new Float32Array(e.inputBuffer.getChannelData(0));
      decoder.process(chunk);
      handlers.onSamples?.(chunk);

      if (handlers.onLevel) {
        let sum = 0;
        for (const s of chunk) sum += s * s;
        handlers.onLevel(Math.sqrt(sum / chunk.length));
      }
    };

    return {
      stop() {
        proc.onaudioprocess = null;
        proc.disconnect();
        analyser.disconnect();
        source.disconnect();
        decoder.flush();
      },
      analyser,
    };
  }
}
