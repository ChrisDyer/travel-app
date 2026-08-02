export interface GeocodeResult { latitude: number; longitude: number; name: string; }

function displayName(place: { name: string; country?: string }): string {
  return place.country ? `${place.name}, ${place.country}` : place.name;
}

export async function geocodePlace(placeName: string): Promise<GeocodeResult | null> {
  const geoRes = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(placeName)}&count=1`,
    { signal: AbortSignal.timeout(5000) }
  );
  const geo = await geoRes.json() as { results?: { name: string; country?: string; latitude: number; longitude: number }[] };
  const place = geo.results?.[0];
  return place ? { latitude: place.latitude, longitude: place.longitude, name: displayName(place) } : null;
}
