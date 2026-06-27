// Pure DTMF-FSK encode/decode — no browser APIs, runs in Node.js + browser.
//
// Wire format:
//   [SYNC 500 Hz · 400 ms] [symbol×2 per byte · 40 ms each]
//
// 16 data tones 700–2200 Hz (100 Hz step), high nibble first.
// Each symbol = 36 ms tone + 4 ms silence; 3 ms cosine fade on every tone edge.
//
// RX uses a 10 ms Goertzel window sliding at 2 ms steps. Tone boundaries are
// detected when 3 consecutive windows (6 ms) agree on a new dominant tone,
// giving ±6 ms timing accuracy regardless of recording start offset.
// Same-frequency consecutive symbols are split by a 40 ms force-split.
// This tolerates ±40 ms start-offset and ≈ ±15 % playback-speed variation.
//
// Noise immunity: tone is only accepted when its Goertzel energy both exceeds
// an absolute floor (threshold) AND is ≥ 2× the second-highest data-tone
// energy. Sync (500 Hz) additionally requires dominating its 400/600 Hz
// neighbours. This makes detection scale-independent and robust to broadband
// noise at any volume.

export const SYNC_HZ   = 500;
export const SYNC_MS   = 400;
export const BASE_HZ   = 700;
export const STEP_HZ   = 100;
export const TONES     = 16;    // 700 … 2200 Hz
export const SYMBOL_MS = 40;
export const TONE_MS   = 36;
export const FADE_MS   = 3;

// RX sliding-window parameters
export const WIN_MS  = 10;   // Goertzel window (10 ms = 480 samples @ 48 kHz)
export const STEP_MS =  2;   // slide step      ( 2 ms =  96 samples @ 48 kHz)

// ── TX ────────────────────────────────────────────────────────────────────────

export function fskEncode(
  payload: Uint8Array,
  sampleRate: number,
  amplitude = 0.6,
): Float32Array {
  const syncN  = Math.round(sampleRate * SYNC_MS   / 1000);
  const symN   = Math.round(sampleRate * SYMBOL_MS / 1000);
  const toneN  = Math.round(sampleRate * TONE_MS   / 1000);
  const fadeN  = Math.round(sampleRate * FADE_MS   / 1000);
  const out    = new Float32Array(syncN + payload.length * 2 * symN);

  const tone = (offset: number, hz: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const env = i < fadeN ? i / fadeN : i > n - fadeN ? (n - i) / fadeN : 1;
      out[offset + i] = amplitude * env * Math.sin(2 * Math.PI * hz * i / sampleRate);
    }
  };

  tone(0, SYNC_HZ, syncN);

  let off = syncN;
  for (const byte of payload) {
    for (const nibble of [(byte >> 4) & 0xF, byte & 0xF]) {
      tone(off, BASE_HZ + nibble * STEP_HZ, toneN);
      off += symN; // trailing silence is zero-initialised
    }
  }

  return out;
}

// ── RX — sliding-window Goertzel decoder ─────────────────────────────────────

export interface FskRxHandlers {
  onSync?(): void;
  onByte?(byte: number, byteIdx: number): void;
  onEnd?(bytes: Uint8Array): void;
  onDebug?(line: string): void;
}

/**
 * Stateful FSK decoder. Feed audio chunks via process(); call flush() when done.
 *
 * Sliding 10 ms window at 2 ms step. A tone change is confirmed after
 * 3 consecutive windows agree (6 ms hysteresis). Same-frequency consecutive
 * symbols are split when a single tone lasts > 60 ms (force-split).
 */
export class FskDecoder {
  private readonly winN:  number;   // samples per analysis window (10 ms)
  private readonly stepN: number;   // samples per slide step (2 ms)
  private readonly sr:    number;
  private readonly h:     FskRxHandlers;
  private readonly thr:   number;

  // Stream accumulator
  private accum:    Float32Array;
  private accumLen = 0;
  private posN     = 0;   // global sample-position of the current window start

  // State
  private state: 'searching' | 'reading' | 'done' = 'searching';

  // Sync detection
  private syncWins  = 0;     // consecutive windows with e500 > thr
  private syncReady = false; // true once ≥ MIN_SYNC_MS of sync seen
  private readonly syncMinWins: number;

  // Tone-change streak (confirmation mechanism)
  private streakTone  = -2;  // -2 = unset
  private streakCount =  0;
  private readonly CONFIRM = 3;  // consecutive windows = 6 ms

  // Confirmed current tone (-1 = silence)
  private curTone   = -1;
  private curStartN =  0;

  // Nibble / byte assembly
  private hiNibble = -1;
  private bytes: number[] = [];

