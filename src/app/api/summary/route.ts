import { NextResponse } from 'next/server';
import { db } from '@/db';

// Compact summary for the cross-app homepage dashboard: the next current/upcoming trip.
export async function GET() {
  const today = new Date().toISOString().slice(0, 10);
  const trip = db.prepare(
    `SELECT id, title, destination, start_date, end_date
     FROM trips
     WHERE user_id = 'local' AND end_date >= ?
     ORDER BY start_date ASC
     LIMIT 1`
  ).get(today) as { id: string; title: string; destination: string; start_date: string; end_date: string } | undefined;

  if (!trip) return NextResponse.json({ nextTrip: null });

  const start = new Date(trip.start_date + 'T00:00:00Z').getTime();
  const now = new Date(today + 'T00:00:00Z').getTime();
  const daysUntil = Math.round((start - now) / 86400000);

  return NextResponse.json({
    nextTrip: {
      id: trip.id,
      title: trip.title,
      destination: trip.destination,
      startDate: trip.start_date,
      daysUntil, // negative or 0 means the trip is in progress
    },
  });
}
