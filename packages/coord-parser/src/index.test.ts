import { describe, it, expect } from 'vitest';
import { parseCoord } from './index.js';

const MOSCOW = { lat: 55.7558, lon: 37.6176 };
const NYORK  = { lat: 40.7128, lon: -74.006 };
const SYDNEY = { lat: -33.8688, lon: 151.2093 };

function approxEq(a: number | undefined, b: number, eps = 1e-4): boolean {
  return a !== undefined && Math.abs(a - b) < eps;
}

// ── Decimal ──────────────────────────────────────────────────────────────────

describe('decimal', () => {
  it('parses comma-separated', () => {
    const r = parseCoord('55.7558, 37.6176');
    expect(r).not.toBeNull();
    expect(approxEq(r?.lat, MOSCOW.lat)).toBe(true);
    expect(approxEq(r?.lon, MOSCOW.lon)).toBe(true);
  });

  it('parses space-separated', () => {
    const r = parseCoord('55.7558 37.6176');
    expect(r?.lat).toBeCloseTo(MOSCOW.lat, 4);
    expect(r?.lon).toBeCloseTo(MOSCOW.lon, 4);
  });

  it('parses negative longitude (New York)', () => {
    const r = parseCoord('40.7128, -74.0060');
    expect(r?.lat).toBeCloseTo(NYORK.lat, 4);
    expect(r?.lon).toBeCloseTo(NYORK.lon, 4);
  });

  it('parses negative latitude (Sydney)', () => {
    const r = parseCoord('-33.8688, 151.2093');
    expect(r?.lat).toBeCloseTo(SYDNEY.lat, 4);
    expect(r?.lon).toBeCloseTo(SYDNEY.lon, 4);
  });

  it('returns null for out-of-range values', () => {
    expect(parseCoord('95.0, 37.0')).toBeNull();   // lat > 90
    expect(parseCoord('55.0, 200.0')).toBeNull();  // lon > 180
  });

  it('returns null for plain text', () => {
    expect(parseCoord('hello world')).toBeNull();
    expect(parseCoord('')).toBeNull();
  });
});

// ── DMS ──────────────────────────────────────────────────────────────────────

describe('DMS', () => {
  it('parses 55°45′21″N 37°37′4″E', () => {
    const r = parseCoord('55°45\'21"N 37°37\'4"E');
    expect(r).not.toBeNull();
    expect(r?.lat).toBeCloseTo(55.7558, 2);
    expect(r?.lon).toBeCloseTo(37.6178, 2);
  });

  it('parses South latitude (negative)', () => {
    const r = parseCoord('33°52\'8"S 151°12\'33"E');
    expect(r?.lat).toBeLessThan(0);
    expect(r?.lon).toBeGreaterThan(0);
  });

  it('parses West longitude (negative)', () => {
    const r = parseCoord('40°42\'46"N 74°0\'22"W');
    expect(r?.lat).toBeGreaterThan(0);
    expect(r?.lon).toBeLessThan(0);
  });
});

// ── geo URI ──────────────────────────────────────────────────────────────────

describe('geo URI', () => {
  it('parses basic geo: URI', () => {
    const r = parseCoord('geo:55.7558,37.6176');
    expect(r?.lat).toBeCloseTo(MOSCOW.lat, 4);
    expect(r?.lon).toBeCloseTo(MOSCOW.lon, 4);
  });

  it('parses geo: URI with altitude', () => {
    const r = parseCoord('geo:55.7558,37.6176,200');
    expect(r?.lat).toBeCloseTo(MOSCOW.lat, 4);
    expect(r?.lon).toBeCloseTo(MOSCOW.lon, 4);
  });

  it('parses case-insensitive prefix', () => {
    const r = parseCoord('GEO:55.7558,37.6176');
    expect(r).not.toBeNull();
  });
});

// ── Google Maps ───────────────────────────────────────────────────────────────

