import { useEffect, useRef } from 'preact/hooks';
import type { Map, Marker } from 'leaflet';
import { journal, type JournalEntry } from '../store/index.js';
import type { GeoMessage } from '@trillink/protocol';

const PANEL_H = 200;

interface Props {
  onSelectEntry: (entry: JournalEntry) => void;
}

export function MapPanel({ onSelectEntry }: Props) {
  const divRef     = useRef<HTMLDivElement>(null);
  const mapRef     = useRef<Map | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const lRef       = useRef<typeof import('leaflet') | null>(null);
  const onSelectRef = useRef(onSelectEntry);
  useEffect(() => { onSelectRef.current = onSelectEntry; }, [onSelectEntry]);

  // Mount map once
  useEffect(() => {
    if (!divRef.current) return;
    let map: Map;

    async function init() {
      const L = await import('leaflet');
      lRef.current = L;

      // @ts-expect-error _getIconUrl is internal
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      map = L.map(divRef.current!, { zoomControl: true, attributionControl: false })
        .setView([55.7558, 37.6176], 10);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
      mapRef.current = map;
    }

    void init();
    return () => {
      map?.remove();
      mapRef.current  = null;
      markersRef.current = [];
      lRef.current    = null;
    };
  }, []);

  // Sync markers when journal changes
  useEffect(() => {
    const L   = lRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    // Clear existing markers
    for (const m of markersRef.current) m.remove();
    markersRef.current = [];

    const geoEntries = journal.value.flatMap((entry) => {
      const list: { entry: JournalEntry; msg: GeoMessage }[] = [];
      if (entry.message.type === 'GEO') {
        list.push({ entry, msg: entry.message as GeoMessage });
      }
      for (const c of entry.continuations) {
        if (c.message.type === 'GEO') {
          list.push({ entry: c, msg: c.message as GeoMessage });
        }
      }
      return list;
    });

    for (const { entry, msg } of geoEntries) {
      const isOut = entry.direction === 'out';
      const color = isOut ? '#3ddc84' : '#4f8ef7';  // green = sent, blue = received

      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width:10px;height:10px;border-radius:50%;
          background:${color};border:2px solid ${isOut ? '#fff' : '#cfe'};
          box-shadow:0 1px 4px rgba(0,0,0,0.5);
        "></div>`,
        iconSize: [10, 10],
        iconAnchor: [5, 5],
      });

      const marker = L.marker([msg.lat, msg.lon], { icon })
        .addTo(map)
        .bindTooltip(
          `${isOut ? '▶' : '◀'} ${entry.ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${msg.lat.toFixed(4)}, ${msg.lon.toFixed(4)}`,
          { permanent: false, direction: 'top', offset: [0, -8] },
        );

      marker.on('click', () => onSelectRef.current(entry));
      markersRef.current.push(marker);
    }

    // Fit bounds if we have markers
    if (markersRef.current.length > 0) {
      const group = L.featureGroup(markersRef.current);
      try {
        map.fitBounds(group.getBounds().pad(0.2), { maxZoom: 14 });
      } catch { /* empty bounds */ }
    }
  }, [journal.value]);

  return (
    <div style={s.container}>
      <div ref={divRef} style={s.map} />
      <div style={s.legend}>
        <span style={{ color: '#3ddc84' }}>● Sent</span>
        <span style={{ color: '#4f8ef7' }}>● Received</span>
      </div>
    </div>
  );
}

const s = {
  container: {
    flexShrink: 0,
    height: `${PANEL_H + 20}px`,
    borderBottom: '1px solid var(--border)',
    position: 'relative' as const,
    background: '#111',
  },
  map: { width: '100%', height: `${PANEL_H}px` },
  legend: {
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '0 10px',
    fontSize: '10px',
    color: 'var(--muted)',
  },
} as const;
