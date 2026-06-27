import type { TrilinkMessage } from '@trillink/protocol';
import { openModal, pttEnabled, isSending, showWaterfall } from '../store/index.js';

interface Props {
  onSend: (msg: TrilinkMessage) => void;
}

export function Toolbar({ onSend: _onSend }: Props) {
  const actions: { label: string; icon: string; modal: Parameters<typeof openModal>[0]['type'] }[] = [
    { label: 'GEO',      icon: '📍', modal: 'geo-send'     },
    { label: 'Contact',  icon: '👤', modal: 'contact-send' },
    { label: 'Text',     icon: '💬', modal: 'text-send'    },
    { label: 'Time',     icon: '⏰', modal: 'time-send'    },
  ];

  return (
    <header style={s.header}>
      <div style={s.logo}>
        <span style={s.logoMark}>▶◀</span>
        <span style={s.logoText}>trillink</span>
      </div>

      <nav style={s.actions}>
        {actions.map((a) => (
          <button
            key={a.label}
            style={s.actionBtn}
            disabled={isSending.value}
            title={a.label}
            onClick={() => openModal({ type: a.modal } as Parameters<typeof openModal>[0])}
          >
            <span style={s.actionIcon}>{a.icon}</span>
            <span style={s.actionLabel}>{a.label}</span>
          </button>
        ))}
      </nav>

      <div style={s.controls}>
        <button
          style={{ ...s.iconBtn, color: showWaterfall.value ? 'var(--accent)' : 'var(--muted)' }}
          title="Toggle waterfall"
          onClick={() => { showWaterfall.value = !showWaterfall.value; }}
        >
          ≋
        </button>
        <button
          style={{ ...s.iconBtn, color: pttEnabled.value ? 'var(--accent)' : 'var(--muted)' }}
          title="PTT / Walkie-talkie mode"
          onClick={() => { pttEnabled.value = !pttEnabled.value; }}
        >
          📡
        </button>
      </div>
    </header>
  );
}

const s = {
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
    flexWrap: 'wrap' as const,
  },
  logo: { display: 'flex', alignItems: 'center', gap: '6px', marginRight: '8px' },
  logoMark: { color: 'var(--accent)', fontSize: '16px', letterSpacing: '-2px' },
  logoText: {
    fontFamily: 'var(--font)', fontWeight: 700, fontSize: '16px',
    letterSpacing: '2px', color: 'var(--text)',
  },
  actions: { display: 'flex', gap: '4px', flex: 1, flexWrap: 'wrap' as const },
  actionBtn: {
    display: 'flex', alignItems: 'center', gap: '4px',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    color: 'var(--text)',
    cursor: 'pointer',
    fontSize: '13px',
    padding: '6px 10px',
    transition: 'border-color 0.15s',
  },
  actionIcon: { fontSize: '14px' },
  actionLabel: { fontWeight: 500 },
  controls: { display: 'flex', gap: '4px', marginLeft: 'auto' },
  iconBtn: {
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    cursor: 'pointer',
    fontSize: '16px',
    padding: '4px 8px',
    lineHeight: 1,
    transition: 'color 0.15s',
  },
} as const;
