import { useEffect, useRef } from 'preact/hooks';
import type { Map, Marker } from 'leaflet';
import { journal, type JournalEntry } from '../store/index.js';
import type { GeoMessage } from '@trillink/protocol';

const LEGEND_H = 20;

interface Props {
  onSelectEntry: (entry: JournalEntry) => void;
  height: number;
}

export function MapPanel({ onSelectEntry, height }: Props) {
  const divRef      = useRef<HTMLDivElement>(null);
  const mapRef      = useRef<Map | null>(null);
  const markersRef  = useRef<Marker[]>([]);
  const lRef        = useRef<typeof import('leaflet') | null>(null);
  const onSelectRef = useRef(onSelectEntry);
  useEffect(() => { onSelectRef.current = onSelectEntry; }, [onSelectEntry]);

  const mapH = height - LEGEND_H;

  useEffect(() => {
    if (!divRef.current) return;
    let map: Map;

    function syncMarkers() {
      const L   = lRef.current;
      const map = mapRef.current;
      if (!L || !map) return;

      for (const m of markersRef.current) m.remove();
      markersRef.current = [];

      const entries = journal.peek();
      const geoItems: { entry: JournalEntry; msg: GeoMessage }[] = [];
      for (const entry of entries) {
        if (entry.message.type === 'GEO') geoItems.push({ entry, msg: entry.message as GeoMessage });
        for (const c of entry.continuations) {
          if (c.message.type === 'GEO') geoItems.push({ entry: c, msg: c.message as GeoMessage });
        }
      }

      for (const { entry, msg } of geoItems) {
        const isOut = entry.direction === 'out';
        const color = isOut ? '#3ddc84' : '#4f8ef7';
        const border = isOut ? '#fff' : '#bdf';

        const icon = L.divIcon({
          className: '',
          html: `<div style="width:10px;height:10px;border-radius:50%;background:${color};border:2px solid ${border};box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>`,
          iconSize: [10, 10],
          iconAnchor: [5, 5],
        });

        const ts = entry.ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const marker = L.marker([msg.lat, msg.lon], { icon })
          .addTo(map)
          .bindTooltip(`${isOut ? '▶' : '◀'} ${ts} · ${msg.lat.toFixed(4)}, ${msg.lon.toFixed(4)}`, { direction: 'top', offset: [0, -8] });

        marker.on('click', () => onSelectRef.current(entry));
        markersRef.current.push(marker);
      }

      if (markersRef.current.length > 0) {
        try {
          map.fitBounds(L.featureGroup(markersRef.current).getBounds().pad(0.2), { maxZoom: 14 });
        } catch { /* empty bounds */ }
      }
    }

    async function init() {
      const L = await import('leaflet');
      lRef.current = L;

      // @ts-expect-error _getIconUrl is internal
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      map = L.map(divRef.current!, { zoomControl: true, attributionControl: false })
        .setView([55.7558, 37.6176], 10);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
      mapRef.current = map;
      syncMarkers();
    }

    // Subscribe to journal changes; fires immediately (with current value) and on every update
    const unsub = journal.subscribe(() => syncMarkers());

    void init();

    return () => {
      unsub();
      map?.remove();
      mapRef.current    = null;
      markersRef.current = [];
      lRef.current      = null;
    };
  }, []);

  return (
    <div style={{ flexShrink: 0, borderBottom: '1px solid var(--border)', background: '#111' }}>
      <div ref={divRef} style={{ width: '100%', height: `${mapH}px` }} />
      <div style={s.legend}>
        <span style={{ color: '#3ddc84' }}>● Sent</span>
        <span style={{ color: '#4f8ef7' }}>● Received</span>
      </div>
    </div>
  );
}

const s = {
  legend: {
    height: `${LEGEND_H}px`,
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '0 10px',
    fontSize: '10px',
    color: 'var(--muted)',
  },
} as const;
