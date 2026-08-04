import { isValidTimeZone } from '@/lib/calendar/timezone';

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  name: string;
  /** IANA zone, e.g. 'America/Chicago'. null when the geocoder omitted it or returned something
   *  this runtime's ICU does not accept — a remote string must never reach Intl unvalidated. */
  timezone: string | null;
}

function displayName(place: { name: string; country?: string }): string {
  return place.country ? `${place.name}, ${place.country}` : place.name;
}

export async function geocodePlace(placeName: string): Promise<GeocodeResult | null> {
  const geoRes = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(placeName)}&count=1`,
    { signal: AbortSignal.timeout(5000) }
  );
  // Open-Meteo has always returned `timezone` here; it was simply cast away until the calendar
  // feed needed it. Taking it costs nothing — no extra request, no extra latency.
  const geo = await geoRes.json() as {
    results?: { name: string; country?: string; latitude: number; longitude: number; timezone?: string }[];
  };
  const place = geo.results?.[0];
  if (!place) return null;
  return {
    latitude: place.latitude,
    longitude: place.longitude,
    name: displayName(place),
    timezone: isValidTimeZone(place.timezone) ? place.timezone : null,
  };
}
