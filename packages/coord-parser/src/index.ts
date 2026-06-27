import { decimalParser } from './parsers/decimal.js';
import { dmsParser }     from './parsers/dms.js';
import { geoUriParser }  from './parsers/geo-uri.js';
import { googleParser }  from './parsers/google.js';
import { osmParser }     from './parsers/osm.js';
import { yandexParser }  from './parsers/yandex.js';

export type { ParsedCoord, CoordParser } from './types.js';
export { decimalParser, dmsParser, geoUriParser, googleParser, osmParser, yandexParser };

// Default parser registry — ordered: URL-specific parsers before generic ones
const defaultParsers = [
  geoUriParser,
  googleParser,
  yandexParser,
  osmParser,
  dmsParser,
  decimalParser,
];

/**
 * Parse coordinate input in any supported format.
 * Returns null if no parser recognises the input.
 * Pass `extraParsers` to extend the registry for a specific deployment.
 */
export function parseCoord(
  input: string,
  extraParsers: typeof defaultParsers = [],
): import('./types.js').ParsedCoord | null {
  const all = [...extraParsers, ...defaultParsers];
  for (const parser of all) {
    if (parser.canParse(input)) {
      const result = parser.parse(input);
      if (result) return result;
    }
  }
  return null;
}
