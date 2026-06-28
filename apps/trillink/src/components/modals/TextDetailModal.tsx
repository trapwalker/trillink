import type { TrilinkMessage } from '@trillink/protocol';
import { copyToClipboard, type JournalEntry } from '../../store/index.js';
import { Modal } from '../Modal.js';

interface Props {
  entry:   JournalEntry;
  onSend:  (msg: TrilinkMessage) => void;
  onClose: () => void;
}

export function TextDetailModal({ entry, onSend, onClose }: Props) {
  const msg  = entry.message as Extract<TrilinkMessage, { type: 'TEXT' }>;
  const isIn = entry.direction === 'in';
  const ts   = entry.ts.toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' });

  return (
    <Modal
      title="💬 Text message"
      onClose={onClose}
      footer={
        <>
          <button style={s.secondary} onClick={onClose}>Close</button>
          <button style={s.icon} onClick={() => copyToClipboard(msg.text)} title="Copy">📋 Copy</button>
          {!isIn && (
            <button style={s.primary} onClick={() => { onSend(msg); onClose(); }}>▶ Re-send</button>
          )}
        </>
      }
    >
      <div style={s.body}>
        <div style={s.meta}>{isIn ? '◀ Received' : '▶ Sent'} · {ts}</div>
        <div style={s.text}>{msg.text}</div>
        <div style={s.byteCount}>{new TextEncoder().encode(msg.text).length} bytes</div>
      </div>
    </Modal>
  );
}

const s = {
  body: { display: 'flex', flexDirection: 'column' as const, gap: '10px' },
  meta: { fontSize: '11px', color: 'var(--muted)' },
  text: {
    fontSize: '16px',
    color: 'var(--text)',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '12px',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    lineHeight: 1.5,
  },
  byteCount: { fontSize: '11px', color: 'var(--muted)' },
  secondary: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', color: 'var(--muted)',
    cursor: 'pointer', fontSize: '14px', padding: '8px 16px',
  },
  icon: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', color: 'var(--text)',
    cursor: 'pointer', fontSize: '14px', padding: '8px 14px',
  },
  primary: {
    background: 'var(--accent)', border: 'none',
    borderRadius: 'var(--radius)', color: '#fff',
    cursor: 'pointer', fontSize: '14px', fontWeight: 600, padding: '8px 20px',
  },
} as const;
