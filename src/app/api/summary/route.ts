import { NextResponse } from 'next/server';
import { db } from '@/db';

type TripRow = {
  id: string;
  title: string;
  destination: string;
  start_date: string;
  end_date: string;
  cover_image_url: string | null;
};

type CancellationRow = {
  type: 'hotel' | 'event';
  label: string;
  deadline: string;
};

const MS_PER_DAY = 86400000;

function daysUntil(date: string, today: string): number {
  const target = new Date(date + 'T00:00:00Z').getTime();
  const now = new Date(today + 'T00:00:00Z').getTime();
  return Math.round((target - now) / MS_PER_DAY);
}

function homepageCoverUrl(trip: TripRow): string | null {
  const hasBlob = db.prepare('SELECT 1 FROM trip_cover_images WHERE trip_id = ?').get(trip.id);
  if (!hasBlob && !trip.cover_image_url) return null;
  return `/travel/api/trips/${trip.id}/cover-image`;
}

function cancellationsForTrip(tripId: string, today: string) {
  const hotelRows = db.prepare(`
    SELECT 'hotel' AS type, name AS label, cancellation_deadline AS deadline
    FROM trip_hotels
    WHERE trip_id = ? AND cancellation_deadline IS NOT NULL AND trim(cancellation_deadline) != ''
  `).all(tripId) as CancellationRow[];
  const eventRows = db.prepare(`
    SELECT 'event' AS type, title AS label, cancellation_deadline AS deadline
    FROM trip_events
    WHERE trip_id = ? AND cancellation_deadline IS NOT NULL AND trim(cancellation_deadline) != ''
  `).all(tripId) as CancellationRow[];

  const all = [...hotelRows, ...eventRows]
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.deadline))
    .map((row) => ({ ...row, daysUntil: daysUntil(row.deadline, today) }))
    .sort((a, b) => a.deadline.localeCompare(b.deadline));

  return {
    count: all.length,
    next: all[0] ? {
      type: all[0].type,
      label: all[0].label,
      deadline: all[0].deadline,
      daysUntil: all[0].daysUntil,
    } : null,
  };
}

// Compact summary for the cross-app homepage dashboard: the next current/upcoming trip.
export async function GET() {
  const today = new Date().toISOString().slice(0, 10);
  const trip = db.prepare(
    `SELECT id, title, destination, start_date, end_date, cover_image_url
     FROM trips
     WHERE user_id = 'local' AND end_date >= ?
     ORDER BY start_date ASC
     LIMIT 1`
  ).get(today) as TripRow | undefined;

  if (!trip) return NextResponse.json({ nextTrip: null });

  return NextResponse.json({
    nextTrip: {
      id: trip.id,
      title: trip.title,
      destination: trip.destination,
      startDate: trip.start_date,
      endDate: trip.end_date,
      daysUntil: daysUntil(trip.start_date, today), // negative or 0 means the trip is in progress
      coverImageUrl: homepageCoverUrl(trip),
      cancellations: cancellationsForTrip(trip.id, today),
    },
  });
}