import type { CoordParser, ParsedCoord } from '../types.js';

// openstreetmap.org/#map=16/55.756/37.617  or  ?mlat=55.756&mlon=37.617  or  ?lat=55.756&lon=37.617
const HASH_RE = /#map=\d+\/(-?\d+\.\d+)\/(-?\d+\.\d+)/;
const LAT_RE  = /[?&]m?lat=(-?\d+\.\d+)/;
const LON_RE  = /[?&]m?lon=(-?\d+\.\d+)/;

function isOsmUrl(s: string): boolean {
  return /openstreetmap\.org/i.test(s);
}

export const osmParser: CoordParser = {
  name: 'osm',
  canParse: (s) => isOsmUrl(s),
  parse(input): ParsedCoord | null {
    const h = input.match(HASH_RE);
    if (h) {
      const lat = parseFloat(h[1]!), lon = parseFloat(h[2]!);
      if (!isNaN(lat) && !isNaN(lon)) return { lat, lon, raw: input };
    }
    const latM = input.match(LAT_RE), lonM = input.match(LON_RE);
    if (latM && lonM) {
      const lat = parseFloat(latM[1]!), lon = parseFloat(lonM[1]!);
      if (!isNaN(lat) && !isNaN(lon)) return { lat, lon, raw: input };
    }
    return null;
  },
};
