import type { CoordParser, ParsedCoord } from '../types.js';

// Matches: "55.7558, 37.6176" | "55.7558 37.6176" | "N55.7558 E37.6176"
const RE = /^[NS]?\s*(-?\d+(?:\.\d+)?)\s*[°,\s]+[EW]?\s*(-?\d+(?:\.\d+)?)\s*$/i;

export const decimalParser: CoordParser = {
  name: 'decimal',
  canParse: (s) => RE.test(s.trim()),
  parse(input): ParsedCoord | null {
    const m = input.trim().match(RE);
    if (!m) return null;
    const lat = parseFloat(m[1]!);
    const lon = parseFloat(m[2]!);
    if (isNaN(lat) || isNaN(lon)) return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return { lat, lon, raw: input };
  },
};