  // Reusable energy array (avoid per-window allocation)
  private readonly _es = new Float32Array(TONES);

  private static readonly MIN_SYM_MS  =  8;   // shorter → skip (noise)
  private static readonly MAX_SYM_MS  = 40;   // longer  → force-split (= one symbol period)
  private static readonly MIN_SYNC_MS = 200;  // required sync duration
  private static readonly END_SIL_MS  = 80;   // silence → end of message

  constructor(sampleRate: number, handlers: FskRxHandlers = {}, threshold = 0.001) {
    this.sr       = sampleRate;
    this.winN     = Math.round(sampleRate * WIN_MS  / 1000);
    this.stepN    = Math.round(sampleRate * STEP_MS / 1000);
    this.h        = handlers;
    this.thr      = threshold;
    this.accum    = new Float32Array(this.winN + this.stepN * 8);
    this.syncMinWins = Math.ceil(FskDecoder.MIN_SYNC_MS / STEP_MS);
  }

  process(chunk: Float32Array): void {
    if (this.accumLen + chunk.length > this.accum.length) {
      const bigger = new Float32Array(
        Math.max(this.accum.length * 2, this.accumLen + chunk.length + this.winN),
      );
      bigger.set(this.accum.subarray(0, this.accumLen));
      this.accum = bigger;
    }
    this.accum.set(chunk, this.accumLen);
    this.accumLen += chunk.length;

    while (this.accumLen >= this.winN && this.state !== 'done') {
      this._window(this.accum.subarray(0, this.winN));
      if (this.accumLen < this.stepN) break; // reset() was called inside _window
      this.accum.copyWithin(0, this.stepN, this.accumLen);
      this.accumLen -= this.stepN;
      this.posN     += this.stepN;
    }
  }

  flush(): void {
    if (this.state !== 'reading') return;
    this._commitCur(this.posN);
    if (this.bytes.length > 0) {
      this.state = 'done';
      this.h.onDebug?.('[END] flush');
      this.h.onEnd?.(new Uint8Array(this.bytes));
    }
  }

  /** Reset to initial state so the decoder can receive the next message. */
  reset(): void {
    this.state      = 'searching';
    this.accumLen   = 0;
    this.posN       = 0;
    this.syncWins   = 0;
    this.syncReady  = false;
    this.streakTone  = -2;
    this.streakCount = 0;
    this.curTone    = -1;
    this.curStartN  = 0;
    this.hiNibble   = -1;
    this.bytes      = [];
  }

  getBytes(): Uint8Array { return new Uint8Array(this.bytes); }

  // ── internals ─────────────────────────────────────────────────────────────────

  private _window(win: Float32Array): void {
    const eSync = goertzel(win, SYNC_HZ, this.sr);
    const t     = tMs(this.posN, this.sr);

    if (this.state === 'searching') {
      // Dominance check: 500 Hz must be at least 3× its nearest neighbours so
      // broadband hum at 500 Hz doesn't trigger false sync detection.
      const e400  = goertzel(win, SYNC_HZ - STEP_HZ, this.sr);
      const e600  = goertzel(win, SYNC_HZ + STEP_HZ, this.sr);
      const syncOk = eSync > this.thr && eSync > 3 * Math.max(e400, e600);
      if (syncOk) {
        this.syncWins++;
        this.syncReady ||= this.syncWins >= this.syncMinWins;
        this.h.onDebug?.(`[${t}] SYNC  e500=${fmt(eSync)} (${this.syncWins}w)`);
      } else if (this.syncReady) {
        // Sync tone just ended → start reading
        this.state     = 'reading';
        this.curTone   = -1;
        this.curStartN = this.posN;
        this.h.onDebug?.(`[${t}] SYNC END (${this.syncWins * STEP_MS} ms) → reading`);
        this.h.onSync?.();
        this._readWin(win, t); // process this window as first data window
      } else {
        if (this.syncWins > 0) this.h.onDebug?.(`[${t}] sync reset (had ${this.syncWins}w)`);
        this.syncWins  = 0;
        this.syncReady = false;
      }
      return;
    }

    if (this.state === 'reading') this._readWin(win, t);
  }

