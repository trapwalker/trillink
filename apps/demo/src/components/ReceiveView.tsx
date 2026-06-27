import { useState, useRef, useEffect, useCallback } from 'preact/hooks';
import type { TrilinkMessage } from '@trillink/protocol';
import { WebAudioAdapter } from '@trillink/audio-web';
import { TrilinkReceiver } from '@trillink/sdk';
import type { ReceiverEvent } from '@trillink/sdk';

interface ReceivedEntry {
  id: number;
  message: TrilinkMessage;
  isCont: boolean;
  ts: string;
}

interface Props {
  autoStart?: boolean;
  onStarted?: () => void;
}

const WATERFALL_W = 512;
const WATERFALL_H = 160;

export function ReceiveView({ autoStart, onStarted }: Props) {
  const [listening, setListening] = useState(false);
  const [signal, setSignal] = useState(false);
  const [log, setLog] = useState<ReceivedEntry[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [level, setLevel] = useState(0);

  const rxRef = useRef<TrilinkReceiver | null>(null);
  const adapterRef = useRef<WebAudioAdapter | null>(null);
  const idRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const signalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startListening = useCallback(async () => {
    setError('');
    setStatus('Starting…');

    try {
      const adapter = new WebAudioAdapter({ mode: 'balanced' });
      adapterRef.current = adapter;

      const rx = new TrilinkReceiver({
        audio: adapter,
        onLevel: (rms) => setLevel(rms),
        onEvent(e: ReceiverEvent) {
          if (e.type === 'listening') {
            setListening(true);
            setStatus('Listening…');
            onStarted?.();
          } else if (e.type === 'signal-detected') {
            setSignal(true);
            setStatus('Signal detected…');
            if (signalTimerRef.current) clearTimeout(signalTimerRef.current);
            signalTimerRef.current = setTimeout(() => setSignal(false), 3000);
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
  }, [onStarted]);

  async function stopListening() {
    cancelAnimationFrame(animRef.current);
    await rxRef.current?.stop();
    rxRef.current = null;
    adapterRef.current = null;
    setListening(false);
    setSignal(false);
    setLevel(0);
    setStatus('');
  }

  // Auto-start on mount when autoStart is set (initialised from #listen hash before first render)
  useEffect(() => {
    if (autoStart) {
      void startListening();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Waterfall animation loop
  useEffect(() => {
    if (!listening) {
      cancelAnimationFrame(animRef.current);
      // Clear canvas
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, WATERFALL_W, WATERFALL_H);

    function draw() {
      animRef.current = requestAnimationFrame(draw);

      const analyser = adapterRef.current?.analyser;
      if (!analyser || !canvas || !ctx) return;

      const bufLen = analyser.frequencyBinCount;
      const data = new Uint8Array(bufLen);
      analyser.getByteFrequencyData(data);

      // Show 0–5000 Hz range. At 48 kHz, fftSize=2048 → binWidth=23.4 Hz → 5000 Hz ≈ 213 bins.
      // We use min(bufLen, 256) to stay in the audio-modem range.
      const maxBin = Math.min(bufLen, 256);

      // Shift existing image down 1 row
      const existing = ctx.getImageData(0, 0, WATERFALL_W, WATERFALL_H - 1);
      ctx.putImageData(existing, 0, 1);

      // Draw new row at top
      for (let x = 0; x < WATERFALL_W; x++) {
        const binIdx = Math.floor(x * maxBin / WATERFALL_W);
        const val = (data[binIdx] ?? 0) / 255;
        // Color map: dark blue → cyan → green → yellow → white
        const r = Math.floor(val < 0.5 ? 0 : (val - 0.5) * 2 * 255);
        const g = Math.floor(val < 0.25 ? val * 4 * 180 : val < 0.75 ? 180 : 180 + (val - 0.75) * 4 * 75);
        const b = Math.floor(val < 0.25 ? 80 + val * 4 * 175 : Math.max(0, 255 - (val - 0.25) * (255 / 0.75)));
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, 0, 1, 1);
      }
    }

    animRef.current = requestAnimationFrame(draw);

    return () => cancelAnimationFrame(animRef.current);
  }, [listening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      void rxRef.current?.stop();
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  const vuWidth = Math.min(100, Math.round(level * 400));

  return (
    <div style={s.container}>
      <h2 style={s.heading}>Receive</h2>

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
          <span
            style={{
              ...s.dot,
              background: signal ? 'var(--green)' : 'var(--accent)',
              animation: signal ? 'none' : 'pulse 1.5s infinite',
            }}
          />
        )}
        {status && <span style={s.statusText}>{status}</span>}
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' as const }}>
            <span style={{ ...s.statusText, color: 'var(--red)' }}>{error}</span>
            <button style={s.tapBtn} onClick={startListening}>Tap to start</button>
          </div>
        )}
      </div>

      {listening && (
        <div style={s.meters}>
          <div style={s.vuTrack}>
            <div
              style={{
                ...s.vuBar,
                width: `${vuWidth}%`,
                background: level > 0.3 ? (level > 0.7 ? 'var(--red)' : 'var(--green)') : 'var(--accent)',
              }}
            />
          </div>
          <canvas
            ref={canvasRef}
            width={WATERFALL_W}
            height={WATERFALL_H}
            style={s.waterfall}
          />
          <div style={s.waterfallLabel}>
            <span style={s.freqLabel}>0 Hz</span>
            <span style={s.freqLabel}>~5000 Hz</span>
          </div>
        </div>
      )}

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
  statusRow: { display: 'flex', alignItems: 'center', gap: '8px', minHeight: '20px', flexWrap: 'wrap' as const },
  tapBtn: {
    background: 'var(--accent)',
    border: 'none',
    borderRadius: 'var(--radius)',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '13px',
    padding: '6px 14px',
    fontWeight: 600,
  },
  dot: { width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0 },
  statusText: { fontSize: '14px', color: 'var(--muted)' },
  meters: { display: 'flex', flexDirection: 'column' as const, gap: '6px' },
  vuTrack: {
    height: '6px',
    background: 'var(--surface)',
    borderRadius: '3px',
    overflow: 'hidden',
    border: '1px solid var(--border)',
  },
  vuBar: { height: '100%', borderRadius: '3px', transition: 'width 40ms linear, background 100ms' },
  waterfall: {
    width: '100%',
    height: `${WATERFALL_H}px`,
    borderRadius: 'var(--radius)',
    imageRendering: 'pixelated' as const,
    display: 'block' as const,
    background: '#0a0a0a',
  },
  waterfallLabel: { display: 'flex', justifyContent: 'space-between' },
  freqLabel: { fontSize: '10px', color: 'var(--muted)' },
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
