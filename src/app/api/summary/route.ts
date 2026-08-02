import { NextResponse } from 'next/server';
import { db } from '@/db';
import { cancellationDeadlines, daysUntil, upcomingTrips } from '@/lib/agenda';
import type { Trip } from '@/types/travel';

// Deliberately UTC, NOT localToday() from trip-status.ts. This route feeds the cross-app
// homepage dashboard in another repo, and its response shape and values are frozen
// (docs/app-pages/00-overview.md, rule 4). The original implementation used the UTC date;
// switching to the server's local zone would silently shift trip selection and every
// daysUntil by a day whenever the server is not on UTC. The Overview page uses
// localToday() -- the two are allowed to disagree, because only this one is a contract.
function summaryToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function homepageCoverUrl(trip: Pick<Trip, 'id' | 'coverImageUrl'>): string | null {
  const hasBlob = db.prepare('SELECT 1 FROM trip_cover_images WHERE trip_id = ?').get(trip.id);
  if (!hasBlob && !trip.coverImageUrl) return null;
  return `/travel/api/trips/${trip.id}/cover-image`;
}

function cancellationsForTrip(userId: string, tripId: string, today: string) {
  const all = cancellationDeadlines(userId, today).filter((row) => row.trip.id === tripId);

  return {
    // count/next keep their original semantics (all dated deadlines, even past ones)
    // for backward compatibility; upcoming is the actionable next-30-days window.
    count: all.length,
    next: all[0] ? {
      type: all[0].type,
      label: all[0].label,
      deadline: all[0].deadline,
      daysUntil: all[0].daysUntil,
    } : null,
    upcoming: all
      .filter((row) => row.daysUntil >= 0 && row.daysUntil <= 30)
      .slice(0, 10)
      .map(({ type, label, deadline, daysUntil }) => ({ type, label, deadline, daysUntil })),
  };
}

// Compact summary for the cross-app homepage dashboard: the next current/upcoming trip.
export async function GET() {
  const userId = 'local';
  const today = summaryToday();
  const trip = upcomingTrips(userId, today, 1)[0];

  if (!trip) return NextResponse.json({ nextTrip: null });

  return NextResponse.json({
    nextTrip: {
      id: trip.id,
      title: trip.title,
      destination: trip.destination,
      startDate: trip.startDate,
      endDate: trip.endDate,
      daysUntil: daysUntil(trip.startDate, today), // negative or 0 means the trip is in progress
      coverImageUrl: homepageCoverUrl(trip),
      cancellations: cancellationsForTrip(userId, trip.id, today),
    },
  });
}
