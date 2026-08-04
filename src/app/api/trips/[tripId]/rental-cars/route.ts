import { NextResponse } from 'next/server';
import { db, camelize, camelizeAll } from '@/db';
import { getUserId } from '@/lib/auth';
import { requireFields, withErrorHandling } from '@/lib/api-helpers';
import type { TripRentalCar } from '@/types/travel';

export const GET = withErrorHandling(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  const { tripId } = await params;
  const userId = getUserId(request);
  const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId);
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const cars = db.prepare('SELECT * FROM trip_rental_cars WHERE trip_id = ? ORDER BY pickup_date ASC, pickup_time ASC').all(tripId) as Record<string, unknown>[];
  return NextResponse.json(camelizeAll<TripRentalCar>(cars));
});

export const POST = withErrorHandling(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  const { tripId } = await params;
  const userId = getUserId(request);
  const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId);
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  const invalid = requireFields(body, ['company']);
  if (invalid) return invalid;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const car = db.prepare(`
    INSERT INTO trip_rental_cars (
      id, trip_id, company, car_class, confirmation_number,
      pickup_date, pickup_time, pickup_location, dropoff_date, dropoff_time, dropoff_location,
      driver_name, booking_status, cancellation_policy, cost, currency, notes,
      hide_from_calendar, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `).get(
    id, tripId, body.company, body.carClass ?? null, body.confirmationNumber ?? null,
    body.pickupDate ?? null, body.pickupTime ?? null, body.pickupLocation ?? null,
    body.dropoffDate ?? null, body.dropoffTime ?? null, body.dropoffLocation ?? null,
    body.driverName ?? null, body.bookingStatus ?? 'unbooked',
    body.cancellationPolicy ?? null, body.cost ?? null, body.currency ?? null,
    body.notes ?? null, body.hideFromCalendar ?? 0, now, now
  ) as Record<string, unknown>;

  return NextResponse.json(camelize<TripRentalCar>(car), { status: 201 });
});
