import type { ComponentChildren } from 'preact';

interface Props {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  footer?: ComponentChildren;
}

export function Modal({ title, onClose, children, footer }: Props) {
  return (
    <div style={s.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={s.dialog} role="dialog" aria-modal="true">
        <div style={s.header}>
          <h2 style={s.title}>{title}</h2>
          <button style={s.close} onClick={onClose} title="Close (Esc)">✕</button>
        </div>
        <div style={s.body}>{children}</div>
        {footer && <div style={s.footer}>{footer}</div>}
      </div>
    </div>
  );
}

const s = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '0',
  },
  dialog: {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius) var(--radius) 0 0',
    width: '100%',
    maxWidth: '720px',
    maxHeight: '92dvh',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px 12px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  title: { fontSize: '16px', fontWeight: 600 },
  close: {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    color: 'var(--muted)',
    cursor: 'pointer',
    fontSize: '14px',
    padding: '4px 8px',
  },
  body: { flex: 1, overflowY: 'auto' as const, padding: '16px' },
  footer: {
    padding: '12px 16px',
    borderTop: '1px solid var(--border)',
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
    flexShrink: 0,
  },
} as const;
