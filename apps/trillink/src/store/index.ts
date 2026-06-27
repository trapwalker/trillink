import { signal, computed } from '@preact/signals';
import type { TrilinkMessage } from '@trillink/protocol';

// ── Journal ───────────────────────────────────────────────────────────────────

export interface JournalEntry {
  id: number;
  message: TrilinkMessage;
  direction: 'in' | 'out';
  sessionId: number;
  ts: Date;
  continuations: JournalEntry[];
}

let _nextId = 1;
export function nextEntryId(): number { return _nextId++; }

export const journal = signal<JournalEntry[]>([]);

export function addEntry(entry: JournalEntry): void {
  if (entry.direction === 'in' && entry.message.type !== 'GEO' && entry.message.type !== 'TEXT'
    && entry.message.type !== 'CONTACT' && entry.message.type !== 'TIME') {
    journal.value = [entry, ...journal.value].slice(0, 200);
    return;
  }
  // Attempt to attach CONT messages to their parent entry (same session)
  if (entry.direction === 'in') {
    const parentIdx = journal.value.findIndex(
      (e) => e.sessionId === entry.sessionId && e.continuations !== undefined
        && e.message.type !== entry.message.type,
    );
    if (parentIdx >= 0) {
      const updated = [...journal.value];
      const parent = { ...updated[parentIdx]! };
      parent.continuations = [...parent.continuations, entry];
      updated[parentIdx] = parent;
      // Move updated parent to top
      updated.splice(parentIdx, 1);
      journal.value = [parent, ...updated].slice(0, 200);
      return;
    }
  }
  journal.value = [entry, ...journal.value].slice(0, 200);
}

// ── Audio / receiver state ────────────────────────────────────────────────────

export const isListening      = signal(false);
export const audioLevel       = signal(0);
export const showWaterfall    = signal(true);
export const isSending        = signal(false);
export const sendProgress     = signal('');
export const signalDetected   = signal(false);

// ── Modal ─────────────────────────────────────────────────────────────────────

export type ModalState =
  | { type: 'none' }
  | { type: 'geo-send' }
  | { type: 'geo-detail'; entry: JournalEntry }
  | { type: 'contact-send' }
  | { type: 'text-send' }
  | { type: 'time-send' };

export const modal = signal<ModalState>({ type: 'none' });

export function openModal(m: ModalState): void { modal.value = m; }
export function closeModal(): void             { modal.value = { type: 'none' }; }

// ── LRU for recent coordinates ────────────────────────────────────────────────

const COORD_LRU_KEY = 'trillink:coord-lru';
const MAX_LRU = 5;

export interface LruCoord { lat: number; lon: number; label?: string; }

export function getLruCoords(): LruCoord[] {
  try { return JSON.parse(localStorage.getItem(COORD_LRU_KEY) ?? '[]'); }
  catch { return []; }
}

export function pushLruCoord(c: LruCoord): void {
  const list = getLruCoords().filter((x) => !(Math.abs(x.lat - c.lat) < 1e-5 && Math.abs(x.lon - c.lon) < 1e-5));
  localStorage.setItem(COORD_LRU_KEY, JSON.stringify([c, ...list].slice(0, MAX_LRU)));
}

// ── Settings ──────────────────────────────────────────────────────────────────

const PTT_KEY = 'trillink:ptt';
export const pttEnabled = signal<boolean>(localStorage.getItem(PTT_KEY) === 'true');
pttEnabled.subscribe((v) => localStorage.setItem(PTT_KEY, String(v)));
