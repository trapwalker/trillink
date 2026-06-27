import type { CoordParser, ParsedCoord } from '../types.js';

// maps.google.com/.../@lat,lon,zoom  or  ?q=lat,lon  or  ?ll=lat,lon
// Also handles goo.gl/maps/... via the @lat,lon pattern in the URL after redirect expansion.
const AT_RE = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
const Q_RE  = /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/;
const LL_RE = /[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/;

function isGoogleUrl(s: string): boolean {
  return /maps\.google\.|google\.[a-z.]+\/maps|goo\.gl\/maps/i.test(s);
}

export const googleParser: CoordParser = {
  name: 'google',
  canParse: (s) => isGoogleUrl(s),
  parse(input): ParsedCoord | null {
    for (const re of [AT_RE, Q_RE, LL_RE]) {
      const m = input.match(re);
      if (m) {
        const lat = parseFloat(m[1]!), lon = parseFloat(m[2]!);
        if (!isNaN(lat) && !isNaN(lon)) return { lat, lon, raw: input };
      }
    }
    return null;
  },
};
