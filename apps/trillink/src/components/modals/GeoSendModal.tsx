import { useState, useEffect, useCallback } from 'preact/hooks';
import type { TrilinkMessage } from '@trillink/protocol';
import { parseCoord } from '@trillink/coord-parser';
import { getLruCoords, pushLruCoord } from '../../store/index.js';
import { Modal }      from '../Modal.js';
import { LeafletMap } from '../LeafletMap.js';

interface Props {
  onSend:  (msg: TrilinkMessage) => void;
  onClose: () => void;
}

export function GeoSendModal({ onSend, onClose }: Props) {
  const [coordInput, setCoordInput] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lon, setLon] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [locating, setLocating] = useState(false);
  const [showLru, setShowLru] = useState(false);
  const lru = getLruCoords();

  function applyCoord(newLat: number, newLon: number, label?: string) {
    setLat(newLat);
    setLon(newLon);
    setCoordInput(label ?? `${newLat.toFixed(6)}, ${newLon.toFixed(6)}`);
    setError('');
  }

  function handleInputChange(val: string) {
    setCoordInput(val);
    if (!val.trim()) { setLat(null); setLon(null); return; }
    const parsed = parseCoord(val);
    if (parsed) {
      setLat(parsed.lat);
      setLon(parsed.lon);
      setError('');
    } else {
      setLat(null);
      setLon(null);
    }
  }

  function locateMe() {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        applyCoord(coords.latitude, coords.longitude);
        setLocating(false);
      },
      () => { setError('Geolocation unavailable'); setLocating(false); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  // Cmd/Ctrl+Enter submits
  const handleKey = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSend();
  }, [lat, lon]);

  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  function handleSend() {
    if (lat === null || lon === null) {
      setError('Enter or pick valid coordinates');
      return;
    }
    pushLruCoord({ lat, lon });
    onSend({ type: 'GEO', lat, lon });
  }

  const hasCoords = lat !== null && lon !== null;

  return (
    <Modal
      title="📍 Send location"
      onClose={onClose}
      footer={
        <>
          <button style={btnStyle('secondary')} onClick={onClose}>Cancel</button>
          <button style={btnStyle('primary')} onClick={handleSend} disabled={!hasCoords}>
            ▶ Send
          </button>
        </>
      }
    >
      <div style={s.form}>
        <div style={s.inputWrap}>
          <div style={s.inputRow}>
            <input
              style={s.input}
              type="text"
              placeholder="55.7558, 37.6176  or  maps.yandex.ru/...  or  55°45′N 37°37′E"
              value={coordInput}
              autoFocus
              onInput={(e) => handleInputChange((e.target as HTMLInputElement).value)}
              onFocus={() => setShowLru(lru.length > 0)}
              onBlur={() => setTimeout(() => setShowLru(false), 150)}
            />
            <button style={s.locBtn} onClick={locateMe} disabled={locating} title="Use my location">
              {locating ? '…' : '📍'}
            </button>
          </div>

          {showLru && lru.length > 0 && (
            <div style={s.lru}>
              {lru.map((c, i) => (
                <button
                  key={i}
                  style={s.lruItem}
                  onMouseDown={() => applyCoord(c.lat, c.lon, c.label)}
                >
                  {c.label ?? `${c.lat.toFixed(4)}, ${c.lon.toFixed(4)}`}
                </button>
              ))}
            </div>
          )}
        </div>

        {error && <div style={s.error}>{error}</div>}

        <LeafletMap
          markers={hasCoords ? [{ lat: lat!, lon: lon!, primary: true }] : []}
          center={hasCoords ? { lat: lat!, lon: lon! } : { lat: 55.7558, lon: 37.6176 }}
          draggable
          onMove={(newLat, newLon) => applyCoord(newLat, newLon)}
          onClick={(newLat, newLon) => applyCoord(newLat, newLon)}
        />
        <p style={s.hint}>Double-click or drag the marker to pick a location.</p>
      </div>
    </Modal>
  );
}

function btnStyle(variant: 'primary' | 'secondary') {
  return variant === 'primary' ? {
    background: 'var(--accent)',
    border: 'none',
    borderRadius: 'var(--radius)',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
    padding: '8px 20px',
  } : {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    color: 'var(--muted)',
    cursor: 'pointer',
    fontSize: '14px',
    padding: '8px 16px',
  };
}

const s = {
  form: { display: 'flex', flexDirection: 'column' as const, gap: '10px' },
  inputWrap: { position: 'relative' as const },
  inputRow: { display: 'flex', gap: '8px' },
  input: {
    flex: 1,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    color: 'var(--text)',
    fontSize: '14px',
    padding: '10px 12px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  locBtn: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    color: 'var(--text)',
    cursor: 'pointer',
    fontSize: '18px',
    padding: '0 12px',
    flexShrink: 0,
  },
  lru: {
    position: 'absolute' as const,
    top: 'calc(100% + 4px)',
    left: 0,
    right: 0,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '4px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
    zIndex: 100,
    boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
  },
  lruItem: {
    background: 'none',
    border: 'none',
    borderRadius: '4px',
    color: 'var(--text)',
    cursor: 'pointer',
    fontSize: '13px',
    padding: '6px 8px',
    textAlign: 'left' as const,
    fontFamily: 'var(--font)',
  },
  error: { fontSize: '13px', color: 'var(--red)', padding: '4px 0' },
  hint: { fontSize: '12px', color: 'var(--muted)' },
} as const;
