import { journal, showToast, type JournalEntry } from '../store/index.js';
import { buildAllMapUrls } from '@trillink/map-providers';
import type { TrilinkMessage, GeoMessage } from '@trillink/protocol';

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
  const isIn = entry.direction === 'in';
  const ts = formatTs(entry.ts);

  return (
    <div
      style={{
        ...s.card,
        borderLeft: `3px solid ${isIn ? 'var(--accent)' : 'var(--green)'}`,
        cursor: entry.message.type === 'GEO' ? 'pointer' : 'default',
      }}
      onClick={() => onSelect(entry)}
    >
      <div style={s.cardHeader}>
        <span style={{ ...s.dirIcon, color: isIn ? 'var(--accent)' : 'var(--green)' }}>
          {isIn ? '◀' : '▶'}
        </span>
        <span style={s.msgType}>{entry.message.type}</span>
        <span style={s.ts}>{ts}</span>
        {entry.message.type === 'GEO' && (
          <MapButtons lat={(entry.message as GeoMessage).lat} lon={(entry.message as GeoMessage).lon} />
        )}
      </div>

      <div style={s.cardBody}>
        <MessageSummary msg={entry.message} />
        {entry.continuations.map((c) => (
          <div key={c.id} style={s.continuation}>
            <span style={s.contIcon}>📎</span>
            <MessageSummary msg={c.message} compact />
          </div>
        ))}
      </div>
    </div>
  );
}

function MapButtons({ lat, lon }: { lat: number; lon: number }) {
  const urls = buildAllMapUrls(lat, lon);
  return (
    <div style={s.mapBtns} onClick={(e) => e.stopPropagation()}>
      <CopyBtn text={`${lat.toFixed(6)}, ${lon.toFixed(6)}`} />
      {urls.map(({ provider, url }) => (
        <a
          key={provider.id}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={s.mapLink}
          title={`Open in ${provider.name}`}
        >
          {provider.label}
        </a>
      ))}
    </div>
  );
}

function CopyBtn({ text }: { text: string }) {
  function copy(e: Event) {
    e.stopPropagation();
    navigator.clipboard?.writeText(text)
      .then(() => showToast('Copied!'))
      .catch(() => {});
  }
  return (
    <button style={s.copyBtn} onClick={copy} title="Copy coordinates">
      📋
    </button>
  );
}

function MessageSummary({ msg, compact = false }: { msg: TrilinkMessage; compact?: boolean }) {
  switch (msg.type) {
    case 'GEO':
      return (
        <span style={compact ? s.compactText : s.geoCoords}>
          {fmtCoord(msg.lat, 'NS')}{' '}{fmtCoord(msg.lon, 'EW')}
          {msg.alt !== undefined ? ` · ${msg.alt} m` : ''}
        </span>
      );
    case 'CONTACT':
      return <span style={compact ? s.compactText : s.bodyText}>{msg.value}</span>;
    case 'TEXT':
      return <span style={compact ? s.compactText : s.bodyText}>«{msg.text}»</span>;
    case 'TIME': {
      const d = new Date(msg.unixTs * 1000);
      return <span style={compact ? s.compactText : s.bodyText}>{d.toISOString().replace('T', ' ').slice(0, 16)} UTC</span>;
    }
    default:
      return <span style={s.compactText}>{msg.type}</span>;
  }
}

function fmtCoord(deg: number, hems: string): string {
  const [pos, neg] = hems.split('');
  const hem = deg >= 0 ? pos : neg;
  return `${Math.abs(deg).toFixed(4)}°${hem}`;
}

function formatTs(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const s = {
  container: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '8px 12px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
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
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 10px',
    borderBottom: '1px solid var(--border)',
    flexWrap: 'wrap' as const,
  },
  dirIcon: { fontSize: '12px', fontWeight: 700 },
  msgType: { fontFamily: 'var(--font)', fontSize: '11px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.05em' },
  ts: { fontSize: '11px', color: 'var(--muted)', marginLeft: '2px' },
  mapBtns: { display: 'flex', gap: '4px', marginLeft: 'auto', alignItems: 'center' },
  mapLink: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--border)',
    borderRadius: '4px',
    color: 'var(--text)',
    fontSize: '10px',
    fontWeight: 700,
    height: '20px',
    minWidth: '22px',
    padding: '0 4px',
    textDecoration: 'none',
    fontFamily: 'var(--font)',
  },
  copyBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '12px',
    padding: '0 2px',
    lineHeight: 1,
  },
  cardBody: { padding: '6px 10px', display: 'flex', flexDirection: 'column' as const, gap: '4px' },
  geoCoords: { fontFamily: 'var(--font)', fontSize: '14px', color: 'var(--text)', letterSpacing: '0.03em' },
  bodyText: { fontSize: '14px', color: 'var(--text)' },
  compactText: { fontSize: '12px', color: 'var(--muted)' },
  continuation: { display: 'flex', gap: '6px', alignItems: 'baseline' },
  contIcon: { fontSize: '11px' },
} as const;
