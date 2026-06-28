import { journal, deleteEntry, copyToClipboard, type JournalEntry } from '../store/index.js';
import { buildAllMapUrls } from '@trillink/map-providers';
import type { TrilinkMessage, GeoMessage, ContactMessage } from '@trillink/protocol';

interface Props {
  loading?: boolean;
  onSelectEntry: (entry: JournalEntry) => void;
}

export function Journal({ loading, onSelectEntry }: Props) {
  const entries = journal.value;

  if (loading) {
    return (
      <div style={s.container}>
        <div style={s.empty}>
          <span style={s.emptyIcon}>◌</span>
          <span>Loading…</span>
        </div>
      </div>
    );
  }

  return (
    <div style={s.container}>
      {entries.length === 0 ? (
        <div style={s.empty}>
          <span style={s.emptyIcon}>◎</span>
          <span>Waiting for messages…</span>
        </div>
      ) : (
        entries.map((entry) => (
          <EntryCard key={entry.id} entry={entry} onSelect={onSelectEntry} />
        ))
      )}
    </div>
  );
}

function EntryCard({ entry, onSelect }: { entry: JournalEntry; onSelect: (e: JournalEntry) => void }) {
  const isIn    = entry.direction === 'in';
  const msg     = entry.message;
  const echoed  = entry.selfEchoAt !== undefined;
  const dirColor = isIn ? 'var(--accent)' : 'var(--green)';

  return (
    <div style={{ ...s.card, borderLeft: `3px solid ${dirColor}` }}>
      <div
        style={{ ...s.row, cursor: 'pointer' }}
        onClick={() => onSelect(entry)}
      >
        <span style={{ ...s.dir, color: dirColor }}>{isIn ? '◀' : '▶'}</span>
        <span style={s.time}>{formatTs(entry.ts)}</span>
        <span style={s.type}>{msg.type}</span>
        <span style={s.colon}>:</span>
        <span style={s.content} title="Open details">
          <ContentText msg={msg} />
        </span>
        <div style={s.actions} onClick={(e) => e.stopPropagation()}>
          {msg.type === 'GEO' && <MapLinks lat={(msg as GeoMessage).lat} lon={(msg as GeoMessage).lon} />}
          {msg.type === 'CONTACT' && <CallBtn value={(msg as ContactMessage).value} />}
          <ActionBtn title="Copy" onClick={() => copyToClipboard(getClipText(msg))}>📋</ActionBtn>
          <ActionBtn title="Delete" onClick={() => deleteEntry(entry.id)}>🗑</ActionBtn>
        </div>
      </div>

      {entry.continuations.map((c) => (
        <div key={c.id} style={s.contRow}>
          <span style={s.contIcon}>📎</span>
          <span style={s.type}>{c.message.type}</span>
          <span style={s.colon}>:</span>
          <span style={s.content}><ContentText msg={c.message} /></span>
        </div>
      ))}

      {echoed && (
        <div style={s.echoRow}>
          <span style={s.echoArrow}>◀</span>
          <span style={s.echoLabel}>echo · {formatTs(entry.selfEchoAt!)}</span>
        </div>
      )}
    </div>
  );
}

function ActionBtn({ title, onClick, children }: { title: string; onClick: () => void; children: string }) {
  return (
    <button style={s.actionBtn} title={title} onClick={onClick}>{children}</button>
  );
}

function CallBtn({ value }: { value: string }) {
  const href = value.startsWith('+') || /^\d/.test(value) ? `tel:${value}` : undefined;
  if (!href) return null;
  return (
    <a href={href} style={s.actionBtn} title="Call" onClick={(e) => e.stopPropagation()}>📞</a>
  );
}

function MapLinks({ lat, lon }: { lat: number; lon: number }) {
  const urls = buildAllMapUrls(lat, lon);
  return (
    <>
      {urls.map(({ provider, url }) => (
        <a
          key={provider.id}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={s.mapLink}
          title={`Open in ${provider.name}`}
          onClick={(e) => e.stopPropagation()}
        >
          {provider.label}
        </a>
      ))}
    </>
  );
}

function ContentText({ msg }: { msg: TrilinkMessage }) {
  switch (msg.type) {
    case 'GEO':
      return (
        <span style={s.mono}>
          {fmtCoord(msg.lat, 'NS')}{' '}{fmtCoord(msg.lon, 'EW')}
          {msg.alt !== undefined ? ` · ${msg.alt} m` : ''}
        </span>
      );
    case 'CONTACT':
      return <span>{msg.value}</span>;
    case 'TEXT':
      return <span>«{msg.text}»</span>;
    case 'TIME': {
      const d = new Date(msg.unixTs * 1000);
      return <span style={s.mono}>{d.toISOString().replace('T', ' ').slice(0, 16)} UTC</span>;
    }
    default:
      return <span style={{ color: 'var(--muted)' }}>{(msg as TrilinkMessage).type}</span>;
  }
}

function getClipText(msg: TrilinkMessage): string {
  switch (msg.type) {
    case 'GEO':      return `${msg.lat.toFixed(6)}, ${msg.lon.toFixed(6)}${msg.alt !== undefined ? ` alt:${msg.alt}m` : ''}`;
    case 'CONTACT':  return msg.value;
    case 'TEXT':     return msg.text;
    case 'TIME':     return new Date(msg.unixTs * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    default:         return msg.type;
  }
}

function fmtCoord(deg: number, hems: string): string {
  const [pos, neg] = hems.split('');
  return `${Math.abs(deg).toFixed(4)}°${deg >= 0 ? pos : neg}`;
}

function formatTs(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const s = {
  container: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto' as const,
    padding: '6px 10px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  empty: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    height: '100%',
    color: 'var(--muted)',
    fontSize: '14px',
  },
  emptyIcon: { fontSize: '32px', opacity: 0.3 },
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    overflow: 'hidden',
    flexShrink: 0,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    padding: '5px 8px',
    minWidth: 0,
  },
  contRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    padding: '2px 8px 5px 24px',
    minWidth: 0,
  },
  dir: { fontSize: '10px', fontWeight: 700, flexShrink: 0 },
  time: { fontSize: '11px', color: 'var(--muted)', flexShrink: 0, fontFamily: 'var(--font)' },
  type: { fontSize: '11px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.04em', flexShrink: 0 },
  colon: { fontSize: '11px', color: 'var(--muted)', flexShrink: 0 },
  content: { fontSize: '13px', color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  mono: { fontFamily: 'var(--font)' },
  contIcon: { fontSize: '10px', flexShrink: 0 },
  echoRow: {
    display: 'flex', alignItems: 'center', gap: '5px',
    padding: '2px 8px 5px 8px',
    borderTop: '1px solid var(--border)',
  },
  echoArrow: { fontSize: '10px', color: 'var(--accent)', flexShrink: 0 },
  echoLabel: { fontSize: '11px', color: 'var(--accent)', fontFamily: 'var(--font)' },
  actions: { display: 'flex', alignItems: 'center', gap: '2px', marginLeft: 'auto', flexShrink: 0 },
  actionBtn: {
    background: 'none',
    border: 'none',
    borderRadius: '4px',
    color: 'var(--muted)',
    cursor: 'pointer',
    fontSize: '12px',
    lineHeight: 1,
    padding: '3px 4px',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
  },
  mapLink: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--border)',
    borderRadius: '3px',
    color: 'var(--text)',
    fontSize: '9px',
    fontWeight: 700,
    height: '18px',
    minWidth: '20px',
    padding: '0 3px',
    textDecoration: 'none',
    fontFamily: 'var(--font)',
    letterSpacing: '0.02em',
  },
} as const;