  private _readWin(win: Float32Array, t: string): void {
    // Compute all 16 data tone energies; track best and second-best for dominance check.
    let maxE = 0, bestN = 0, secondE = 0;
    for (let n = 0; n < TONES; n++) {
      const e = goertzel(win, BASE_HZ + n * STEP_HZ, this.sr);
      this._es[n] = e;
      if (e > maxE) { secondE = maxE; maxE = e; bestN = n; }
      else if (e > secondE) { secondE = e; }
    }
    // Accept vote only when the winning tone exceeds the noise floor AND is at
    // least 2× the runner-up (dominance), making detection noise-scale-independent.
    const vote = (maxE >= this.thr && maxE > 2 * secondE) ? bestN : -1;

    if (this.h.onDebug) {
      const esStr = Array.from(this._es, (e, n) => `${BASE_HZ + n * STEP_HZ}=${fmt(e)}`).join(' ');
      const label = vote < 0 ? 'silence' : `${BASE_HZ + vote * STEP_HZ}Hz`;
      this.h.onDebug(`[${t}] DATA   ${esStr} → ${label}`);
    }

    // ── Streak / confirmation ────────────────────────────────────────────────
    if (vote === this.streakTone) {
      this.streakCount++;
    } else {
      this.streakTone  = vote;
      this.streakCount = 1;
    }

    if (this.streakCount >= this.CONFIRM && this.streakTone !== this.curTone) {
      // Retroactive transition: started (CONFIRM-1) steps ago
      const switchN = this.posN - (this.CONFIRM - 1) * this.stepN;
      const from = this.curTone >= 0 ? `${BASE_HZ + this.curTone * STEP_HZ}Hz` : 'silence';
      const to   = this.streakTone >= 0 ? `${BASE_HZ + this.streakTone * STEP_HZ}Hz` : 'silence';
      this.h.onDebug?.(`[${t}] SWITCH ${from} → ${to} @ ${tMs(switchN, this.sr)}`);
      this._commitCur(switchN);
      this.curTone   = this.streakTone;
      this.curStartN = switchN;
    }

    // ── Force-split for same-frequency consecutive symbols ───────────────────
    if (this.curTone >= 0) {
      const durMs = (this.posN - this.curStartN) / this.sr * 1000;
      if (durMs >= FskDecoder.MAX_SYM_MS) {
        this.h.onDebug?.(`[${t}] FORCE-SPLIT (${durMs.toFixed(0)} ms)`);
        this._commitCur(this.posN);
        this.curStartN = this.posN;
      }
    }

    // ── End-of-message silence detection ────────────────────────────────────
    if (this.curTone < 0) {
      const silMs = (this.posN - this.curStartN) / this.sr * 1000;
      if (silMs >= FskDecoder.END_SIL_MS && this.bytes.length > 0) {
        this.state = 'done';
        this.h.onDebug?.(`[${t}] END (${silMs.toFixed(0)} ms silence)`);
        this.h.onEnd?.(new Uint8Array(this.bytes));
      }
    }
  }

  private _commitCur(endN: number): void {
    if (this.curTone < 0) return;
    const durMs = (endN - this.curStartN) / this.sr * 1000;
    if (durMs < FskDecoder.MIN_SYM_MS) {
      this.h.onDebug?.(`[SKIP] ${BASE_HZ + this.curTone * STEP_HZ}Hz ${durMs.toFixed(0)} ms < ${FskDecoder.MIN_SYM_MS} ms`);
      return;
    }
    this.h.onDebug?.(`[NIBBLE] 0x${this.curTone.toString(16)} = ${BASE_HZ + this.curTone * STEP_HZ}Hz (${durMs.toFixed(0)} ms)`);
    if (this.hiNibble < 0) {
      this.hiNibble = this.curTone;
    } else {
      const byte = (this.hiNibble << 4) | this.curTone;
      this.hiNibble = -1;
      const idx = this.bytes.length;
      this.bytes.push(byte);
      this.h.onDebug?.(`[BYTE ${String(idx).padStart(3, '0')}] 0x${byte.toString(16).padStart(2, '0').toUpperCase()}`);
      this.h.onByte?.(byte, idx);
    }
  }
}

// ── Goertzel DFT at a single frequency ───────────────────────────────────────
//
// Returns normalised energy ≈ (amplitude/2)² for a pure sine at `hz`.
// At exact bin frequencies (hz is a multiple of sampleRate/N), DFT orthogonality
// guarantees zero cross-talk between any two tones in our set.

function goertzel(block: Float32Array, hz: number, sampleRate: number): number {
  const n = block.length;
  const k = Math.round(n * hz / sampleRate);
  const coeff = 2 * Math.cos(2 * Math.PI * k / n);
  let s1 = 0, s2 = 0;
  for (const x of block) {
    const s0 = x + coeff * s1 - s2;
    s2 = s1; s1 = s0;
  }
  return (s1 * s1 + s2 * s2 - coeff * s1 * s2) / (n * n);
}

function tMs(posN: number, sr: number): string { return Math.round(posN / sr * 1000).toString().padStart(5); }
function fmt(e: number): string { return e.toFixed(5); }
