import { useState, useRef, useMemo } from 'preact/hooks';
import type { TrilinkMessage, TrilinkFrame } from '@trillink/protocol';
import { ContactType, encodeMessage, encodeFrame } from '@trillink/protocol';
import { WebAudioAdapter, type ReliabilityMode } from '@trillink/audio-web';
import { TrilinkSender } from '@trillink/sdk';
import type { SenderEvent } from '@trillink/sdk';

type MsgType = 'GEO' | 'CONTACT' | 'TEXT' | 'TIME';
type SendState = 'idle' | 'sending' | 'done' | 'error';

export function SendView() {
  const [msgType, setMsgType] = useState<MsgType>('GEO');
  const [mode, setMode] = useState<ReliabilityMode>('balanced');
  const [ptt, setPtt] = useState(false);
  const [cycles, setCycles] = useState(1);
  const [state, setState] = useState<SendState>('idle');
  const [progress, setProgress] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [showDebug, setShowDebug] = useState(false);
  const [cycleDisplay, setCycleDisplay] = useState({ current: 0, total: 0 });

  // GEO fields
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [alt, setAlt] = useState('');

  // CONTACT fields
  const [contactValue, setContactValue] = useState('');

  // TEXT fields
  const [text, setText] = useState('');

  const senderRef = useRef<TrilinkSender | null>(null);

  function buildMessage(): TrilinkMessage | null {
    switch (msgType) {
      case 'GEO': {
        const latN = parseFloat(lat), lonN = parseFloat(lon);
        if (isNaN(latN) || isNaN(lonN)) return null;
        const msg: TrilinkMessage = { type: 'GEO', lat: latN, lon: lonN };
        if (alt.trim()) { (msg as { alt?: number }).alt = parseInt(alt, 10); }
        return msg;
      }
      case 'CONTACT': {
        if (!contactValue.trim()) return null;
        return { type: 'CONTACT', contactType: ContactType.PHONE, value: contactValue.trim() };
      }
      case 'TEXT': {
        if (!text.trim()) return null;
        return { type: 'TEXT', text: text.trim() };
      }
      case 'TIME': {
        const now = Math.floor(Date.now() / 1000);
        const tzOffset = -new Date().getTimezoneOffset();
        return { type: 'TIME', unixTs: now, tzOffsetMin: tzOffset };
      }
    }
  }

  const messageForPreview = useMemo(() => buildMessage(), [msgType, lat, lon, alt, contactValue, text]);

  const estimatedSec = useMemo(() => {
    if (!messageForPreview) return null;
    return TrilinkSender.estimateDuration(
      [{ message: messageForPreview }],
      { mode, cycles, interCycleGapMs: 1500 },
    );
  }, [messageForPreview, mode, cycles]);

  const debugFrames = useMemo<TrilinkFrame[] | null>(() => {
    if (!messageForPreview) return null;
    try { return encodeMessage(messageForPreview); } catch { return null; }
  }, [messageForPreview]);

  async function handleSend() {
    if (state === 'sending') {
      senderRef.current?.addCycle();
      return;
    }

    const message = buildMessage();
    if (!message) { setErrorMsg('Please fill in all required fields.'); return; }

    setState('sending');
    setErrorMsg('');
    setProgress('Initializing…');

    try {
      const adapter = new WebAudioAdapter({ mode, ptt, volume: 10 });
      const sender = new TrilinkSender({
        audio: adapter,
        cycles,
        preambleDurationMs: ptt ? 700 : 0,
        onEvent(e: SenderEvent) {
          if (e.type === 'cycle-start') {
            setCycleDisplay({ current: e.cycle + 1, total: e.total });
            setProgress(`Cycle ${e.cycle + 1} / ${e.total}…`);
          } else if (e.type === 'transmission-complete') {
            setProgress('');
            setState('done');
          } else if (e.type === 'aborted') {
            setProgress('');
            setState('idle');
          }
        },
      });
      senderRef.current = sender;
      await sender.send([{ message }]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
      setState('error');
    } finally {
      senderRef.current = null;
    }
  }

  function handleAbort() {
    senderRef.current?.abort();
  }

  const isSending = state === 'sending';

  return (
    <div style={s.container}>
      <h2 style={s.heading}>Transmit</h2>

      <label style={s.label}>Message type</label>
      <div style={s.typeRow}>
        {(['GEO', 'CONTACT', 'TEXT', 'TIME'] as MsgType[]).map((t) => (
          <button
            key={t}
            style={{ ...s.typeBtn, ...(msgType === t ? s.typeBtnActive : {}) }}
            disabled={isSending}
            onClick={() => { setMsgType(t); setState('idle'); setErrorMsg(''); }}
          >
            {t}
          </button>
        ))}
      </div>

      <div style={s.fields}>
        {msgType === 'GEO' && (
          <>
            <Field label="Latitude" placeholder="55.7558" value={lat} onChange={setLat} disabled={isSending} />
            <Field label="Longitude" placeholder="37.6176" value={lon} onChange={setLon} disabled={isSending} />
            <Field label="Altitude (m, optional)" placeholder="200" value={alt} onChange={setAlt} disabled={isSending} />
          </>
        )}
        {msgType === 'CONTACT' && (
          <Field label="Phone number (E.164)" placeholder="+79161234567" value={contactValue} onChange={setContactValue} disabled={isSending} />
        )}
        {msgType === 'TEXT' && (
          <div>
            <label style={s.label}>Text</label>
            <textarea
              style={s.textarea}
              value={text}
              onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
              placeholder="Any message…"
              rows={4}
              disabled={isSending}
            />
          </div>
        )}
        {msgType === 'TIME' && (
          <p style={s.hint}>Sends current device time with UTC offset.</p>
        )}
      </div>

      <label style={s.label}>Reliability</label>
      <div style={s.modeRow}>
        {([
          ['fast', 'Fast', 'Direct / VoIP'],
          ['balanced', 'Balanced', 'GSM call'],
          ['robust', 'Robust', 'PTT radio'],
        ] as [ReliabilityMode, string, string][]).map(([m, label, hint]) => (
          <button
            key={m}
            style={{ ...s.modeBtn, ...(mode === m ? s.modeBtnActive : {}) }}
            disabled={isSending}
            onClick={() => setMode(m)}
            title={hint}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={s.pttRow}>
        <input
          type="checkbox"
          id="ptt-check"
          checked={ptt}
          disabled={isSending}
          onChange={(e) => setPtt((e.target as HTMLInputElement).checked)}
          style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
        />
        <label for="ptt-check" style={{ ...s.pttLabel, cursor: 'pointer' }}>
          PTT / Walkie-talkie (adds 700 ms squelch-open tone)
        </label>
      </div>

      <div>
        <label style={s.label}>Transmission cycles: {cycles}</label>
        <input
          type="range" min={1} max={9} value={cycles}
          style={s.range}
          disabled={isSending}
          onInput={(e) => setCycles(Number((e.target as HTMLInputElement).value))}
        />
      </div>

      {estimatedSec !== null && (
        <div style={s.estimate}>
          ~{estimatedSec.toFixed(1)} s estimated
          {isSending && cycleDisplay.total > 0 && ` · cycle ${cycleDisplay.current}/${cycleDisplay.total}`}
        </div>
      )}

      <div style={s.btnRow}>
        <button
          style={s.sendBtn}
          onClick={handleSend}
        >
          {isSending ? `+ Add cycle (${cycleDisplay.current}/${cycleDisplay.total})` : '▶ Transmit'}
        </button>

        {isSending && (
          <button style={s.abortBtn} onClick={handleAbort} title="Abort transmission">
            ✕ Abort
          </button>
        )}
      </div>

      {progress && isSending && <StatusBar text={progress} color="var(--accent)" />}
      {state === 'done' && <StatusBar text="✓ Done" color="var(--green)" />}
      {errorMsg && <StatusBar text={`✗ ${errorMsg}`} color="var(--red)" />}

      <div>
        <button style={s.debugToggle} onClick={() => setShowDebug(!showDebug)}>
          {showDebug ? '▲ Hide debug' : '▼ Debug: wire bytes'}
        </button>
        {showDebug && (
          <div style={s.debugPanel}>
            {debugFrames ? (
              debugFrames.map((frame, i) => (
                <FrameHex key={i} frame={frame} index={i} total={debugFrames.length} />
              ))
            ) : (
              <span style={{ color: 'var(--muted)' }}>Fill in the fields above to preview.</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FrameHex({ frame, index, total }: { frame: TrilinkFrame; index: number; total: number }) {
  const bytes = encodeFrame(frame);
  const payloadLen = bytes[3] ?? 0;

  // Section ranges: [start, end exclusive, label, color]
  const sections: Array<[number, number, string, string]> = [
    [0, 1, 'VER|FL', '#a78bfa'],
    [1, 2, 'TYPE',   '#60a5fa'],
    [2, 3, 'SEG',    '#f97316'],
    [3, 4, 'LEN',    '#facc15'],
    [4, 4 + payloadLen, 'PAYLOAD', '#4ade80'],
    [4 + payloadLen, bytes.length, 'CRC16', '#f87171'],
  ];

  function colorForByte(idx: number): string {
    for (const [start, end, , color] of sections) {
      if (idx >= start && idx < end) return color;
    }
    return 'var(--muted)';
  }

  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={s.debugFrameTitle}>
        Frame {index + 1}/{total} · {bytes.length} bytes
      </div>
      <div style={s.hexRow}>
        {Array.from(bytes).map((b, i) => (
          <span key={i} style={{ ...s.hexByte, color: colorForByte(i) }}>
            {b.toString(16).padStart(2, '0').toUpperCase()}
          </span>
        ))}
      </div>
      <div style={s.legendRow}>
        {sections.filter(([start, end]) => end > start).map(([, , label, color]) => (
          <span key={label} style={{ ...s.legendItem, color }}>■ {label}</span>
        ))}
      </div>
    </div>
  );
}

function Field({ label, placeholder, value, onChange, disabled }: {
  label: string; placeholder: string; value: string; onChange: (v: string) => void; disabled?: boolean;
}) {
  return (
    <div>
      <label style={s.label}>{label}</label>
      <input
        style={s.input}
        type="text"
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
      />
    </div>
  );
}

function StatusBar({ text, color }: { text: string; color: string }) {
  return <div style={{ ...s.status, color }}>{text}</div>;
}

const s = {
  container: { display: 'flex', flexDirection: 'column' as const, gap: '16px' },
  heading: { fontSize: '20px', fontWeight: 600, marginBottom: '4px' },
  label: { display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '6px', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  typeRow: { display: 'flex', gap: '8px', flexWrap: 'wrap' as const },
  typeBtn: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    color: 'var(--muted)',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    fontSize: '13px',
    padding: '6px 14px',
  },
  typeBtnActive: { borderColor: 'var(--accent)', color: 'var(--accent)', background: 'var(--accent-dim)' },
  fields: { display: 'flex', flexDirection: 'column' as const, gap: '12px' },
  input: {
    width: '100%',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    color: 'var(--text)',
    fontSize: '15px',
    padding: '10px 12px',
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  textarea: {
    width: '100%',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    color: 'var(--text)',
    fontSize: '15px',
    padding: '10px 12px',
    resize: 'vertical' as const,
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box' as const,
  },
  modeRow: { display: 'flex', gap: '8px' },
  modeBtn: {
    flex: 1,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    color: 'var(--muted)',
    cursor: 'pointer',
    fontSize: '13px',
    padding: '8px 0',
  },
  modeBtnActive: { borderColor: 'var(--accent)', color: 'var(--accent)', background: 'var(--accent-dim)' },
  pttRow: { display: 'flex', alignItems: 'center', gap: '8px' },
  pttLabel: { fontSize: '13px', color: 'var(--muted)' },
  range: { width: '100%', accentColor: 'var(--accent)', display: 'block' as const, marginTop: '4px' },
  estimate: {
    fontSize: '13px',
    color: 'var(--muted)',
    padding: '8px 12px',
    background: 'var(--surface)',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--border)',
  },
  btnRow: { display: 'flex', gap: '8px' },
  sendBtn: {
    flex: 1,
    background: 'var(--accent)',
    border: 'none',
    borderRadius: 'var(--radius)',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '15px',
    fontWeight: 600,
    padding: '14px',
  },
  abortBtn: {
    background: 'var(--surface)',
    border: '1px solid var(--red)',
    borderRadius: 'var(--radius)',
    color: 'var(--red)',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
    padding: '14px 18px',
    flexShrink: 0,
  },
  status: {
    fontSize: '14px',
    padding: '10px 12px',
    background: 'var(--surface)',
    borderRadius: 'var(--radius)',
  },
  hint: { color: 'var(--muted)', fontSize: '14px' },
  debugToggle: {
    background: 'transparent',
    border: 'none',
    color: 'var(--muted)',
    cursor: 'pointer',
    fontSize: '12px',
    padding: '0',
    textDecoration: 'underline',
  },
  debugPanel: {
    marginTop: '8px',
    padding: '12px',
    background: '#0a0a0a',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--border)',
    fontFamily: 'var(--font)',
    fontSize: '13px',
  },
  debugFrameTitle: {
    fontSize: '11px',
    color: 'var(--muted)',
    marginBottom: '6px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  hexRow: { display: 'flex', gap: '6px', flexWrap: 'wrap' as const, marginBottom: '4px' },
  hexByte: { fontFamily: 'var(--font)', fontSize: '13px', letterSpacing: '0.05em' },
  legendRow: { display: 'flex', gap: '10px', flexWrap: 'wrap' as const },
  legendItem: { fontSize: '11px' },
} as const;
