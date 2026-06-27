import type { CoordParser, ParsedCoord } from '../types.js';

// Matches: 55°45'21"N 37°37'3"E  or  55°45'21.5"N 37°37'3.2"E
const RE = /(\d+)[°\s]+(\d+)['\s]+(\d+(?:\.\d+)?)["\s]*([NS])\s+(\d+)[°\s]+(\d+)['\s]+(\d+(?:\.\d+)?)["\s]*([EW])/i;

function dmsToDecimal(deg: number, min: number, sec: number, hem: string): number {
  const d = deg + min / 60 + sec / 3600;
  return (hem === 'S' || hem === 'W') ? -d : d;
}

export const dmsParser: CoordParser = {
  name: 'dms',
  canParse: (s) => RE.test(s),
  parse(input): ParsedCoord | null {
    const m = input.match(RE);
    if (!m) return null;
    const lat = dmsToDecimal(+m[1]!, +m[2]!, +m[3]!, m[4]!.toUpperCase());
    const lon = dmsToDecimal(+m[5]!, +m[6]!, +m[7]!, m[8]!.toUpperCase());
    if (isNaN(lat) || isNaN(lon)) return null;
    return { lat, lon, raw: input };
  },
};
