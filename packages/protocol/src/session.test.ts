import { describe, expect, it, vi } from 'vitest';
import { encodeFrame } from './frame.js';
import { encodeMessage } from './messages/index.js';
import { buildSession, SessionContext } from './session.js';
import { ContactType, MessageType } from './types.js';

function makeFrames(msg: Parameters<typeof encodeMessage>[0], opts?: Parameters<typeof encodeMessage>[1]) {
  return encodeMessage(msg, opts).map((f) => {
    const encoded = encodeFrame(f);
    const { decodeFrame } = require('./frame.js');
    return decodeFrame(encoded);
  });
}

// Re-import with proper ESM
import { decodeFrame } from './frame.js';

function toDecodedFrames(msg: Parameters<typeof encodeMessage>[0], opts?: Parameters<typeof encodeMessage>[1]) {
  return encodeMessage(msg, opts).map((f) => decodeFrame(encodeFrame(f)));
}

describe('SessionContext', () => {
  it('returns ready for a single non-fragmented message', () => {
    const ctx = new SessionContext();
    const [frame] = toDecodedFrames({ type: 'GEO', lat: 55.0, lon: 37.0 });
    const result = ctx.feed(frame!);
    expect(result.status).toBe('ready');
    if (result.status === 'ready') {
      expect(result.message.type).toBe('GEO');
      expect(result.isCont).toBe(false);
    }
  });

  it('sets context to the primary message', () => {
    const ctx = new SessionContext();
    const [frame] = toDecodedFrames({ type: 'GEO', lat: 1, lon: 2 });
    ctx.feed(frame!);
    expect(ctx.context?.type).toBe('GEO');
  });

  it('CONT message does not replace context', () => {
    const ctx = new SessionContext();
    const [geoFrame] = toDecodedFrames({ type: 'GEO', lat: 1, lon: 2 });
    const [textFrame] = toDecodedFrames({ type: 'TEXT', text: 'caption' }, { cont: true });
    ctx.feed(geoFrame!);
    const result = ctx.feed(textFrame!);
    expect(result.status).toBe('ready');
    if (result.status === 'ready') expect(result.isCont).toBe(true);
    expect(ctx.context?.type).toBe('GEO'); // still GEO
  });

  it('deduplicates repeated non-frag frames', () => {
    const ctx = new SessionContext();
    const [frame] = toDecodedFrames({ type: 'TIME', unixTs: 1000, tzOffsetMin: 0 });
    expect(ctx.feed(frame!).status).toBe('ready');
    expect(ctx.feed(frame!).status).toBe('duplicate');
    expect(ctx.feed(frame!).status).toBe('duplicate');
  });

  it('buffers fragments and assembles on last', () => {
    const ctx = new SessionContext();
    const text = 'A'.repeat(100); // forces fragmentation
    const frames = toDecodedFrames({ type: 'TEXT', text });
    expect(frames.length).toBeGreaterThan(1);

    for (let i = 0; i < frames.length - 1; i++) {
      expect(ctx.feed(frames[i]!).status).toBe('buffered');
    }
    const last = ctx.feed(frames[frames.length - 1]!);
    expect(last.status).toBe('ready');
    if (last.status === 'ready' && last.message.type === 'TEXT') {
      expect(last.message.text).toBe(text);
    }
  });

  it('assembles fragments delivered out of order', () => {
    const ctx = new SessionContext();
    const text = 'B'.repeat(100);
    const frames = toDecodedFrames({ type: 'TEXT', text });
    const shuffled = [...frames].reverse();

    let result;
    for (const f of shuffled) {
      result = ctx.feed(f);
    }
    expect(result?.status).toBe('ready');
    if (result?.status === 'ready' && result.message.type === 'TEXT') {
      expect(result.message.text).toBe(text);
    }
  });

  it('deduplicates duplicate fragments', () => {
    const ctx = new SessionContext();
    const text = 'C'.repeat(100);
    const frames = toDecodedFrames({ type: 'TEXT', text });

    for (const f of frames) ctx.feed(f);
    // Feed first fragment again — should be duplicate, not cause re-assembly
    expect(ctx.feed(frames[0]!).status).toBe('duplicate');
  });

  it('pruneTimedOut removes stale buffers', async () => {
    const ctx = new SessionContext();
    const text = 'D'.repeat(100);
    const frames = toDecodedFrames({ type: 'TEXT', text });
    // Feed only the first fragment
    ctx.feed(frames[0]!);

    await new Promise((r) => setTimeout(r, 10));
    const timedOut = ctx.pruneTimedOut(5);
    expect(timedOut).toContain(MessageType.TEXT);
  });

  it('reset clears all state', () => {
    const ctx = new SessionContext();
    const [frame] = toDecodedFrames({ type: 'GEO', lat: 1, lon: 2 });
    ctx.feed(frame!);
    ctx.reset();
    expect(ctx.context).toBeNull();
    // After reset the same frame is not a duplicate anymore
    expect(ctx.feed(frame!).status).toBe('ready');
  });
});

describe('buildSession', () => {
  it('returns frames in order', () => {
    const frames = buildSession([
      { message: { type: 'GEO', lat: 1, lon: 2 } },
      { message: { type: 'TEXT', text: 'Hi' }, cont: true },
    ]);
    expect(frames[0]!.msgType).toBe(MessageType.GEO);
    expect(frames[1]!.msgType).toBe(MessageType.TEXT);
    expect(frames[1]!.flags.cont).toBe(true);
  });

  it('CONT defaults to false', () => {
    const [frame] = buildSession([{ message: { type: 'GEO', lat: 0, lon: 0 } }]);
    expect(frame!.flags.cont).toBe(false);
  });

  it('all frames share the same sessionId', () => {
    const frames = buildSession([
      { message: { type: 'GEO', lat: 1, lon: 2 } },
      { message: { type: 'TEXT', text: 'Hi' }, cont: true },
    ]);
    const sid = frames[0]!.sessionId;
    expect(sid).toBeGreaterThan(0);
    frames.forEach((f) => expect(f.sessionId).toBe(sid));
  });

  it('accepts an explicit sessionId', () => {
    const frames = buildSession([{ message: { type: 'GEO', lat: 0, lon: 0 } }], 0xABCD);
    expect(frames[0]!.sessionId).toBe(0xABCD);
  });
});

describe('SessionContext — SESSION_ID', () => {
  it('deduplicates frames with same sessionId', () => {
    const ctx = new SessionContext();
    const [frame] = buildSession([{ message: { type: 'GEO', lat: 1, lon: 2 } }], 1);
    const decoded = decodeFrame(encodeFrame(frame!));
    expect(ctx.feed(decoded).status).toBe('ready');
    expect(ctx.feed(decoded).status).toBe('duplicate');
  });

  it('resets context when a new sessionId arrives', () => {
    const ctx = new SessionContext();
    const [frame1] = buildSession([{ message: { type: 'GEO', lat: 1, lon: 2 } }], 1);
    const [frame2] = buildSession([{ message: { type: 'GEO', lat: 3, lon: 4 } }], 2);
    ctx.feed(decodeFrame(encodeFrame(frame1!)));
    // Different sessionId — previous dedup state is cleared
    const result = ctx.feed(decodeFrame(encodeFrame(frame2!)));
    expect(result.status).toBe('ready');
    if (result.status === 'ready' && result.message.type === 'GEO') {
      expect(result.message.lat).toBeCloseTo(3, 5);
    }
  });
});
