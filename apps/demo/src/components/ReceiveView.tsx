import { useState, useRef } from 'preact/hooks';
import type { TrilinkMessage } from '@trillink/protocol';
import { WebAudioAdapter, type AudioChannel } from '@trillink/audio-web';
import { TrilinkReceiver } from '@trillink/sdk';
import type { ReceiverEvent } from '@trillink/sdk';

interface ReceivedEntry {
  id: number;
  message: TrilinkMessage;
  isCont: boolean;
  ts: string;
}

export function ReceiveView() {
  const [listening, setListening] = useState(false);
  const [signal, setSignal] = useState(false);
  const [channel, setChannel] = useState<AudioChannel>('voip');
  const [log, setLog] = useState<ReceivedEntry[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const rxRef = useRef<TrilinkReceiver | null>(null);
  const idRef = useRef(0);

  async function startListening() {
    setError('');
    setStatus('Starting…');

    try {
      const adapter = new WebAudioAdapter({ channel });
      const rx = new TrilinkReceiver({
        audio: adapter,
        onEvent(e: ReceiverEvent) {
          if (e.type === 'listening') {
            setListening(true);
            setStatus('Listening…');
          } else if (e.type === 'signal-detected') {
            setSignal(true);
            setStatus('Signal detected…');
            setTimeout(() => setSignal(false), 3000);
          } else if (e.type === 'fragment-received') {
            setStatus(`Fragment ${e.segIdx + 1}/${e.segTotal}…`);
          } else if (e.type === 'message-ready') {
            const entry: ReceivedEntry = {
              id: ++idRef.current,
              message: e.message,
              isCont: e.isCont,
              ts: new Date().toLocaleTimeString(),
            };
            setLog((prev) => [entry, ...prev].slice(0, 50));
            setStatus('Message received.');
          } else if (e.type === 'frame-error') {
            setStatus(`Frame error: ${e.reason}`);
          }
        },
      });
      rxRef.current = rx;
      await rx.start();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Microphone access denied');
      setListening(false);
      setStatus('');
    }
  }

  async function stopListening() {
    await rxRef.current?.stop();
    rxRef.current = null;
    setListening(false);
    setSignal(false);
    setStatus('');
  }

  return (
    <div style={s.container}>
      <h2 style={s.heading}>Receive</h2>

      <label style={s.label}>Channel</label>
      <select
        style={s.select}
        value={channel}
        disabled={listening}
        onChange={(e) => setChannel((e.target as HTMLSelectElement).value as AudioChannel)}
      >
        <option value="direct">Direct (same room)</option>
        <option value="voip">VoIP (Telegram, WhatsApp, Discord)</option>
        <option value="gsm">GSM phone call</option>
        <option value="ptt">PTT / Walkie-talkie</option>
      </select>

      <div style={s.controls}>
        {!listening ? (
          <button style={s.btn} onClick={startListening}>
            ◉ Start listening
          </button>
        ) : (
          <button style={{ ...s.btn, background: 'var(--red)' }} onClick={stopListening}>
            ■ Stop
          </button>
        )}
        {log.length > 0 && (
          <button style={s.clearBtn} onClick={() => setLog([])}>
            Clear
          </button>
        )}
      </div>

      <div style={s.statusRow}>
        {listening && (
          <span style={{ ...s.dot, background: signal ? 'var(--green)' : 'var(--accent)', animation: signal ? 'none' : 'pulse 1.5s infinite' }} />
        )}
        {status && <span style={s.statusText}>{status}</span>}
        {error && <span style={{ ...s.statusText, color: 'var(--red)' }}>{error}</span>}
      </div>

      <div style={s.log}>
        {log.length === 0 && !listening && (
          <p style={s.empty}>No messages received yet.</p>
        )}
        {log.map((entry) => (
          <MessageCard key={entry.id} entry={entry} />
        ))}
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </div>
  );
}

function MessageCard({ entry }: { entry: ReceivedEntry }) {
  const { message, isCont, ts } = entry;

  return (
    <div style={s.card}>
      <div style={s.cardHeader}>
        <span style={s.cardType}>{message.type}</span>
        {isCont && <span style={s.contBadge}>+ continuation</span>}
        <span style={s.cardTs}>{ts}</span>
      </div>
      <div style={s.cardBody}>
        <MessageBody msg={message} />
      </div>
    </div>
  );
}

function MessageBody({ msg }: { msg: TrilinkMessage }) {
  switch (msg.type) {
    case 'GEO':
      return (
        <div>
          <Row k="lat" v={msg.lat.toFixed(6)} />
          <Row k="lon" v={msg.lon.toFixed(6)} />
          {msg.alt !== undefined && <Row k="alt" v={`${msg.alt} m`} />}
          <a
            style={s.mapLink}
            href={`https://maps.google.com/?q=${msg.lat},${msg.lon}`}
            target="_blank"
            rel="noopener"
          >
            Open in maps ↗
          </a>
        </div>
      );
    case 'CONTACT':
      return <Row k={msg.contactType.toString()} v={msg.value} />;
    case 'TEXT':
      return <p style={s.textMsg}>{msg.text}</p>;
    case 'TIME': {
      const d = new Date(msg.unixTs * 1000);
      return <Row k="time" v={d.toISOString()} />;
    }
    default:
      return <pre style={s.raw}>{JSON.stringify(msg, null, 2)}</pre>;
  }
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={s.row}>
      <span style={s.rowKey}>{k}</span>
      <span style={s.rowVal}>{v}</span>
    </div>
  );
}

const s = {
  container: { display: 'flex', flexDirection: 'column' as const, gap: '16px' },
  heading: { fontSize: '20px', fontWeight: 600, marginBottom: '4px' },
  label: { display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '6px', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
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
  controls: { display: 'flex', gap: '8px' },
  btn: {
    flex: 1,
    background: 'var(--accent)',
    border: 'none',
    borderRadius: 'var(--radius)',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: 600,
    padding: '14px',
  },
  clearBtn: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    color: 'var(--muted)',
    cursor: 'pointer',
    fontSize: '14px',
    padding: '14px 16px',
  },
  statusRow: { display: 'flex', alignItems: 'center', gap: '8px', minHeight: '20px' },
  dot: { width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0 },
  statusText: { fontSize: '14px', color: 'var(--muted)' },
  log: { display: 'flex', flexDirection: 'column' as const, gap: '8px' },
  empty: { color: 'var(--muted)', fontSize: '14px', textAlign: 'center' as const, padding: '32px 0' },
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    overflow: 'hidden',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    borderBottom: '1px solid var(--border)',
  },
  cardType: { fontFamily: 'var(--font)', fontSize: '12px', color: 'var(--accent)', fontWeight: 700 },
  contBadge: { fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic' },
  cardTs: { marginLeft: 'auto', fontSize: '11px', color: 'var(--muted)' },
  cardBody: { padding: '12px' },
  row: { display: 'flex', gap: '12px', alignItems: 'baseline', fontSize: '14px' },
  rowKey: { fontFamily: 'var(--font)', fontSize: '11px', color: 'var(--muted)', minWidth: '60px' },
  rowVal: { fontFamily: 'var(--font)', color: 'var(--text)' },
  mapLink: { display: 'inline-block', marginTop: '6px', fontSize: '13px', color: 'var(--accent)', textDecoration: 'none' },
  textMsg: { fontSize: '14px', lineHeight: 1.6 },
  raw: { fontSize: '12px', color: 'var(--muted)', whiteSpace: 'pre-wrap' as const },
} as const;
