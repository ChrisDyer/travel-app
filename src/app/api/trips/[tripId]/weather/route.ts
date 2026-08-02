import { NextResponse } from 'next/server';
import { db, camelize, camelizeAll } from '@/db';
import { getUserId } from '@/lib/auth';
import { datesBetween } from '@/lib/dates';
import { segmentDates } from '@/lib/legs';
import { geocodePlace } from '@/lib/geocode';
import type { Trip, TripLeg } from '@/types/travel';

interface WeatherDay {
  date: string;
  tMax: number;
  tMin: number;
  precip: number | null;
  code: number;
}

interface ForecastCacheEntry {
  expiresAt: number;
  days: WeatherDay[];
}

const forecastCache = new Map<string, ForecastCacheEntry>();
const FORECAST_TTL_MS = 30 * 60 * 1000;
const FORECAST_CACHE_LIMIT = 50;
const MAX_LOCATIONS = 8;

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function maxForecastDate(): string {
  return new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);
}


function getCachedForecast(key: string): WeatherDay[] | null {
  const entry = forecastCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    forecastCache.delete(key);
    return null;
  }
  forecastCache.delete(key);
  forecastCache.set(key, entry);
  return entry.days;
}

function setCachedForecast(key: string, days: WeatherDay[]): void {
  forecastCache.set(key, { expiresAt: Date.now() + FORECAST_TTL_MS, days });
  while (forecastCache.size > FORECAST_CACHE_LIMIT) {
    const oldest = forecastCache.keys().next().value as string | undefined;
    if (!oldest) break;
    forecastCache.delete(oldest);
  }
}

async function fetchForecast(latitude: number, longitude: number, start: string, end: string): Promise<WeatherDay[]> {
  const key = `${latitude},${longitude},${start},${end}`;
  const cached = getCachedForecast(key);
  if (cached) return cached;

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}`
    + `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code`
    + `&temperature_unit=fahrenheit&timezone=auto&start_date=${start}&end_date=${end}`;
  const fRes = await fetch(url, { signal: AbortSignal.timeout(5000) });
  const f = await fRes.json() as {
    daily?: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max?: (number | null)[]; weather_code: number[] };
  };
  const d = f.daily;
  if (!d?.time?.length) return [];

  const days = d.time.map((date, i) => ({
    date,
    tMax: Math.round(d.temperature_2m_max[i]),
    tMin: Math.round(d.temperature_2m_min[i]),
    precip: d.precipitation_probability_max?.[i] ?? null,
    code: d.weather_code[i],
  }));
  setCachedForecast(key, days);
  return days;
}

export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const userId = getUserId(request);

  const tripRow = db.prepare('SELECT * FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId) as Record<string, unknown> | undefined;
  if (!tripRow) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const trip = camelize<Trip>(tripRow);

  try {
    const today = todayString();
    const maxDate = maxForecastDate();
    const start = trip.startDate < today ? today : trip.startDate;
    const end = trip.endDate > maxDate ? maxDate : trip.endDate;
    if (trip.startDate > maxDate || start > end) {
      return NextResponse.json({ available: false, reason: 'too_far_out' });
    }

    const legs = camelizeAll<TripLeg>(db.prepare('SELECT * FROM trip_legs WHERE trip_id = ? ORDER BY start_date ASC, sort_order ASC').all(tripId) as Record<string, unknown>[]);
    const groups = segmentDates(legs, datesBetween(start, end), trip.destination);
    const seenLocations = new Set<string>();
    const segments = [];

    for (const group of groups) {
      const keySource = group.leg ? `leg:${group.leg.id}` : `fallback:${group.place}`;
      if (!seenLocations.has(keySource)) {
        seenLocations.add(keySource);
      }
      if (seenLocations.size > MAX_LOCATIONS) {
        segments.push({ place: group.place, location: null, startDate: group.dates[0], endDate: group.dates.at(-1)!, reason: 'too_many_locations', days: [] });
        continue;
      }

      let latitude = group.leg?.latitude ?? null;
      let longitude = group.leg?.longitude ?? null;
      let location = group.leg?.resolvedName ?? null;

      if (latitude == null || longitude == null) {
        const resolved = await geocodePlace(group.leg?.place ?? group.place);
        if (!resolved) {
          segments.push({ place: group.place, location: null, startDate: group.dates[0], endDate: group.dates.at(-1)!, reason: 'location_not_found', days: [] });
          continue;
        }
        latitude = resolved.latitude;
        longitude = resolved.longitude;
        location = resolved.name;
        if (group.leg) {
          // This GET writes an idempotent geocode cache derived from place. It must not touch
          // trips.updated_at or trip_legs.updated_at, or TripWeather can refetch in a loop.
          db.prepare('UPDATE trip_legs SET latitude = ?, longitude = ?, resolved_name = ? WHERE id = ? AND trip_id = ?')
            .run(latitude, longitude, location, group.leg.id, tripId);
        }
      }

      const days = await fetchForecast(latitude, longitude, group.dates[0], group.dates.at(-1)!);
      segments.push({
        place: group.leg?.place ?? group.place,
        location,
        startDate: group.dates[0],
        endDate: group.dates.at(-1)!,
        ...(days.length ? {} : { reason: 'no_forecast' }),
        days,
      });
    }

    const available = segments.some((segment) => segment.days.length > 0);
    if (!available) {
      const firstReason = segments[0]?.reason ?? 'no_forecast';
      return NextResponse.json({ available: false, reason: firstReason, unit: 'F', segments });
    }
    return NextResponse.json({ available: true, unit: 'F', segments });
  } catch {
    return NextResponse.json({ available: false, reason: 'error' });
  }
}
