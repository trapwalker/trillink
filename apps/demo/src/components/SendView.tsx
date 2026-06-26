import { useState } from 'preact/hooks';
import type { TrilinkMessage } from '@trillink/protocol';
import { ContactType } from '@trillink/protocol';
import { WebAudioAdapter, type AudioChannel } from '@trillink/audio-web';
import { TrilinkSender } from '@trillink/sdk';
import type { SenderEvent } from '@trillink/sdk';

type MsgType = 'GEO' | 'CONTACT' | 'TEXT' | 'TIME';
type SendState = 'idle' | 'sending' | 'done' | 'error';

export function SendView() {
  const [msgType, setMsgType] = useState<MsgType>('GEO');
  const [channel, setChannel] = useState<AudioChannel>('voip');
  const [cycles, setCycles] = useState(3);
  const [state, setState] = useState<SendState>('idle');
  const [progress, setProgress] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // GEO fields
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [alt, setAlt] = useState('');

  // CONTACT fields
  const [contactValue, setContactValue] = useState('');

  // TEXT fields
  const [text, setText] = useState('');

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

  async function handleSend() {
    const message = buildMessage();
    if (!message) { setErrorMsg('Please fill in all required fields.'); return; }

    setState('sending');
    setErrorMsg('');
    setProgress('Initializing…');

    try {
      const adapter = new WebAudioAdapter({ channel });
      const sender = new TrilinkSender({
        audio: adapter,
        cycles,
        preambleDurationMs: channel === 'ptt' ? 700 : 0,
        onEvent(e: SenderEvent) {
          if (e.type === 'cycle-start') {
            setProgress(`Transmitting cycle ${e.cycle + 1} of ${e.total}…`);
          } else if (e.type === 'transmission-complete') {
            setProgress('Transmission complete.');
            setState('done');
          }
        },
      });

      await sender.send([{ message }]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
      setState('error');
    }
  }

  const canSend = state === 'idle' || state === 'done' || state === 'error';

  return (
    <div style={s.container}>
      <h2 style={s.heading}>Transmit</h2>

      <label style={s.label}>Message type</label>
      <div style={s.typeRow}>
        {(['GEO', 'CONTACT', 'TEXT', 'TIME'] as MsgType[]).map((t) => (
          <button
            key={t}
            style={{ ...s.typeBtn, ...(msgType === t ? s.typeBtnActive : {}) }}
            onClick={() => { setMsgType(t); setState('idle'); }}
          >
            {t}
          </button>
        ))}
      </div>

      <div style={s.fields}>
        {msgType === 'GEO' && (
          <>
            <Field label="Latitude" placeholder="55.7558" value={lat} onChange={setLat} />
            <Field label="Longitude" placeholder="37.6176" value={lon} onChange={setLon} />
            <Field label="Altitude (m, optional)" placeholder="200" value={alt} onChange={setAlt} />
          </>
        )}
        {msgType === 'CONTACT' && (
          <Field label="Phone number (E.164)" placeholder="+79161234567" value={contactValue} onChange={setContactValue} />
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
            />
          </div>
        )}
        {msgType === 'TIME' && (
          <p style={s.hint}>Sends current device time with UTC offset.</p>
        )}
      </div>

      <label style={s.label}>Channel</label>
      <select style={s.select} value={channel} onChange={(e) => setChannel((e.target as HTMLSelectElement).value as AudioChannel)}>
        <option value="direct">Direct (same room)</option>
        <option value="voip">VoIP (Telegram, WhatsApp, Discord)</option>
        <option value="gsm">GSM phone call</option>
        <option value="ptt">PTT / Walkie-talkie</option>
      </select>

      <label style={s.label}>Transmission cycles: {cycles}</label>
      <input
        type="range" min={1} max={9} value={cycles}
        style={s.range}
        onInput={(e) => setCycles(Number((e.target as HTMLInputElement).value))}
      />

      <button
        style={{ ...s.sendBtn, ...(state === 'sending' ? s.sendBtnDisabled : {}) }}
        onClick={handleSend}
        disabled={!canSend || state === 'sending'}
      >
        {state === 'sending' ? 'Transmitting…' : '▶ Transmit'}
      </button>

      {progress && state === 'sending' && <StatusBar text={progress} color="var(--accent)" />}
      {state === 'done' && <StatusBar text="✓ Done" color="var(--green)" />}
      {errorMsg && <StatusBar text={`✗ ${errorMsg}`} color="var(--red)" />}
    </div>
  );
}

function Field({ label, placeholder, value, onChange }: {
  label: string; placeholder: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label style={s.label}>{label}</label>
      <input
        style={s.input}
        type="text"
        placeholder={placeholder}
        value={value}
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
  },
  select: {
    width: '100%',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    color: 'var(--text)',
    fontSize: '15px',
    padding: '10px 12px',
    outline: 'none',
  },
  range: { width: '100%', accentColor: 'var(--accent)' },
  sendBtn: {
    background: 'var(--accent)',
    border: 'none',
    borderRadius: 'var(--radius)',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: 600,
    padding: '14px',
    width: '100%',
  },
  sendBtnDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  status: { fontSize: '14px', padding: '10px 12px', background: 'var(--surface)', borderRadius: 'var(--radius)' },
  hint: { color: 'var(--muted)', fontSize: '14px' },
} as const;
