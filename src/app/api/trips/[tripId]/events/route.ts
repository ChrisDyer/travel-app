import { NextResponse } from 'next/server';
import { db, camelize, camelizeAll } from '@/db';
import { getUserId } from '@/lib/auth';
import { requireFields, withErrorHandling } from '@/lib/api-helpers';
import type { TripDay, TripEvent } from '@/types/travel';

export const GET = withErrorHandling(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  const { tripId } = await params;
  const userId = getUserId(request);
  const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId);
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const days = db.prepare('SELECT * FROM trip_days WHERE trip_id = ? ORDER BY day_number ASC').all(tripId) as Record<string, unknown>[];
  const events = db.prepare('SELECT * FROM trip_events WHERE trip_id = ? ORDER BY sort_order ASC').all(tripId) as Record<string, unknown>[];
  return NextResponse.json({ days: camelizeAll<TripDay>(days), events: camelizeAll<TripEvent>(events) });
});

export const POST = withErrorHandling(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  const { tripId } = await params;
  const userId = getUserId(request);
  const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId);
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  const invalid = requireFields(body, ['tripDayId', 'category', 'title']);
  if (invalid) return invalid;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const event = db.prepare(`
    INSERT INTO trip_events (
      id, trip_day_id, trip_id, category, title, start_time, end_time, location, location_url,
      booking_status, confirmation_number, confirmation_source, source_email_id, booking_url,
      cost, currency, seat_info, vendor, order_number, cancellation_policy, cancellation_deadline,
      hike_distance, hike_elevation, trailhead_location, alltrails_url, takes_reservations, party_size,
      sort_order, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `).get(
    id, body.tripDayId, tripId, body.category, body.title,
    body.startTime ?? null, body.endTime ?? null, body.location ?? null, body.locationUrl ?? null,
    body.bookingStatus ?? 'unbooked', body.confirmationNumber ?? null,
    body.confirmationSource ?? 'manual', body.sourceEmailId ?? null, body.bookingUrl ?? null,
    body.cost ?? null, body.currency ?? null, body.seatInfo ?? null, body.vendor ?? null,
    body.orderNumber ?? null, body.cancellationPolicy ?? null, body.cancellationDeadline ?? null,
    body.hikeDistance ?? null, body.hikeElevation ?? null, body.trailheadLocation ?? null, body.alltrailsUrl ?? null,
    body.takesReservations ?? 1, body.partySize ?? null,
    body.sortOrder ?? 0, body.notes ?? null, now, now
  ) as Record<string, unknown>;

  return NextResponse.json(camelize<TripEvent>(event), { status: 201 });
});