describe('Google Maps URL', () => {
  it('parses @lat,lon in path', () => {
    const r = parseCoord('https://www.google.com/maps/@55.7558,37.6176,15z');
    expect(r?.lat).toBeCloseTo(MOSCOW.lat, 4);
    expect(r?.lon).toBeCloseTo(MOSCOW.lon, 4);
  });

  it('parses ?q=lat,lon', () => {
    const r = parseCoord('https://maps.google.com/?q=55.7558,37.6176');
    expect(r?.lat).toBeCloseTo(MOSCOW.lat, 4);
    expect(r?.lon).toBeCloseTo(MOSCOW.lon, 4);
  });

  it('parses ?ll=lat,lon (Google uses lat,lon order)', () => {
    const r = parseCoord('https://maps.google.com/?ll=55.7558,37.6176&z=15');
    expect(r?.lat).toBeCloseTo(MOSCOW.lat, 4);
    expect(r?.lon).toBeCloseTo(MOSCOW.lon, 4);
  });

  it('parses negative longitude', () => {
    const r = parseCoord('https://www.google.com/maps/@40.7128,-74.0060,15z');
    expect(r?.lat).toBeCloseTo(NYORK.lat, 4);
    expect(r?.lon).toBeCloseTo(NYORK.lon, 4);
  });
});

// ── Yandex Maps — CRITICAL: uses lon,lat order ────────────────────────────────

describe('Yandex Maps URL', () => {
  it('parses ?ll=lon,lat (Yandex lon comes FIRST)', () => {
    // At ?ll=37.6176,55.7558 → lon=37.6176, lat=55.7558
    const r = parseCoord('https://maps.yandex.ru/?ll=37.6176,55.7558&z=15');
    expect(r?.lat).toBeCloseTo(MOSCOW.lat, 4);
    expect(r?.lon).toBeCloseTo(MOSCOW.lon, 4);
  });

  it('does NOT confuse Yandex lon,lat for lat,lon', () => {
    // Wrong interpretation would give lat=37.6176 (in Russia but wrong)
    const r = parseCoord('https://yandex.ru/maps/?ll=37.6176,55.7558');
    expect(r?.lat).toBeCloseTo(55.7558, 4);  // NOT 37.6176
    expect(r?.lon).toBeCloseTo(37.6176, 4);  // NOT 55.7558
  });

  it('parses ?pt=lon,lat', () => {
    const r = parseCoord('https://maps.yandex.ru/?pt=37.6176,55.7558&l=sat');
    expect(r?.lat).toBeCloseTo(MOSCOW.lat, 4);
    expect(r?.lon).toBeCloseTo(MOSCOW.lon, 4);
  });

  it('parses separate ?lat=&lon= params (standard order)', () => {
    const r = parseCoord('https://yandex.ru/maps/?lat=55.7558&lon=37.6176');
    expect(r?.lat).toBeCloseTo(MOSCOW.lat, 4);
    expect(r?.lon).toBeCloseTo(MOSCOW.lon, 4);
  });
});

// ── OpenStreetMap ─────────────────────────────────────────────────────────────

describe('OpenStreetMap URL', () => {
  it('parses #map=zoom/lat/lon hash format', () => {
    const r = parseCoord('https://www.openstreetmap.org/#map=15/55.7558/37.6176');
    expect(r?.lat).toBeCloseTo(MOSCOW.lat, 4);
    expect(r?.lon).toBeCloseTo(MOSCOW.lon, 4);
  });

  it('parses ?mlat=&mlon= query params', () => {
    const r = parseCoord('https://www.openstreetmap.org/?mlat=55.7558&mlon=37.6176');
    expect(r?.lat).toBeCloseTo(MOSCOW.lat, 4);
    expect(r?.lon).toBeCloseTo(MOSCOW.lon, 4);
  });
});

// ── Registry priority ─────────────────────────────────────────────────────────

describe('parser priority', () => {
  it('prefers geo URI over decimal (both match "geo:...")', () => {
    const r = parseCoord('geo:55.7558,37.6176');
    expect(r?.lat).toBeCloseTo(MOSCOW.lat, 4);
  });

  it('returns null for unrecognised input', () => {
    expect(parseCoord('somewhere nice')).toBeNull();
    expect(parseCoord('123')).toBeNull();
  });
});
