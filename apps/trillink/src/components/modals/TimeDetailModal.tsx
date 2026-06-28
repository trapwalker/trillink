import type { TrilinkMessage } from '@trillink/protocol';
import { copyToClipboard, type JournalEntry } from '../../store/index.js';
import { Modal } from '../Modal.js';

interface Props {
  entry:   JournalEntry;
  onSend:  (msgs: TrilinkMessage[]) => void;
  onClose: () => void;
}

export function TimeDetailModal({ entry, onSend, onClose }: Props) {
  const msg  = entry.message as Extract<TrilinkMessage, { type: 'TIME' }>;
  const isIn = entry.direction === 'in';
  const ts   = entry.ts.toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' });
  const d    = new Date(msg.unixTs * 1000);

  const utcStr   = d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const localStr = d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'medium' });
  const unixStr  = String(msg.unixTs);

  return (
    <Modal
      title="⏰ Timestamp"
      onClose={onClose}
      footer={
        <>
          <button style={s.secondary} onClick={onClose}>Close</button>
          <button style={s.icon} onClick={() => copyToClipboard(utcStr)}>📋 Copy UTC</button>
          {!isIn && (
            <button style={s.primary} onClick={() => { onSend([msg]); onClose(); }}>▶ Re-send</button>
          )}
        </>
      }
    >
      <div style={s.body}>
        <div style={s.meta}>{isIn ? '◀ Received' : '▶ Sent'} · {ts}</div>

        <Row label="UTC"   value={utcStr}   onCopy={() => copyToClipboard(utcStr)} />
        <Row label="Local" value={localStr} onCopy={() => copyToClipboard(localStr)} />
        <Row label="Unix"  value={unixStr}  onCopy={() => copyToClipboard(unixStr)} />

        {msg.tzOffsetMin !== undefined && msg.tzOffsetMin !== 0 && (
          <div style={s.tz}>
            Sender offset: UTC{msg.tzOffsetMin >= 0 ? '+' : ''}{Math.floor(msg.tzOffsetMin / 60)}:{String(Math.abs(msg.tzOffsetMin) % 60).padStart(2, '0')}
          </div>
        )}
      </div>
    </Modal>
  );
}

function Row({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <div style={s.row}>
      <span style={s.rowLabel}>{label}</span>
      <span style={s.rowValue}>{value}</span>
      <button style={s.copyBtn} onClick={onCopy} title={`Copy ${label}`}>📋</button>
    </div>
  );
}

const s = {
  body: { display: 'flex', flexDirection: 'column' as const, gap: '8px' },
  meta: { fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' },
  row: {
    display: 'flex', alignItems: 'center', gap: '8px',
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', padding: '8px 10px',
  },
  rowLabel: { fontSize: '10px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' as const, width: '40px', flexShrink: 0 },
  rowValue: { fontSize: '13px', color: 'var(--text)', fontFamily: 'var(--font)', flex: 1 },
  copyBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', padding: '0 2px', lineHeight: 1, flexShrink: 0 },
  tz: { fontSize: '11px', color: 'var(--muted)' },
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
