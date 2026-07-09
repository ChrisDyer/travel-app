import { NextResponse } from 'next/server';
import { db, camelize, camelizeAll } from '@/db';
import { getUserId } from '@/lib/auth';
import { requireFields, withErrorHandling } from '@/lib/api-helpers';
import type { TripHotel } from '@/types/travel';

export const GET = withErrorHandling(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  const { tripId } = await params;
  const userId = getUserId(request);
  const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId);
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const hotels = db.prepare('SELECT * FROM trip_hotels WHERE trip_id = ? ORDER BY check_in_date ASC').all(tripId) as Record<string, unknown>[];
  return NextResponse.json(camelizeAll<TripHotel>(hotels));
});

export const POST = withErrorHandling(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  const { tripId } = await params;
  const userId = getUserId(request);
  const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId);
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  const invalid = requireFields(body, ['name']);
  if (invalid) return invalid;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const hotel = db.prepare(`
    INSERT INTO trip_hotels (
      id, trip_id, name, address, location_url, check_in_date, check_in_time,
      check_out_date, check_out_time, confirmation_number, room_type, amenities,
      booking_status, cancellation_policy, cancellation_deadline, cost, currency, notes,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `).get(
    id, tripId, body.name, body.address ?? null, body.locationUrl ?? null,
    body.checkInDate ?? null, body.checkInTime ?? null,
    body.checkOutDate ?? null, body.checkOutTime ?? null,
    body.confirmationNumber ?? null, body.roomType ?? null, body.amenities ?? null,
    body.bookingStatus ?? 'unbooked', body.cancellationPolicy ?? null,
    body.cancellationDeadline ?? null, body.cost ?? null, body.currency ?? null,
    body.notes ?? null, now, now
  ) as Record<string, unknown>;

  return NextResponse.json(camelize<TripHotel>(hotel), { status: 201 });
});
