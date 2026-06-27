import type { CoordParser, ParsedCoord } from '../types.js';

// RFC 5870 geo URI: geo:55.7558,37.6176 or geo:55.7558,37.6176,200
const RE = /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(-?\d+(?:\.\d+)?))?/i;

export const geoUriParser: CoordParser = {
  name: 'geo-uri',
  canParse: (s) => s.trim().toLowerCase().startsWith('geo:'),
  parse(input): ParsedCoord | null {
    const m = input.trim().match(RE);
    if (!m) return null;
    const lat = parseFloat(m[1]!), lon = parseFloat(m[2]!);
    if (isNaN(lat) || isNaN(lon)) return null;
    return { lat, lon, raw: input };
  },
};
