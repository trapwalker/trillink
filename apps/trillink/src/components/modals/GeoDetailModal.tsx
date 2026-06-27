import type { TrilinkMessage, GeoMessage } from '@trillink/protocol';
import { buildAllMapUrls } from '@trillink/map-providers';
import { journal, showToast, type JournalEntry } from '../../store/index.js';
import { Modal }      from '../Modal.js';
import { LeafletMap } from '../LeafletMap.js';

interface Props {
  entry:   JournalEntry;
  onSend:  (msg: TrilinkMessage) => void;
  onClose: () => void;
}

export function GeoDetailModal({ entry, onSend, onClose }: Props) {
  const geo = entry.message as GeoMessage;
  const { lat, lon, alt } = geo;
  const mapUrls = buildAllMapUrls(lat, lon);

  // All GEO entries from the journal (for context markers)
  const contextMarkers = journal.value
    .filter((e) => e.message.type === 'GEO' && e.id !== entry.id)
    .map((e) => {
      const g = e.message as GeoMessage;
      return { lat: g.lat, lon: g.lon, primary: false, tooltip: formatTs(e.ts) };
    });

  function handleResend() {
    onSend({ type: 'GEO', lat, lon, ...(alt !== undefined ? { alt } : {}) });
  }

  function copyCoords() {
    navigator.clipboard?.writeText(`${lat.toFixed(6)}, ${lon.toFixed(6)}`)
      .then(() => showToast('Copied!'))
      .catch(() => {});
  }

  return (
    <Modal
      title="📍 Location details"
      onClose={onClose}
      footer={
        <button
          style={s.resendBtn}
          onClick={handleResend}
          title="Re-transmit this location"
        >
          ▶ Retransmit
        </button>
      }
    >
      <div style={s.body}>
        {/* Coordinate row */}
        <div style={s.coordRow}>
          <span style={s.coords}>
            {lat.toFixed(6)}, {lon.toFixed(6)}
            {alt !== undefined ? `, ${alt} m` : ''}
          </span>
          <button style={s.iconBtn} onClick={copyCoords} title="Copy">📋</button>
          {mapUrls.map(({ provider, url }) => (
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

        {/* Timestamp */}
        <div style={s.meta}>
          Received {entry.ts.toLocaleString()}
          {entry.direction === 'out' ? ' · Sent by you' : ''}
        </div>

        {/* Continuations */}
        {entry.continuations.length > 0 && (
          <div style={s.continuations}>
            {entry.continuations.map((c) => (
              <div key={c.id} style={s.contItem}>
                <span>📎</span>
                <ContinuationSummary msg={c.message} />
              </div>
            ))}
          </div>
        )}

        {/* Map */}
        <LeafletMap
          markers={[
            { lat, lon, primary: true, tooltip: `${lat.toFixed(4)}, ${lon.toFixed(4)}` },
            ...contextMarkers,
          ]}
          zoom={14}
          style={{ height: '320px' }}
        />
      </div>
    </Modal>
  );
}

function ContinuationSummary({ msg }: { msg: TrilinkMessage }) {
  switch (msg.type) {
    case 'TEXT':    return <span>{msg.text}</span>;
    case 'CONTACT': return <span>{msg.value}</span>;
    default:        return <span>{msg.type}</span>;
  }
}

function formatTs(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const s = {
  body: { display: 'flex', flexDirection: 'column' as const, gap: '12px' },
  coordRow: {
    display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' as const,
  },
  coords: {
    fontFamily: 'var(--font)', fontSize: '15px', color: 'var(--text)', flex: 1,
  },
  iconBtn: {
    background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px',
    padding: '0 2px',
  },
  mapLink: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--border)', borderRadius: '4px', color: 'var(--text)',
    fontSize: '11px', fontWeight: 700, height: '22px', minWidth: '24px',
    padding: '0 6px', textDecoration: 'none', fontFamily: 'var(--font)',
  },
  meta: { fontSize: '12px', color: 'var(--muted)' },
  continuations: {
    background: 'var(--surface)', borderRadius: 'var(--radius)',
    border: '1px solid var(--border)', padding: '8px 12px',
    display: 'flex', flexDirection: 'column' as const, gap: '4px',
  },
  contItem: { display: 'flex', gap: '8px', fontSize: '13px', color: 'var(--text)', alignItems: 'baseline' },
  resendBtn: {
    background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius)',
    color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: 600, padding: '8px 20px',
  },
} as const;
