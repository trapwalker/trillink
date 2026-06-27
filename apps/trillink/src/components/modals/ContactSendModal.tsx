import { useState, useEffect, useCallback } from 'preact/hooks';
import type { TrilinkMessage } from '@trillink/protocol';
import { ContactType } from '@trillink/protocol';
import { Modal } from '../Modal.js';

const LRU_KEY = 'trillink:contact-lru';

function getLru(): string[] {
  try { return JSON.parse(localStorage.getItem(LRU_KEY) ?? '[]'); }
  catch { return []; }
}

function pushLru(v: string) {
  const list = getLru().filter((x) => x !== v);
  localStorage.setItem(LRU_KEY, JSON.stringify([v, ...list].slice(0, 5)));
}

interface Props {
  onSend:  (msg: TrilinkMessage) => void;
  onClose: () => void;
}

export function ContactSendModal({ onSend, onClose }: Props) {
  const [type, setType]   = useState<ContactType>(ContactType.PHONE);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const lru = getLru();

  const label: Record<ContactType, string> = {
    [ContactType.PHONE]:    'Phone (E.164)',
    [ContactType.EMAIL]:    'Email',
    [ContactType.CALLSIGN]: 'Callsign',
    [ContactType.HANDLE]:   'Handle / nickname',
  };

  const placeholder: Record<ContactType, string> = {
    [ContactType.PHONE]:    '+79161234567',
    [ContactType.EMAIL]:    'user@example.com',
    [ContactType.CALLSIGN]: 'UA3ABC',
    [ContactType.HANDLE]:   '@username',
  };

  function handleSend() {
    const v = value.trim();
    if (!v) { setError('Enter a value'); return; }
    pushLru(v);
    onSend({ type: 'CONTACT', contactType: type, value: v });
  }

  const handleKey = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSend();
  }, [value, type]);

  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  return (
    <Modal
      title="👤 Send contact"
      onClose={onClose}
      footer={
        <>
          <button style={s.cancel} onClick={onClose}>Cancel</button>
          <button style={s.send} onClick={handleSend}>▶ Send</button>
        </>
      }
    >
      <div style={s.form}>
        <div style={s.typeRow}>
          {([ContactType.PHONE, ContactType.EMAIL, ContactType.CALLSIGN, ContactType.HANDLE] as ContactType[]).map((t) => (
            <button
              key={t}
              style={{ ...s.typeBtn, ...(type === t ? s.typeBtnActive : {}) }}
              onClick={() => { setType(t); setValue(''); setError(''); }}
            >
              {label[t]}
            </button>
          ))}
        </div>

        <input
          style={s.input}
          type="text"
          placeholder={placeholder[type]}
          value={value}
          autoFocus
          onInput={(e) => { setValue((e.target as HTMLInputElement).value); setError(''); }}
        />

        {lru.length > 0 && (
          <div style={s.lru}>
            <div style={s.lruLabel}>Recent</div>
            {lru.map((v, i) => (
              <button key={i} style={s.lruItem} onClick={() => setValue(v)}>{v}</button>
            ))}
          </div>
        )}

        {error && <div style={s.error}>{error}</div>}
      </div>
    </Modal>
  );
}

const s = {
  form: { display: 'flex', flexDirection: 'column' as const, gap: '12px' },
  typeRow: { display: 'flex', gap: '6px', flexWrap: 'wrap' as const },
  typeBtn: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', color: 'var(--muted)',
    cursor: 'pointer', fontSize: '12px', padding: '5px 10px',
  },
  typeBtnActive: { borderColor: 'var(--accent)', color: 'var(--accent)', background: 'var(--accent-dim)' },
  input: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', color: 'var(--text)',
    fontSize: '15px', padding: '10px 12px', outline: 'none',
  },
  lru: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', padding: '6px',
    display: 'flex', flexDirection: 'column' as const, gap: '2px',
  },
  lruLabel: { fontSize: '11px', color: 'var(--muted)', padding: '0 4px 4px', textTransform: 'uppercase' as const },
  lruItem: {
    background: 'none', border: 'none', borderRadius: '4px',
    color: 'var(--text)', cursor: 'pointer', fontSize: '13px',
    padding: '5px 8px', textAlign: 'left' as const,
  },
  error: { fontSize: '13px', color: 'var(--red)' },
  cancel: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', color: 'var(--muted)',
    cursor: 'pointer', fontSize: '14px', padding: '8px 16px',
  },
  send: {
    background: 'var(--accent)', border: 'none',
    borderRadius: 'var(--radius)', color: '#fff',
    cursor: 'pointer', fontSize: '14px', fontWeight: 600, padding: '8px 20px',
  },
} as const;
