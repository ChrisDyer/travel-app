import { NextResponse } from 'next/server';
import { db, camelize } from '@/db';
import { getUserId } from '@/lib/auth';
import { withErrorHandling } from '@/lib/api-helpers';
import type { TripFlight } from '@/types/travel';

type Params = { params: Promise<{ tripId: string; flightId: string }> };

export const PATCH = withErrorHandling(async (request: Request, { params }: Params) => {
  const { tripId, flightId } = await params;
  const userId = getUserId(request);
  const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId);
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  const colMap: Record<string, string> = {
    tripType: 'trip_type', airline: 'airline', flightNumber: 'flight_number',
    departureAirport: 'departure_airport', arrivalAirport: 'arrival_airport',
    departureDate: 'departure_date', departureTime: 'departure_time',
    arrivalDate: 'arrival_date', arrivalTime: 'arrival_time',
    confirmationNumber: 'confirmation_number', seats: 'seats',
    returnFlightNumber: 'return_flight_number', returnDepartureDate: 'return_departure_date',
    returnDepartureTime: 'return_departure_time', returnArrivalDate: 'return_arrival_date',
    returnArrivalTime: 'return_arrival_time', returnConfirmationNumber: 'return_confirmation_number',
    returnSeats: 'return_seats', bookingStatus: 'booking_status',
    cancellationPolicy: 'cancellation_policy', cost: 'cost', currency: 'currency', notes: 'notes',
  };
  const setClauses: string[] = ['updated_at = ?'];
  const values: unknown[] = [new Date().toISOString()];
  for (const [key, col] of Object.entries(colMap)) {
    if (key in body) { setClauses.push(`${col} = ?`); values.push(body[key]); }
  }
  values.push(flightId, tripId);

  const flight = db.prepare(
    `UPDATE trip_flights SET ${setClauses.join(', ')} WHERE id = ? AND trip_id = ? RETURNING *`
  ).get(...values) as Record<string, unknown> | undefined;
  if (!flight) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(camelize<TripFlight>(flight));
});

export const DELETE = withErrorHandling(async (request: Request, { params }: Params) => {
  const { tripId, flightId } = await params;
  const userId = getUserId(request);
  const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId);
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  db.prepare('DELETE FROM trip_flights WHERE id = ? AND trip_id = ?').run(flightId, tripId);
  return new NextResponse(null, { status: 204 });
});
