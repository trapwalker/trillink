import { decodeFrame, encodeFrame, encodeMessage } from '@trillink/protocol';
import { describe, expect, it, vi } from 'vitest';
import type { AudioAdapter, PlayOptions } from './adapter.js';
import type { ReceiverEvent, SenderEvent } from './events.js';
import { TrilinkReceiver } from './receiver.js';
import { TrilinkSender } from './sender.js';

// ── Mock AudioAdapter ─────────────────────────────────────────────────────────

function makeMockAdapter(): AudioAdapter & {
  playedFrames: import('@trillink/protocol').TrilinkFrame[][];
  injectFrame: (frame: import('@trillink/protocol').TrilinkFrame) => void;
} {
  let _listening = false;
  let _onFrame: ((frame: import('@trillink/protocol').TrilinkFrame) => void) | null = null;
  const playedFrames: import('@trillink/protocol').TrilinkFrame[][] = [];

  return {
    playedFrames,
    injectFrame(frame) { _onFrame?.(frame); },

    async play(frames, _opts?: PlayOptions) {
      playedFrames.push([...frames]);
    },
    stopPlayback() {},
    async startListening(onFrame) {
      _listening = true;
      _onFrame = onFrame;
    },
    async stopListening() {
      _listening = false;
      _onFrame = null;
    },
    async playPreamble(_ms) {},
    get isListening() { return _listening; },
  };
}

// ── TrilinkSender ─────────────────────────────────────────────────────────────

describe('TrilinkSender', () => {
  it('calls audio.play() once per cycle', async () => {
    const audio = makeMockAdapter();
    const sender = new TrilinkSender({ audio, cycles: 3, interCycleGapMs: 0 });
    await sender.send([{ message: { type: 'GEO', lat: 55.0, lon: 37.0 } }]);
    expect(audio.playedFrames.length).toBe(3);
  });

  it('emits cycle-start, cycle-complete, transmission-complete', async () => {
    const events: SenderEvent[] = [];
    const audio = makeMockAdapter();
    const sender = new TrilinkSender({ audio, cycles: 2, interCycleGapMs: 0, onEvent: (e) => events.push(e) });
    await sender.send([{ message: { type: 'TIME', unixTs: 0, tzOffsetMin: 0 } }]);

    expect(events.filter((e) => e.type === 'cycle-start').length).toBe(2);
    expect(events.filter((e) => e.type === 'cycle-complete').length).toBe(2);
    expect(events.at(-1)?.type).toBe('transmission-complete');
  });

  it('emits frame-sent for each frame each cycle', async () => {
    const events: SenderEvent[] = [];
    const audio = makeMockAdapter();
    const sender = new TrilinkSender({ audio, cycles: 2, interCycleGapMs: 0, onEvent: (e) => events.push(e) });
    await sender.send([
      { message: { type: 'GEO', lat: 0, lon: 0 } },
      { message: { type: 'TEXT', text: 'Hi' }, cont: true },
    ]);
    const sent = events.filter((e) => e.type === 'frame-sent');
    expect(sent.length).toBe(4); // 2 messages × 2 cycles
  });

  it('abort() stops transmission early', async () => {
    const audio = makeMockAdapter();
    const events: SenderEvent[] = [];
    const sender = new TrilinkSender({
      audio,
      cycles: 5,
      interCycleGapMs: 0,
      onEvent(e) {
        events.push(e);
        if (e.type === 'cycle-complete' && e.cycle === 1) sender.abort();
      },
    });

    await sender.send([{ message: { type: 'GEO', lat: 0, lon: 0 } }]);
    expect(events.some((e) => e.type === 'aborted')).toBe(true);
    expect(audio.playedFrames.length).toBeLessThan(5);
  });

  it('calls playPreamble() when preambleDurationMs > 0', async () => {
    const audio = makeMockAdapter();
    const preambleSpy = vi.spyOn(audio, 'playPreamble');
    const sender = new TrilinkSender({ audio, cycles: 2, interCycleGapMs: 0, preambleDurationMs: 600 });
    await sender.send([{ message: { type: 'GEO', lat: 0, lon: 0 } }]);
    expect(preambleSpy).toHaveBeenCalledTimes(2);
    expect(preambleSpy).toHaveBeenCalledWith(600);
  });
});

