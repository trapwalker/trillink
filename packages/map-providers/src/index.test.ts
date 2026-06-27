import { describe, it, expect } from 'vitest';
import { defaultProviders, buildMapUrl, buildAllMapUrls, google, yandex, osm, maps2gis } from './index.js';

const LAT = 55.7558, LON = 37.6176;

describe('defaultProviders', () => {
  it('contains four providers in order', () => {
    const ids = defaultProviders.map((p) => p.id);
    expect(ids).toEqual(['google', 'yandex', 'osm', '2gis']);
  });

  it('every provider has id, name, label, buildUrl', () => {
    for (const p of defaultProviders) {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.label).toBeTruthy();
      expect(typeof p.buildUrl).toBe('function');
    }
  });
});

describe('Google Maps buildUrl', () => {
  it('contains lat,lon in correct order (not reversed)', () => {
    const url = google.buildUrl(LAT, LON);
    expect(url).toContain(`${LAT},${LON}`);
  });

  it('includes zoom parameter', () => {
    const url = google.buildUrl(LAT, LON, 12);
    expect(url).toContain('z=12');
  });

  it('is a valid URL', () => {
    expect(() => new URL(google.buildUrl(LAT, LON))).not.toThrow();
  });
});

describe('Yandex Maps buildUrl — CRITICAL: uses lon,lat order', () => {
  it('puts longitude BEFORE latitude in ll param', () => {
    const url = yandex.buildUrl(LAT, LON);
    // ll=LON,LAT — Yandex convention
    expect(url).toContain(`ll=${LON},${LAT}`);
  });

  it('does NOT put latitude before longitude in ll param', () => {
    const url = yandex.buildUrl(LAT, LON);
    expect(url).not.toContain(`ll=${LAT},${LON}`);
  });

  it('also includes pt=lon,lat marker', () => {
    const url = yandex.buildUrl(LAT, LON);
    expect(url).toContain(`pt=${LON},${LAT}`);
  });

  it('is a valid URL', () => {
    expect(() => new URL(yandex.buildUrl(LAT, LON))).not.toThrow();
  });
});

describe('OpenStreetMap buildUrl', () => {
  it('contains mlat/mlon params', () => {
    const url = osm.buildUrl(LAT, LON);
    expect(url).toContain(`mlat=${LAT}`);
    expect(url).toContain(`mlon=${LON}`);
  });

  it('contains hash fragment for map position', () => {
    const url = osm.buildUrl(LAT, LON, 14);
    expect(url).toContain(`#map=14/`);
  });

  it('is a valid URL (ignoring hash)', () => {
    const url = osm.buildUrl(LAT, LON);
    expect(() => new URL(url)).not.toThrow();
  });
});

describe('2GIS buildUrl', () => {
  it('uses lon,lat order in m= param', () => {
    const url = maps2gis.buildUrl(LAT, LON);
    expect(url).toContain(`m=${LON},${LAT}`);
  });

  it('is a valid URL', () => {
    expect(() => new URL(maps2gis.buildUrl(LAT, LON))).not.toThrow();
  });
});

describe('buildMapUrl', () => {
  it('returns URL for known provider', () => {
    const url = buildMapUrl('google', LAT, LON);
    expect(url).not.toBeNull();
    expect(url).toContain('maps.google');
  });

  it('returns null for unknown provider', () => {
    expect(buildMapUrl('unknown', LAT, LON)).toBeNull();
  });

  it('uses extraProviders before defaults', () => {
    const custom = { id: 'custom', name: 'Custom', label: 'C', buildUrl: () => 'https://custom.test' };
    const url = buildMapUrl('custom', LAT, LON, 15, [custom]);
    expect(url).toBe('https://custom.test');
  });
});

describe('buildAllMapUrls', () => {
  it('returns an entry for every default provider', () => {
    const results = buildAllMapUrls(LAT, LON);
    expect(results.length).toBe(4);
  });

  it('each entry has provider and url', () => {
    for (const { provider, url } of buildAllMapUrls(LAT, LON)) {
      expect(provider.id).toBeTruthy();
      expect(url.length).toBeGreaterThan(10);
    }
  });
});
