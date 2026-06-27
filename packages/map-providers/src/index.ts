export interface MapProvider {
  readonly id: string;
  readonly name: string;
  /** Short label for UI buttons/icons, e.g. "G" for Google */
  readonly label: string;
  buildUrl(lat: number, lon: number, zoom?: number): string;
}

const google: MapProvider = {
  id: 'google',
  name: 'Google Maps',
  label: 'G',
  buildUrl: (lat, lon, zoom = 15) =>
    `https://maps.google.com/?q=${lat},${lon}&z=${zoom}`,
};

const yandex: MapProvider = {
  id: 'yandex',
  name: 'Яндекс Карты',
  label: 'Я',
  // Yandex uses lon,lat order in the ll param
  buildUrl: (lat, lon, zoom = 15) =>
    `https://maps.yandex.ru/?ll=${lon},${lat}&z=${zoom}&pt=${lon},${lat}`,
};

const osm: MapProvider = {
  id: 'osm',
  name: 'OpenStreetMap',
  label: 'OSM',
  buildUrl: (lat, lon, zoom = 15) =>
    `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${zoom}/${lat}/${lon}`,
};

const maps2gis: MapProvider = {
  id: '2gis',
  name: '2ГИС',
  label: '2Г',
  buildUrl: (lat, lon) =>
    `https://2gis.ru/?m=${lon},${lat}/15`,
};

/** All built-in providers in display order. */
export const defaultProviders: MapProvider[] = [google, yandex, osm, maps2gis];

export { google, yandex, osm, maps2gis };

/** Build a URL for a specific provider by ID, or return null if not found. */
export function buildMapUrl(
  providerId: string,
  lat: number,
  lon: number,
  zoom?: number,
  extraProviders: MapProvider[] = [],
): string | null {
  const all = [...extraProviders, ...defaultProviders];
  return all.find((p) => p.id === providerId)?.buildUrl(lat, lon, zoom) ?? null;
}

/** Return URLs for all providers. */
export function buildAllMapUrls(
  lat: number,
  lon: number,
  zoom?: number,
  extraProviders: MapProvider[] = [],
): { provider: MapProvider; url: string }[] {
  const all = [...extraProviders, ...defaultProviders];
  return all.map((provider) => ({ provider, url: provider.buildUrl(lat, lon, zoom) }));
}
