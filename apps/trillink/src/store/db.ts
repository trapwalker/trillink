import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { JournalEntry } from './index.js';

interface TrilinkDB extends DBSchema {
  journal: {
    key: number;
    value: StoredEntry;
    indexes: { 'by-ts': Date };
  };
}

// JournalEntry without Preact-signals-incompatible nested entries; continuations stored flat
// with parentId linking them to their primary entry.
interface StoredEntry {
  id: number;
  parentId: number | null;   // non-null for CONT entries
  messageJson: string;       // JSON.stringify(message)
  direction: 'in' | 'out';
  sessionId: number;
  isCont: boolean;
  ts: Date;
}

const DB_NAME    = 'trillink';
const DB_VERSION = 1;
const MAX_STORED = 500;

let _db: IDBPDatabase<TrilinkDB> | null = null;

async function getDb(): Promise<IDBPDatabase<TrilinkDB>> {
  if (_db) return _db;
  _db = await openDB<TrilinkDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const store = db.createObjectStore('journal', { keyPath: 'id' });
      store.createIndex('by-ts', 'ts');
    },
  });
  return _db;
}

export async function persistEntry(entry: JournalEntry, parentId: number | null = null): Promise<void> {
  const db = await getDb();
  const stored: StoredEntry = {
    id:          entry.id,
    parentId,
    messageJson: JSON.stringify(entry.message),
    direction:   entry.direction,
    sessionId:   entry.sessionId,
    isCont:      entry.isCont,
    ts:          entry.ts,
  };
  await db.put('journal', stored);

  // Persist inline continuations (when addEntry is called on a CONT that was attached)
  for (const cont of entry.continuations) {
    await persistEntry(cont, entry.id);
  }

  // Prune oldest entries if over limit
  const count = await db.count('journal');
  if (count > MAX_STORED) {
    const all = await db.getAllKeysFromIndex('journal', 'by-ts');
    const toDelete = all.slice(0, count - MAX_STORED);
    const tx = db.transaction('journal', 'readwrite');
    await Promise.all(toDelete.map((k) => tx.store.delete(k)));
    await tx.done;
  }
}

export async function loadJournal(): Promise<JournalEntry[]> {
  const db  = await getDb();
  const all = await db.getAllFromIndex('journal', 'by-ts');

  // Rebuild the nested JournalEntry structure.
  const primary: JournalEntry[] = [];
  const byId = new Map<number, JournalEntry>();

  for (const row of all) {
    const entry: JournalEntry = {
      id:            row.id,
      message:       JSON.parse(row.messageJson),
      direction:     row.direction,
      sessionId:     row.sessionId,
      isCont:        row.isCont,
      ts:            new Date(row.ts),
      continuations: [],
    };
    byId.set(entry.id, entry);
  }

  for (const row of all) {
    const entry = byId.get(row.id)!;
    if (row.parentId !== null) {
      const parent = byId.get(row.parentId);
      if (parent) {
        parent.continuations.push(entry);
        continue;
      }
    }
    primary.push(entry);
  }

  // Newest first
  primary.reverse();
  return primary;
}

export async function clearJournal(): Promise<void> {
  const db = await getDb();
  await db.clear('journal');
}
