import type { CoordParser, ParsedCoord } from '../types.js';

// maps.yandex.ru/?ll=lon,lat&...  (note: Yandex uses lon,lat order in ?ll)
// Also: yandex.ru/maps/?pt=lon,lat  or /-/lon,lat in some newer short URLs
const LL_RE  = /[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/;
const PT_RE  = /[?&]pt=(-?\d+\.\d+),(-?\d+\.\d+)/;
// yandex.com/maps/... with lat and lon params
const LAT_RE = /[?&]lat=(-?\d+\.\d+)/;
const LON_RE = /[?&]lon=(-?\d+\.\d+)/;

function isYandexUrl(s: string): boolean {
  return /maps\.yandex\.|yandex\.[a-z.]+\/maps/i.test(s);
}

export const yandexParser: CoordParser = {
  name: 'yandex',
  canParse: (s) => isYandexUrl(s),
  parse(input): ParsedCoord | null {
    // ?ll=lon,lat (Yandex puts longitude first!)
    const ll = input.match(LL_RE);
    if (ll) {
      const lon = parseFloat(ll[1]!), lat = parseFloat(ll[2]!);
      if (!isNaN(lat) && !isNaN(lon)) return { lat, lon, raw: input };
    }
    // ?pt=lon,lat
    const pt = input.match(PT_RE);
    if (pt) {
      const lon = parseFloat(pt[1]!), lat = parseFloat(pt[2]!);
      if (!isNaN(lat) && !isNaN(lon)) return { lat, lon, raw: input };
    }
    // Separate ?lat=...&lon=...
    const latM = input.match(LAT_RE), lonM = input.match(LON_RE);
    if (latM && lonM) {
      const lat = parseFloat(latM[1]!), lon = parseFloat(lonM[1]!);
      if (!isNaN(lat) && !isNaN(lon)) return { lat, lon, raw: input };
    }
    return null;
  },
};
