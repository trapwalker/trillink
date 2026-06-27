import { useState, useEffect, useCallback } from 'preact/hooks';
import type { TrilinkMessage } from '@trillink/protocol';
import { MAX_PAYLOAD } from '@trillink/protocol';
import { copyToClipboard } from '../../store/index.js';
import { Modal } from '../Modal.js';

// TEXT payload: 1 byte encoding prefix + text bytes. Limit single-frame ASCII.
const MAX_TEXT = MAX_PAYLOAD - 1;  // 19 bytes for a single frame, use as soft limit

interface Props {
  onSend:  (msg: TrilinkMessage) => void;
  onClose: () => void;
}

export function TextSendModal({ onSend, onClose }: Props) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  const len = new TextEncoder().encode(text).length;
  const warn = len > MAX_TEXT;

  function handleSend() {
    const t = text.trim();
    if (!t) { setError('Enter some text'); return; }
    onSend({ type: 'TEXT', text: t });
  }

  const handleKey = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSend();
  }, [text]);

  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  return (
    <Modal
      title="💬 Send text"
      onClose={onClose}
      footer={
        <>
          <button style={s.cancel} onClick={onClose}>Cancel</button>
          <button style={s.send} onClick={handleSend}>▶ Send</button>
        </>
      }
    >
      <div style={s.form}>
        <textarea
          style={s.textarea}
          placeholder="Type a short message…"
          value={text}
          rows={4}
          autoFocus
          onInput={(e) => { setText((e.target as HTMLTextAreaElement).value); setError(''); }}
        />
        <div style={s.row}>
          <span style={{ color: warn ? 'var(--red)' : 'var(--muted)', fontSize: '12px' }}>
            {len} bytes{warn ? ` — will fragment into ${Math.ceil(len / MAX_PAYLOAD)} frames` : ''}
          </span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {text && (
              <button style={s.iconBtn} onClick={() => copyToClipboard(text)} title="Copy text">📋</button>
            )}
            <span style={s.hint}>⌘↵ to send</span>
          </div>
        </div>
        {error && <div style={s.error}>{error}</div>}
      </div>
    </Modal>
  );
}

const s = {
  form: { display: 'flex', flexDirection: 'column' as const, gap: '10px' },
  textarea: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', color: 'var(--text)',
    fontSize: '15px', padding: '10px 12px', resize: 'vertical' as const,
    outline: 'none', fontFamily: 'inherit',
  },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  hint: { fontSize: '12px', color: 'var(--muted)' },
  iconBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: '14px', padding: '2px 4px', color: 'var(--muted)',
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
