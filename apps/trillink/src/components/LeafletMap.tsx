import { useEffect, useRef } from 'preact/hooks';
import type { Map, Marker, LatLng } from 'leaflet';

interface MarkerDef {
  lat: number;
  lon: number;
  /** true = the draggable "current selection" marker, false = context/history marker */
  primary?: boolean;
  tooltip?: string;
}

interface Props {
  markers: MarkerDef[];
  center?: { lat: number; lon: number };
  zoom?: number;
  draggable?: boolean;               // primary marker is draggable
  onMove?: (lat: number, lon: number) => void;  // fires when draggable marker moves
  onClick?: (lat: number, lon: number) => void; // fires on map double-click
  style?: Record<string, string | number>;
}

export function LeafletMap({
  markers,
  center,
  zoom = 14,
  draggable = false,
  onMove,
  onClick,
  style,
}: Props) {
  const divRef    = useRef<HTMLDivElement>(null);
  const mapRef    = useRef<Map | null>(null);
  const markerRef = useRef<Marker | null>(null);  // the primary (draggable) marker
  const lRef      = useRef<typeof import('leaflet') | null>(null);

  // Stable callbacks via refs so the mount effect never re-runs
  const onMoveRef  = useRef(onMove);
  const onClickRef = useRef(onClick);
  useEffect(() => { onMoveRef.current  = onMove;  }, [onMove]);
  useEffect(() => { onClickRef.current = onClick; }, [onClick]);

  useEffect(() => {
    if (!divRef.current) return;

    let map: Map;

    async function init() {
      const L = await import('leaflet');
      lRef.current = L;

      // Leaflet's default icon path doesn't work with bundlers; patch it.
      // @ts-expect-error _getIconUrl is internal
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const first = markers[0] ?? center ?? { lat: 55.7558, lon: 37.6176 };
      map = L.map(divRef.current!, { zoomControl: true, attributionControl: false })
        .setView([first.lat, first.lon], zoom);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      mapRef.current = map;

      // Add markers present at mount time
      for (const m of markers) {
        const icon = m.primary ? undefined : L.icon({
          iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
          iconSize: [16, 26],
          iconAnchor: [8, 26],
          shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
          shadowSize: [20, 20],
          className: 'trillink-secondary-marker',
        });

        const marker = L.marker([m.lat, m.lon], {
          draggable: draggable && m.primary,
          ...(icon ? { icon } : {}),
        }).addTo(map);

        if (m.tooltip) marker.bindTooltip(m.tooltip);

        if (m.primary) {
          markerRef.current = marker;
          marker.on('dragend', () => {
            const ll = marker.getLatLng();
            onMoveRef.current?.(ll.lat, ll.lng);
          });
        }
      }

      // Double-click → move primary marker and fire onClick
      map.on('dblclick', (e: { latlng: LatLng }) => {
        onClickRef.current?.(e.latlng.lat, e.latlng.lng);
        if (markerRef.current) {
          markerRef.current.setLatLng([e.latlng.lat, e.latlng.lng]);
        }
      });
    }

    void init();

    return () => {
      map?.remove();
      mapRef.current  = null;
      markerRef.current = null;
      lRef.current    = null;
    };
  }, []);   // mount once — no dep array re-run

  // Sync primary marker: create lazily if it didn't exist at mount, or reposition.
  useEffect(() => {
    const primary = markers.find((m) => m.primary);

    if (!primary) return;

    if (markerRef.current) {
      // Marker exists — just reposition if the coords changed
      const ll = markerRef.current.getLatLng();
      if (Math.abs(ll.lat - primary.lat) > 1e-7 || Math.abs(ll.lng - primary.lon) > 1e-7) {
        markerRef.current.setLatLng([primary.lat, primary.lon]);
        mapRef.current?.panTo([primary.lat, primary.lon]);
      }
    } else if (mapRef.current && lRef.current) {
      // Marker not yet created (map mounted with empty markers list).
      // Create it now.
      const L      = lRef.current;
      const marker = L.marker([primary.lat, primary.lon], { draggable }).addTo(mapRef.current);
      markerRef.current = marker;
      mapRef.current.panTo([primary.lat, primary.lon]);
      marker.on('dragend', () => {
        const ll = marker.getLatLng();
        onMoveRef.current?.(ll.lat, ll.lng);
      });
    }
  }, [markers]);

  function recenterOnMarker() {
    const primary = markers.find((m) => m.primary);
    if (primary && mapRef.current) {
      mapRef.current.panTo([primary.lat, primary.lon]);
    }
  }

  const hasPrimary = markers.some((m) => m.primary);

  return (
    <div style={{ position: 'relative', width: '100%', height: '280px', borderRadius: 'var(--radius)', ...style }}>
      <div ref={divRef} style={{ width: '100%', height: '100%', borderRadius: 'inherit' }} />
      {hasPrimary && (
        <button
          style={s.recenterBtn}
          onClick={recenterOnMarker}
          title="Go to marker"
        >
          ⊙
        </button>
      )}
    </div>
  );
}

const s = {
  recenterBtn: {
    position: 'absolute' as const,
    top: '8px',
    right: '8px',
    zIndex: 1000,
    width: '30px',
    height: '30px',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    color: 'var(--text)',
    cursor: 'pointer',
    fontSize: '16px',
    lineHeight: '1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
  },
} as const;
