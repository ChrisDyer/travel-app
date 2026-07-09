import { NextResponse } from 'next/server';
import { db, camelize } from '@/db';
import { getUserId } from '@/lib/auth';
import { withErrorHandling } from '@/lib/api-helpers';
import type { TripRentalCar } from '@/types/travel';

type Params = { params: Promise<{ tripId: string; rentalCarId: string }> };

export const PATCH = withErrorHandling(async (request: Request, { params }: Params) => {
  const { tripId, rentalCarId } = await params;
  const userId = getUserId(request);
  const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId);
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  const colMap: Record<string, string> = {
    company: 'company', carClass: 'car_class', confirmationNumber: 'confirmation_number',
    pickupDate: 'pickup_date', pickupTime: 'pickup_time', pickupLocation: 'pickup_location',
    dropoffDate: 'dropoff_date', dropoffTime: 'dropoff_time', dropoffLocation: 'dropoff_location',
    driverName: 'driver_name', bookingStatus: 'booking_status',
    cancellationPolicy: 'cancellation_policy', cost: 'cost', currency: 'currency', notes: 'notes',
  };
  const setClauses: string[] = ['updated_at = ?'];
  const values: unknown[] = [new Date().toISOString()];
  for (const [key, col] of Object.entries(colMap)) {
    if (key in body) { setClauses.push(`${col} = ?`); values.push(body[key]); }
  }
  values.push(rentalCarId, tripId);

  const car = db.prepare(
    `UPDATE trip_rental_cars SET ${setClauses.join(', ')} WHERE id = ? AND trip_id = ? RETURNING *`
  ).get(...values) as Record<string, unknown> | undefined;
  if (!car) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(camelize<TripRentalCar>(car));
});

export const DELETE = withErrorHandling(async (request: Request, { params }: Params) => {
  const { tripId, rentalCarId } = await params;
  const userId = getUserId(request);
  const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId);
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  db.prepare('DELETE FROM trip_rental_cars WHERE id = ? AND trip_id = ?').run(rentalCarId, tripId);
  return new NextResponse(null, { status: 204 });
});
