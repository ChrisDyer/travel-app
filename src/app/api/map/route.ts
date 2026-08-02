import { NextResponse } from 'next/server';
import { db, camelizeAll } from '@/db';
import { withErrorHandling } from '@/lib/api-helpers';
import { getUserId } from '@/lib/auth';
import { geocodePlace } from '@/lib/geocode';
import type { TripLeg, TripStatus } from '@/types/travel';

const MAX_GEOCODES_PER_REQUEST = 10;

type TripMapRow = {
  id: string;
  title: string;
  destination: string;
  start_date: string;
  end_date: string;
  status: TripStatus;
  latitude: number | null;
  longitude: number | null;
  resolved_name: string | null;
};

function toMapTrip(row: TripMapRow, legs: TripLeg[]) {
  return {
    id: row.id,
    title: row.title,
    destination: row.destination,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    latitude: row.latitude,
    longitude: row.longitude,
    resolvedName: row.resolved_name,
    legs: legs.map((leg) => ({
      id: leg.id,
      place: leg.place,
      latitude: leg.latitude,
      longitude: leg.longitude,
      resolvedName: leg.resolvedName,
    })),
  };
}

export const GET = withErrorHandling(async (request: Request) => {
  const userId = getUserId(request);
  const rows = db.prepare(`
    SELECT id, title, destination, start_date, end_date, status, latitude, longitude, resolved_name
    FROM trips
    WHERE user_id = ?
    ORDER BY start_date ASC, end_date ASC
  `).all(userId) as TripMapRow[];

  const allLegs = camelizeAll<TripLeg>(db.prepare(`
    SELECT trip_legs.*
    FROM trip_legs
    JOIN trips ON trips.id = trip_legs.trip_id
    WHERE trips.user_id = ?
      AND trip_legs.latitude IS NOT NULL
      AND trip_legs.longitude IS NOT NULL
    ORDER BY trip_legs.start_date ASC, trip_legs.sort_order ASC
  `).all(userId) as Record<string, unknown>[]);
  const legsByTrip = new Map<string, TripLeg[]>();
  for (const leg of allLegs) {
    legsByTrip.set(leg.tripId, [...(legsByTrip.get(leg.tripId) ?? []), leg]);
  }

  let geocodes = 0;
  const trips = [];
  for (const row of rows) {
    let working = row;
    if ((working.latitude == null || working.longitude == null) && geocodes < MAX_GEOCODES_PER_REQUEST) {
      geocodes += 1;
      const resolved = await geocodePlace(working.destination);
      if (resolved) {
        // This is an idempotent cache write derived from destination. Do not update
        // trips.updated_at: the trip page keys ItineraryDocument by that value, and bumping
        // it would remount open forms after a map read.
        db.prepare('UPDATE trips SET latitude = ?, longitude = ?, resolved_name = ? WHERE id = ? AND user_id = ?')
          .run(resolved.latitude, resolved.longitude, resolved.name, working.id, userId);
        working = { ...working, latitude: resolved.latitude, longitude: resolved.longitude, resolved_name: resolved.name };
      }
    }
    trips.push(toMapTrip(working, legsByTrip.get(working.id) ?? []));
  }

  return NextResponse.json({ trips });
});
