import { decodeMessage, encodeMessage, type EncodeOptions } from './messages/index.js';
import { type MessageType, type TrilinkFrame, type TrilinkMessage } from './types.js';

export type SessionFeedResult =
  | { status: 'buffered' }
  | { status: 'duplicate' }
  | { status: 'ready'; message: TrilinkMessage; isCont: boolean }
  | { status: 'fragment-timeout' };

interface FragmentBuffer {
  segTot: number;
  isCont: boolean;
  msgType: MessageType;
  fragments: Map<number, Uint8Array>;
  firstSeenAt: number;
}

export class SessionContext {
  private _context: TrilinkMessage | null = null;
  private _fragmentBuffers = new Map<string, FragmentBuffer>();
  private _received = new Set<string>();

  get context(): TrilinkMessage | null {
    return this._context;
  }

  feed(frame: TrilinkFrame): SessionFeedResult {
    const { flags, msgType, segIdx, segTot, payload } = frame;

    if (!flags.frag) {
      const key = `${msgType}:0:0:${flags.cont}`;
      if (this._received.has(key)) return { status: 'duplicate' };
      this._received.add(key);

      const message = decodeMessage(payload, msgType);
      if (!flags.cont) this._context = message;
      return { status: 'ready', message, isCont: flags.cont };
    }

    // Fragmented message
    const bufKey = `${msgType}:${segTot}:${flags.cont}`;
    const receiveKey = `${msgType}:${segTot}:frag:${flags.cont}`;
    if (this._received.has(receiveKey)) return { status: 'duplicate' };

    let buf = this._fragmentBuffers.get(bufKey);
    if (!buf) {
      buf = {
        segTot,
        isCont: flags.cont,
        msgType,
        fragments: new Map(),
        firstSeenAt: Date.now(),
      };
      this._fragmentBuffers.set(bufKey, buf);
    }

    if (buf.fragments.has(segIdx)) return { status: 'duplicate' };
    buf.fragments.set(segIdx, payload);

    if (buf.fragments.size < segTot) return { status: 'buffered' };

    // All fragments received — assemble
    this._fragmentBuffers.delete(bufKey);
    this._received.add(receiveKey);

    const parts: Uint8Array[] = [];
    for (let i = 0; i < segTot; i++) {
      parts.push(buf.fragments.get(i)!);
    }
    const totalLen = parts.reduce((n, p) => n + p.length, 0);
    const assembled = new Uint8Array(totalLen);
    let offset = 0;
    for (const part of parts) {
      assembled.set(part, offset);
      offset += part.length;
    }

    const message = decodeMessage(assembled, msgType);
    if (!flags.cont) this._context = message;
    return { status: 'ready', message, isCont: flags.cont };
  }

  /** Purge fragment buffers older than timeoutMs. Returns timed-out message types. */
  pruneTimedOut(timeoutMs: number): MessageType[] {
    const now = Date.now();
    const timedOut: MessageType[] = [];
    for (const [key, buf] of this._fragmentBuffers) {
      if (now - buf.firstSeenAt > timeoutMs) {
        timedOut.push(buf.msgType);
        this._fragmentBuffers.delete(key);
      }
    }
    return timedOut;
  }

  reset(): void {
    this._context = null;
    this._fragmentBuffers.clear();
    this._received.clear();
  }
}

// ── Session builder (sender side) ─────────────────────────────────────────────

export interface SessionMessage {
  message: TrilinkMessage;
  cont?: boolean;
}

export function buildSession(messages: SessionMessage[]): TrilinkFrame[] {
  const frames: TrilinkFrame[] = [];
  for (const { message, cont } of messages) {
    const opts: EncodeOptions = { cont: cont ?? false };
    frames.push(...encodeMessage(message, opts));
  }
  return frames;
}
