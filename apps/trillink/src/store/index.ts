import { signal } from '@preact/signals';
import type { TrilinkMessage } from '@trillink/protocol';
import { persistEntry, loadJournal, deleteEntries } from './db.js';

// ── Journal ───────────────────────────────────────────────────────────────────

export interface JournalEntry {
  id: number;
  message: TrilinkMessage;
  direction: 'in' | 'out';
  sessionId: number;
  isCont: boolean;
  ts: Date;
  continuations: JournalEntry[];
  /** Set when this outgoing entry was also received back by the same device (self-echo). */
  selfEchoAt?: Date;
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

export function deleteEntry(id: number): void {
  const entry = journal.value.find((e) => e.id === id);
  if (!entry) return;
  journal.value = journal.value.filter((e) => e.id !== id);
  void deleteEntries([id, ...entry.continuations.map((c) => c.id)]);
}

function messagesEqual(a: TrilinkMessage, b: TrilinkMessage): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case 'GEO':     { const bb = b as typeof a; return a.lat === bb.lat && a.lon === bb.lon && a.alt === bb.alt; }
    case 'TEXT':    { const bb = b as typeof a; return a.text === bb.text; }
    case 'CONTACT': { const bb = b as typeof a; return a.contactType === bb.contactType && a.value === bb.value; }
    case 'TIME':    { const bb = b as typeof a; return a.unixTs === bb.unixTs && a.tzOffsetMin === bb.tzOffsetMin; }
    default:        return false;
  }
}

export function addEntry(entry: JournalEntry): void {
  // 1. Self-echo: incoming frame that shares a sessionId with one of our outgoing entries.
  //    Merge into the outgoing entry instead of creating a new one.
  if (entry.direction === 'in' && entry.sessionId !== 0) {
    const outIdx = journal.value.findIndex(
      (e) => e.sessionId === entry.sessionId && e.direction === 'out',
    );
    if (outIdx >= 0) {
      if (!entry.isCont) {
        const updated = [...journal.value];
        updated[outIdx] = { ...updated[outIdx]!, selfEchoAt: entry.ts };
        journal.value = updated;
        void persistEntry(updated[outIdx]!, null);
      }
      // Continuation echoes from our own session are silently dropped
      return;
    }
  }

  // 2. Incoming CONT — attach to the primary entry of the same session.
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

  // 3. Duplicate suppression: if an identical incoming message already exists, just
  //    update its timestamp to reflect the latest reception time.
  if (entry.direction === 'in' && !entry.isCont) {
    const dupIdx = journal.value.findIndex(
      (e) => e.direction === 'in' && !e.isCont && messagesEqual(e.message, entry.message),
    );
    if (dupIdx >= 0) {
      const updated = [...journal.value];
      updated[dupIdx] = { ...updated[dupIdx]!, ts: entry.ts };
      journal.value = updated;
      void persistEntry(updated[dupIdx]!, null);
      return;
    }
  }

  // 4. New entry
  journal.value = [entry, ...journal.value].slice(0, 200);
  void persistEntry(entry, null);
}

// ── Last sent (for retry) ─────────────────────────────────────────────────────

export const lastSent = signal<TrilinkMessage[] | null>(null);

// ── Audio / receiver state ────────────────────────────────────────────────────

export const isListening    = signal(false);
export const listenError    = signal('');   // persistent; cleared on successful start
export const debugCapture   = signal<{ blob: Blob; name: string } | null>(null);
export const audioLevel     = signal(0);
export const isSending      = signal(false);
export const sendProgress   = signal('');
export const signalDetected = signal(false);

const WF_KEY  = 'trillink:showwf';
const MAP_KEY = 'trillink:showmap';
export const showWaterfall = signal<boolean>(localStorage.getItem(WF_KEY) !== 'false');
export const showMap       = signal<boolean>(localStorage.getItem(MAP_KEY) === 'true');
showWaterfall.subscribe((v) => localStorage.setItem(WF_KEY, String(v)));
showMap.subscribe((v)       => localStorage.setItem(MAP_KEY, String(v)));

// ── Modal ─────────────────────────────────────────────────────────────────────

export type ModalState =
  | { type: 'none' }
  | { type: 'geo-send' }
  | { type: 'geo-detail';     entry: JournalEntry }
  | { type: 'text-detail';    entry: JournalEntry }
  | { type: 'contact-detail'; entry: JournalEntry }
  | { type: 'time-detail';    entry: JournalEntry }
  | { type: 'contact-send' }
  | { type: 'text-send' }
  | { type: 'time-send' }
  | { type: 'qr' };

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

export function copyToClipboard(text: string): void {
  const write = (t: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(t)
        .then(() => showToast('Copied!'))
        .catch(() => legacyCopy(t));
    } else {
      legacyCopy(t);
    }
  };
  write(text);
}

function legacyCopy(text: string): void {
  const el = document.createElement('textarea');
  el.value = text;
  el.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
  document.body.appendChild(el);
  el.focus();
  el.select();
  try { document.execCommand('copy'); showToast('Copied!'); }
  catch { showToast('Copy failed'); }
  document.body.removeChild(el);
}

export function showToast(msg: string, durationMs = 1800): void {
  toast.value = msg;
  clearTimeout(_toastTimer);
  _toastTimer = window.setTimeout(() => { toast.value = ''; }, durationMs);
}

// ── Settings ──────────────────────────────────────────────────────────────────

const PTT_KEY = 'trillink:ptt';
export const pttEnabled = signal<boolean>(localStorage.getItem(PTT_KEY) === 'true');
pttEnabled.subscribe((v) => localStorage.setItem(PTT_KEY, String(v)));
