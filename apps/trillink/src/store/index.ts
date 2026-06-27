import { signal } from '@preact/signals';
import type { TrilinkMessage } from '@trillink/protocol';
import { persistEntry, loadJournal } from './db.js';

// ── Journal ───────────────────────────────────────────────────────────────────

export interface JournalEntry {
  id: number;
  message: TrilinkMessage;
  direction: 'in' | 'out';
  sessionId: number;
  isCont: boolean;
  ts: Date;
  continuations: JournalEntry[];
}

let _nextId = 1;
export function nextEntryId(): number { return _nextId++; }

export const journal = signal<JournalEntry[]>([]);
export const journalLoaded = signal(false);

// Load persisted journal on startup; set _nextId above the max stored id.
loadJournal().then((entries) => {
  if (entries.length > 0) {
    const maxId = Math.max(...entries.map(function maxId(e): number {
      return Math.max(e.id, ...e.continuations.map(maxId));
    }));
    _nextId = maxId + 1;
    journal.value = entries;
  }
  journalLoaded.value = true;
}).catch(() => { journalLoaded.value = true; });

export function addEntry(entry: JournalEntry): void {
  // CONT messages get attached to the primary message of the same session.
  if (entry.isCont && entry.direction === 'in' && entry.sessionId !== 0) {
    const parentIdx = journal.value.findIndex(
      (e) => e.sessionId === entry.sessionId && !e.isCont,
    );
    if (parentIdx >= 0) {
      const updated = [...journal.value];
      const parent = { ...updated[parentIdx]!, continuations: [...updated[parentIdx]!.continuations, entry] };
      updated[parentIdx] = parent;
      journal.value = updated;
      void persistEntry(entry, updated[parentIdx]!.id);
      return;
    }
  }
  journal.value = [entry, ...journal.value].slice(0, 200);
  void persistEntry(entry, null);
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

// ── Toast notifications ───────────────────────────────────────────────────────

export const toast = signal('');
let _toastTimer = 0;

export function showToast(msg: string, durationMs = 1800): void {
  toast.value = msg;
  clearTimeout(_toastTimer);
  _toastTimer = window.setTimeout(() => { toast.value = ''; }, durationMs);
}

// ── Settings ──────────────────────────────────────────────────────────────────

const PTT_KEY = 'trillink:ptt';
export const pttEnabled = signal<boolean>(localStorage.getItem(PTT_KEY) === 'true');
pttEnabled.subscribe((v) => localStorage.setItem(PTT_KEY, String(v)));
