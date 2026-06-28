import { useState } from 'preact/hooks';
import type { TrilinkMessage } from '@trillink/protocol';
import { openModal, pttEnabled, isSending, showWaterfall, showMap } from '../store/index.js';

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

      <Menu />
    </header>
  );
}

function Menu() {
  const [open, setOpen] = useState(false);
  const ptt = pttEnabled.value;
  const wf  = showWaterfall.value;
  const mp  = showMap.value;

  function close() { setOpen(false); }

  return (
    <div style={s.menuWrap}>
      <button style={s.iconBtn} title="Menu" onClick={() => setOpen((v) => !v)} aria-label="Open menu">
        ☰
      </button>

      {open && (
        <>
          <div style={s.backdrop} onClick={close} />
          <div style={s.dropdown}>

            {/* Panels */}
            <div style={s.section}>
              <div style={s.sectionLabel}>Panels</div>
              <ToggleRow label="≋ Waterfall" active={wf} onToggle={() => { showWaterfall.value = !wf; }} />
              <ToggleRow label="🗺 Map" active={mp} onToggle={() => { showMap.value = !mp; }} />
            </div>

            <div style={s.divider} />

            {/* PTT */}
            <ToggleRow label="📡 PTT mode" active={ptt} onToggle={() => { pttEnabled.value = !ptt; }} />

            <div style={s.divider} />

            <button style={s.item} onClick={() => { openModal({ type: 'qr' }); close(); }}>
              ⊞ QR code (this page)
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ToggleRow({ label, active, onToggle }: { label: string; active: boolean; onToggle: () => void }) {
  return (
    <button style={s.item} onClick={onToggle}>
      <span>{label}</span>
      <span style={{
        fontSize: '10px', fontWeight: 700, letterSpacing: '0.04em',
        color: active ? 'var(--green)' : 'var(--muted)',
      }}>
        {active ? 'ON' : 'OFF'}
      </span>
    </button>
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

  // Hamburger
  menuWrap: { position: 'relative' as const, marginLeft: 'auto' },
  iconBtn: {
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    cursor: 'pointer',
    fontSize: '18px',
    padding: '4px 8px',
    lineHeight: 1,
    color: 'var(--text)',
  },
  backdrop: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 999,
  },
  dropdown: {
    position: 'absolute' as const,
    top: 'calc(100% + 6px)',
    right: 0,
    minWidth: '200px',
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    zIndex: 1000,
    padding: '6px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },
  section: { padding: '2px 0 4px' },
  sectionLabel: { fontSize: '10px', color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.08em', padding: '0 6px 4px', textTransform: 'uppercase' as const },
  item: {
    background: 'none',
    border: 'none',
    borderRadius: '6px',
    color: 'var(--text)',
    cursor: 'pointer',
    fontSize: '13px',
    padding: '8px 10px',
    textAlign: 'left' as const,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  divider: { height: '1px', background: 'var(--border)', margin: '2px 0' },
} as const;
