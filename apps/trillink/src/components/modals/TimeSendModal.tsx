import { useState } from 'preact/hooks';
import type { TrilinkMessage } from '@trillink/protocol';
import { copyToClipboard } from '../../store/index.js';
import { Modal } from '../Modal.js';

interface Props {
  onSend:  (msg: TrilinkMessage) => void;
  onClose: () => void;
}

export function TimeSendModal({ onSend, onClose }: Props) {
  const [mode, setMode] = useState<'now' | 'custom'>('now');
  const [customDt, setCustomDt] = useState(() => {
    const d = new Date();
    d.setSeconds(0, 0);
    return d.toISOString().slice(0, 16);  // "YYYY-MM-DDTHH:MM"
  });

  function handleSend() {
    const d    = mode === 'now' ? new Date() : new Date(customDt);
    const ts   = Math.floor(d.getTime() / 1000);
    const tz   = -new Date().getTimezoneOffset();
    onSend({ type: 'TIME', unixTs: ts, tzOffsetMin: tz });
  }

  const preview = mode === 'now'
    ? new Date().toISOString().replace('T', ' ').slice(0, 19) + ' (current)'
    : new Date(customDt).toISOString().replace('T', ' ').slice(0, 16);

  return (
    <Modal
      title="⏰ Send timestamp"
      onClose={onClose}
      footer={
        <>
          <button style={s.cancel} onClick={onClose}>Cancel</button>
          <button style={s.send} onClick={handleSend}>▶ Send</button>
        </>
      }
    >
      <div style={s.form}>
        <div style={s.modeRow}>
          <button
            style={{ ...s.modeBtn, ...(mode === 'now' ? s.modeActive : {}) }}
            onClick={() => setMode('now')}
          >
            Current time
          </button>
          <button
            style={{ ...s.modeBtn, ...(mode === 'custom' ? s.modeActive : {}) }}
            onClick={() => setMode('custom')}
          >
            Custom
          </button>
        </div>

        {mode === 'custom' && (
          <input
            style={s.input}
            type="datetime-local"
            value={customDt}
            autoFocus
            onInput={(e) => setCustomDt((e.target as HTMLInputElement).value)}
          />
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ ...s.preview, flex: 1 }}>{preview} UTC</div>
          <button style={s.iconBtn} onClick={() => copyToClipboard(preview + ' UTC')} title="Copy time">📋</button>
        </div>
      </div>
    </Modal>
  );
}

const s = {
  form: { display: 'flex', flexDirection: 'column' as const, gap: '12px' },
  modeRow: { display: 'flex', gap: '8px' },
  modeBtn: {
    flex: 1, background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', color: 'var(--muted)',
    cursor: 'pointer', fontSize: '14px', padding: '10px',
  },
  modeActive: { borderColor: 'var(--accent)', color: 'var(--accent)', background: 'var(--accent-dim)' },
  input: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', color: 'var(--text)',
    fontSize: '14px', padding: '10px 12px', outline: 'none',
    colorScheme: 'dark' as const,
  },
  preview: {
    fontFamily: 'var(--font)', fontSize: '13px', color: 'var(--muted)',
    padding: '8px 12px', background: 'var(--surface)',
    borderRadius: 'var(--radius)', border: '1px solid var(--border)',
  },
  cancel: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', color: 'var(--muted)',
    cursor: 'pointer', fontSize: '14px', padding: '8px 16px',
  },
  iconBtn: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', color: 'var(--muted)',
    cursor: 'pointer', fontSize: '16px', padding: '8px 10px', flexShrink: 0,
  },
  send: {
    background: 'var(--accent)', border: 'none',
    borderRadius: 'var(--radius)', color: '#fff',
    cursor: 'pointer', fontSize: '14px', fontWeight: 600, padding: '8px 20px',
  },
} as const;
