export interface ParsedCoord {
  lat: number;
  lon: number;
  label?: string;  // human-readable name extracted from the URL/string
  raw: string;     // original input
}

export interface CoordParser {
  readonly name: string;
  canParse(input: string): boolean;
  parse(input: string): ParsedCoord | null;
}
