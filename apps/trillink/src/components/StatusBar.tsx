import { isListening, listenError, audioLevel, signalDetected, isSending, sendProgress, showWaterfall } from '../store/index.js';

interface Props {
  onStartListening: () => void;
  onStopListening:  () => void;
}

export function StatusBar({ onStartListening, onStopListening }: Props) {
  const listening = isListening.value;
  const error     = listenError.value;
  const level     = audioLevel.value;
  const signal    = signalDetected.value;
  const sending   = isSending.value;

  const vuWidth = Math.min(100, Math.round(level * 400));

  return (
    <div style={s.bar}>
      <button
        style={{ ...s.listenBtn, background: listening ? 'var(--red)' : 'var(--accent)' }}
        onClick={listening ? onStopListening : onStartListening}
      >
        {listening ? '■' : '◉'}
      </button>

      {listening ? (
        <div style={s.statusGroup}>
          <span
            style={{
              ...s.dot,
              background: signal ? 'var(--green)' : 'var(--accent)',
              animation: signal ? 'none' : 'pulse 1.5s infinite',
            }}
          />
          <div
            style={{ ...s.vuTrack, cursor: 'pointer' }}
            title={showWaterfall.value ? 'Hide waterfall' : 'Show waterfall'}
            onClick={() => { showWaterfall.value = !showWaterfall.value; }}
          >
            <div
              style={{
                ...s.vuBar,
                width: `${vuWidth}%`,
                background: level > 0.3 ? (level > 0.7 ? 'var(--red)' : 'var(--green)') : 'var(--accent)',
              }}
            />
          </div>
          {signal && <span style={s.signalLabel}>Signal…</span>}
        </div>
      ) : error ? (
        <span style={s.error} title={error}>⚠ {error}</span>
      ) : (
        <span style={s.idle}>Tap ◉ to listen</span>
      )}

      {sending && (
        <div style={s.sendStatus}>
          <span style={s.sendDot}>▶</span>
          <span style={s.sendLabel}>{sendProgress.value || 'Sending…'}</span>
        </div>
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }`}</style>
    </div>
  );
}

const s = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '6px 16px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
    minHeight: '40px',
  },
  listenBtn: {
    border: 'none',
    borderRadius: '50%',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '14px',
    width: '28px',
    height: '28px',
    flexShrink: 0,
    lineHeight: '1',
  },
  statusGroup: { display: 'flex', alignItems: 'center', gap: '8px', flex: 1 },
  dot: {
    width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
  },
  vuTrack: {
    flex: 1,
    height: '5px',
    background: 'var(--surface)',
    borderRadius: '3px',
    overflow: 'hidden',
    border: '1px solid var(--border)',
  },
  vuBar: { height: '100%', borderRadius: '3px', transition: 'width 40ms linear, background 100ms' },
  signalLabel: { fontSize: '12px', color: 'var(--green)', fontWeight: 600 },
  idle:  { fontSize: '13px', color: 'var(--muted)' },
  error: { fontSize: '12px', color: 'var(--red)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  sendStatus: { display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' },
  sendDot: { color: 'var(--accent)', animation: 'pulse 0.8s infinite' },
  sendLabel: { fontSize: '12px', color: 'var(--muted)' },
} as const;
