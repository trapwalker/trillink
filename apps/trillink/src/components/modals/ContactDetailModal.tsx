import { ContactType } from '@trillink/protocol';
import type { TrilinkMessage } from '@trillink/protocol';
import { copyToClipboard, type JournalEntry } from '../../store/index.js';
import { Modal } from '../Modal.js';

interface Props {
  entry:   JournalEntry;
  onSend:  (msgs: TrilinkMessage[]) => void;
  onClose: () => void;
}

const TYPE_LABEL: Record<ContactType, string> = {
  [ContactType.PHONE]:    'Phone',
  [ContactType.EMAIL]:    'Email',
  [ContactType.CALLSIGN]: 'Callsign',
  [ContactType.HANDLE]:   'Handle',
};

export function ContactDetailModal({ entry, onSend, onClose }: Props) {
  const msg  = entry.message as Extract<TrilinkMessage, { type: 'CONTACT' }>;
  const isIn = entry.direction === 'in';
  const ts   = entry.ts.toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' });

  const callHref  = msg.contactType === ContactType.PHONE ? `tel:${msg.value}` : null;
  const emailHref = msg.contactType === ContactType.EMAIL ? `mailto:${msg.value}` : null;

  return (
    <Modal
      title="👤 Contact"
      onClose={onClose}
      footer={
        <>
          <button style={s.secondary} onClick={onClose}>Close</button>
          <button style={s.icon} onClick={() => copyToClipboard(msg.value)}>📋 Copy</button>
          {callHref  && <a style={s.icon} href={callHref}>📞 Call</a>}
          {emailHref && <a style={s.icon} href={emailHref}>✉️ Email</a>}
          {!isIn && (
            <button style={s.primary} onClick={() => { onSend([msg]); onClose(); }}>▶ Re-send</button>
          )}
        </>
      }
    >
      <div style={s.body}>
        <div style={s.meta}>{isIn ? '◀ Received' : '▶ Sent'} · {ts}</div>
        <div style={s.typeTag}>{TYPE_LABEL[msg.contactType]}</div>
        <div style={s.value}>{msg.value}</div>
      </div>
    </Modal>
  );
}

const s = {
  body: { display: 'flex', flexDirection: 'column' as const, gap: '10px' },
  meta: { fontSize: '11px', color: 'var(--muted)' },
  typeTag: {
    display: 'inline-block',
    fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em',
    color: 'var(--accent)', textTransform: 'uppercase' as const,
  },
  value: {
    fontSize: '20px',
    fontWeight: 600,
    color: 'var(--text)',
    fontFamily: 'var(--font)',
    letterSpacing: '0.02em',
    wordBreak: 'break-all' as const,
  },
  secondary: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', color: 'var(--muted)',
    cursor: 'pointer', fontSize: '14px', padding: '8px 16px',
  },
  icon: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', color: 'var(--text)',
    cursor: 'pointer', fontSize: '14px', padding: '8px 14px',
    textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
  },
  primary: {
    background: 'var(--accent)', border: 'none',
    borderRadius: 'var(--radius)', color: '#fff',
    cursor: 'pointer', fontSize: '14px', fontWeight: 600, padding: '8px 20px',
  },
} as const;