// ── TrilinkReceiver ───────────────────────────────────────────────────────────

describe('TrilinkReceiver', () => {
  function makeReceiverWithAudio() {
    const audio = makeMockAdapter();
    const events: ReceiverEvent[] = [];
    const rx = new TrilinkReceiver({ audio, onEvent: (e) => events.push(e) });
    return { audio, events, rx };
  }

  it('emits listening after start()', async () => {
    const { events, rx } = makeReceiverWithAudio();
    await rx.start();
    expect(events.some((e) => e.type === 'listening')).toBe(true);
    await rx.stop();
  });

  it('emits message-ready for a valid GEO frame', async () => {
    const { audio, events, rx } = makeReceiverWithAudio();
    await rx.start();

    const [frame] = encodeMessage({ type: 'GEO', lat: 55.7558, lon: 37.6176 });
    audio.injectFrame(decodeFrame(encodeFrame(frame!)));

    const ready = events.find((e) => e.type === 'message-ready');
    expect(ready).toBeDefined();
    if (ready?.type === 'message-ready') {
      expect(ready.message.type).toBe('GEO');
    }
    await rx.stop();
  });

  it('deduplicates repeated frames', async () => {
    const { audio, events, rx } = makeReceiverWithAudio();
    await rx.start();

    const [frame] = encodeMessage({ type: 'GEO', lat: 0, lon: 0 });
    const decoded = decodeFrame(encodeFrame(frame!));
    audio.injectFrame(decoded);
    audio.injectFrame(decoded);
    audio.injectFrame(decoded);

    expect(events.filter((e) => e.type === 'message-ready').length).toBe(1);
    await rx.stop();
  });

  it('emits fragment-received during reassembly', async () => {
    const { audio, events, rx } = makeReceiverWithAudio();
    await rx.start();

    const text = 'A'.repeat(100);
    const frames = encodeMessage({ type: 'TEXT', text });
    for (const f of frames) {
      audio.injectFrame(decodeFrame(encodeFrame(f)));
    }

    expect(events.filter((e) => e.type === 'fragment-received').length).toBe(frames.length);
    const ready = events.find((e) => e.type === 'message-ready');
    expect(ready).toBeDefined();
    if (ready?.type === 'message-ready' && ready.message.type === 'TEXT') {
      expect(ready.message.text).toBe(text);
    }
    await rx.stop();
  });

  it('emits context-updated when CONT message follows a primary', async () => {
    const { audio, events, rx } = makeReceiverWithAudio();
    await rx.start();

    const [geoFrame] = encodeMessage({ type: 'GEO', lat: 55.0, lon: 37.0 });
    const [textFrame] = encodeMessage({ type: 'TEXT', text: 'Here' }, { cont: true });
    audio.injectFrame(decodeFrame(encodeFrame(geoFrame!)));
    audio.injectFrame(decodeFrame(encodeFrame(textFrame!)));

    expect(events.some((e) => e.type === 'context-updated')).toBe(true);
    await rx.stop();
  });

  it('reset() allows re-receiving same messages', async () => {
    const { audio, events, rx } = makeReceiverWithAudio();
    await rx.start();

    const [frame] = encodeMessage({ type: 'GEO', lat: 0, lon: 0 });
    const decoded = decodeFrame(encodeFrame(frame!));

    audio.injectFrame(decoded);
    rx.reset();
    audio.injectFrame(decoded);

    expect(events.filter((e) => e.type === 'message-ready').length).toBe(2);
    await rx.stop();
  });
});
