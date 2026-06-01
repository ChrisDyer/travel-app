import { NextResponse } from 'next/server';
import { db, camelize } from '@/db';
import { getUserId } from '@/lib/auth';
import type { Trip } from '@/types/travel';

// Free, keyless weather via Open-Meteo (geocoding + daily forecast). The forecast window
// is ~16 days, so trips further out return { available: false, reason: 'too_far_out' }.
export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const userId = getUserId(request);

  const tripRow = db.prepare('SELECT * FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId) as Record<string, unknown> | undefined;
  if (!tripRow) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const trip = camelize<Trip>(tripRow);

  try {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(trip.destination)}&count=1`,
      { signal: AbortSignal.timeout(5000) }
    );
    const geo = await geoRes.json() as { results?: { name: string; country?: string; latitude: number; longitude: number }[] };
    const place = geo.results?.[0];
    if (!place) return NextResponse.json({ available: false, reason: 'location_not_found' });

    const today = new Date().toISOString().slice(0, 10);
    const maxDate = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);
    const start = trip.startDate < today ? today : trip.startDate;
    const end = trip.endDate > maxDate ? maxDate : trip.endDate;
    if (trip.startDate > maxDate || start > end) {
      return NextResponse.json({ available: false, reason: 'too_far_out', location: place.name });
    }

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}`
      + `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code`
      + `&temperature_unit=fahrenheit&timezone=auto&start_date=${start}&end_date=${end}`;
    const fRes = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const f = await fRes.json() as {
      daily?: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max?: (number | null)[]; weather_code: number[] };
    };
    const d = f.daily;
    if (!d?.time?.length) return NextResponse.json({ available: false, reason: 'no_forecast', location: place.name });

    const days = d.time.map((date, i) => ({
      date,
      tMax: Math.round(d.temperature_2m_max[i]),
      tMin: Math.round(d.temperature_2m_min[i]),
      precip: d.precipitation_probability_max?.[i] ?? null,
      code: d.weather_code[i],
    }));

    return NextResponse.json({
      available: true,
      location: place.country ? `${place.name}, ${place.country}` : place.name,
      unit: 'F',
      days,
    });
  } catch {
    return NextResponse.json({ available: false, reason: 'error' });
  }
}
