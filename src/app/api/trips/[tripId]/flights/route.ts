import { NextResponse } from 'next/server';
import { db, camelize, camelizeAll } from '@/db';
import { getUserId } from '@/lib/auth';
import type { TripFlight } from '@/types/travel';

export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const userId = getUserId(request);
  const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId);
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const flights = db.prepare('SELECT * FROM trip_flights WHERE trip_id = ? ORDER BY departure_date ASC, departure_time ASC').all(tripId) as Record<string, unknown>[];
  return NextResponse.json(camelizeAll<TripFlight>(flights));
}

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const userId = getUserId(request);
  const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId);
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const flight = db.prepare(`
    INSERT INTO trip_flights (
      id, trip_id, trip_type, airline, flight_number, departure_airport, arrival_airport,
      departure_date, departure_time, arrival_date, arrival_time, confirmation_number, seats,
      return_flight_number, return_departure_date, return_departure_time, return_arrival_date,
      return_arrival_time, return_confirmation_number, return_seats,
      booking_status, cancellation_policy, cost, currency, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `).get(
    id, tripId, body.tripType ?? 'one-way', body.airline ?? null, body.flightNumber ?? null,
    body.departureAirport ?? null, body.arrivalAirport ?? null,
    body.departureDate ?? null, body.departureTime ?? null, body.arrivalDate ?? null, body.arrivalTime ?? null,
    body.confirmationNumber ?? null, body.seats ?? null,
    body.returnFlightNumber ?? null, body.returnDepartureDate ?? null, body.returnDepartureTime ?? null,
    body.returnArrivalDate ?? null, body.returnArrivalTime ?? null,
    body.returnConfirmationNumber ?? null, body.returnSeats ?? null,
    body.bookingStatus ?? 'unbooked', body.cancellationPolicy ?? null,
    body.cost ?? null, body.currency ?? null, body.notes ?? null, now, now
  ) as Record<string, unknown>;

  return NextResponse.json(camelize<TripFlight>(flight), { status: 201 });
}
