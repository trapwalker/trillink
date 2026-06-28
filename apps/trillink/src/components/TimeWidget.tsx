import { useState, useEffect } from 'preact/hooks';
import type { TrilinkMessage } from '@trillink/protocol';

type TimeMsg = Extract<TrilinkMessage, { type: 'TIME' }>;

interface Props {
  onChange: (msg: TimeMsg | null) => void;
}

function nowTs(): TimeMsg {
  return {
    type: 'TIME',
    unixTs: Math.floor(Date.now() / 1000),
    tzOffsetMin: -new Date().getTimezoneOffset(),
  };
}

function toLocalIso(d: Date): string {
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

function fmtUtc(unixTs: number): string {
  return new Date(unixTs * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

export function TimeWidget({ onChange }: Props) {
  const [enabled,   setEnabled]  = useState(false);
  const [useNow,    setUseNow]   = useState(true);
  const [customDt,  setCustomDt] = useState(() => toLocalIso(new Date()));
  const [displayTs, setDisplayTs] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    if (!enabled) { onChange(null); return; }

    if (useNow) {
      const tick = () => {
        const msg = nowTs();
        setDisplayTs(msg.unixTs);
        onChange(msg);
      };
      tick();
      const iv = setInterval(tick, 1000);
      return () => clearInterval(iv);
    } else {
      const d = new Date(customDt);
      if (!isNaN(d.getTime())) {
        const msg: TimeMsg = {
          type: 'TIME',
          unixTs: Math.floor(d.getTime() / 1000),
          tzOffsetMin: -new Date().getTimezoneOffset(),
        };
        onChange(msg);
      }
    }
  }, [enabled, useNow, customDt]);

  return (
    <div style={s.wrap}>
      <label style={s.row}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled((e.target as HTMLInputElement).checked)}
        />
        <span style={s.lbl}>Add timestamp</span>
      </label>

      {enabled && (
        <div style={s.inner}>
          <label style={s.row}>
            <input
              type="checkbox"
              checked={useNow}
              onChange={(e) => setUseNow((e.target as HTMLInputElement).checked)}
            />
            <span style={s.lbl}>Current time</span>
          </label>

          {useNow ? (
            <div style={s.preview}>{fmtUtc(displayTs)}</div>
          ) : (
            <input
              type="datetime-local"
              style={s.dtInput}
              value={customDt}
              onInput={(e) => setCustomDt((e.target as HTMLInputElement).value)}
            />
          )}
        </div>
      )}
    </div>
  );
}

const s = {
  wrap: {
    borderTop: '1px solid var(--border)',
    paddingTop: '10px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  inner: { display: 'flex', flexDirection: 'column' as const, gap: '6px', paddingLeft: '20px' },
  row: { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' as const },
  lbl: { fontSize: '13px', color: 'var(--text)' },
  preview: {
    fontFamily: 'var(--font)', fontSize: '12px', color: 'var(--muted)',
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', padding: '6px 10px',
  },
  dtInput: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', color: 'var(--text)',
    fontSize: '13px', padding: '6px 10px', outline: 'none',
    colorScheme: 'dark' as const, width: '100%', boxSizing: 'border-box' as const,
  },
} as const;
