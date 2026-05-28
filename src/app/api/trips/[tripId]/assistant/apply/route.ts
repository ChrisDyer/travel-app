import { NextResponse } from 'next/server';
import { db, camelize } from '@/db';
import { getUserId } from '@/lib/auth';
import type { Proposal, TripEvent, TripFlight, TripHotel, TripRentalCar, TripParking, TripTransit } from '@/types/travel';

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const userId = getUserId(request);

  const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId);
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json() as { proposals: Proposal[] };
  const now = new Date().toISOString();

  const addedEvents: TripEvent[] = [];
  const addedFlights: TripFlight[] = [];
  const addedHotels: TripHotel[] = [];
  const addedRentalCars: TripRentalCar[] = [];
  const addedParking: TripParking[] = [];
  const addedTransit: TripTransit[] = [];

  for (const proposal of body.proposals) {
    if (proposal.type === 'event') {
      const id = crypto.randomUUID();
      const row = db.prepare(`
        INSERT INTO trip_events (
          id, trip_day_id, trip_id, category, title, start_time, end_time, location,
          booking_status, confirmation_number, confirmation_source, cost, currency, notes,
          sort_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
        RETURNING *
      `).get(
        id, proposal.tripDayId, tripId, proposal.category, proposal.title,
        proposal.startTime ?? null, proposal.endTime ?? null, proposal.location ?? null,
        proposal.bookingStatus ?? 'unbooked', proposal.confirmationNumber ?? null,
        'gmail', proposal.cost ?? null, proposal.currency ?? null, proposal.notes ?? null,
        now, now
      ) as Record<string, unknown>;
      addedEvents.push(camelize<TripEvent>(row));

    } else if (proposal.type === 'flight') {
      const id = crypto.randomUUID();
      const row = db.prepare(`
        INSERT INTO trip_flights (
          id, trip_id, trip_type, airline, flight_number, departure_airport, arrival_airport,
          departure_date, departure_time, arrival_date, arrival_time, confirmation_number, seats,
          booking_status, cost, currency, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `).get(
        id, tripId, proposal.tripType ?? 'one-way', proposal.airline ?? null,
        proposal.flightNumber ?? null, proposal.departureAirport ?? null, proposal.arrivalAirport ?? null,
        proposal.departureDate ?? null, proposal.departureTime ?? null,
        proposal.arrivalDate ?? null, proposal.arrivalTime ?? null,
        proposal.confirmationNumber ?? null, proposal.seats ?? null,
        proposal.bookingStatus ?? 'unbooked', proposal.cost ?? null, proposal.currency ?? null,
        now, now
      ) as Record<string, unknown>;
      addedFlights.push(camelize<TripFlight>(row));

    } else if (proposal.type === 'hotel') {
      const id = crypto.randomUUID();
      const row = db.prepare(`
        INSERT INTO trip_hotels (
          id, trip_id, name, address, check_in_date, check_in_time,
          check_out_date, check_out_time, confirmation_number, room_type,
          booking_status, cost, currency, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `).get(
        id, tripId, proposal.name, proposal.address ?? null,
        proposal.checkInDate ?? null, proposal.checkInTime ?? null,
        proposal.checkOutDate ?? null, proposal.checkOutTime ?? null,
        proposal.confirmationNumber ?? null, proposal.roomType ?? null,
        proposal.bookingStatus ?? 'unbooked', proposal.cost ?? null, proposal.currency ?? null,
        proposal.notes ?? null, now, now
      ) as Record<string, unknown>;
      addedHotels.push(camelize<TripHotel>(row));

    } else if (proposal.type === 'rental_car') {
      const id = crypto.randomUUID();
      const row = db.prepare(`
        INSERT INTO trip_rental_cars (
          id, trip_id, company, car_class, confirmation_number,
          pickup_date, pickup_time, pickup_location,
          dropoff_date, dropoff_time, dropoff_location,
          booking_status, cost, currency, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `).get(
        id, tripId, proposal.company, proposal.carClass ?? null,
        proposal.confirmationNumber ?? null,
        proposal.pickupDate ?? null, proposal.pickupTime ?? null, proposal.pickupLocation ?? null,
        proposal.dropoffDate ?? null, proposal.dropoffTime ?? null, proposal.dropoffLocation ?? null,
        proposal.bookingStatus ?? 'unbooked', proposal.cost ?? null, proposal.currency ?? null,
        proposal.notes ?? null, now, now
      ) as Record<string, unknown>;
      addedRentalCars.push(camelize<TripRentalCar>(row));

    } else if (proposal.type === 'parking') {
      const id = crypto.randomUUID();
      const row = db.prepare(`
        INSERT INTO trip_parking (
          id, trip_id, location, address, level, start_date, start_time, end_date, end_time,
          confirmation_number, order_number, vendor, booking_status, cost, currency, notes,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `).get(
        id, tripId, proposal.location, proposal.address ?? null, null,
        proposal.startDate ?? null, proposal.startTime ?? null,
        proposal.endDate ?? null, proposal.endTime ?? null,
        proposal.confirmationNumber ?? null, proposal.orderNumber ?? null, proposal.vendor ?? null,
        proposal.bookingStatus ?? 'unbooked', proposal.cost ?? null, proposal.currency ?? null,
        proposal.notes ?? null, now, now
      ) as Record<string, unknown>;
      addedParking.push(camelize<TripParking>(row));

    } else if (proposal.type === 'transit') {
      const id = crypto.randomUUID();
      const row = db.prepare(`
        INSERT INTO trip_transit (
          id, trip_id, transit_type, operator, route_number, from_location, to_location,
          departure_date, departure_time, arrival_date, arrival_time,
          confirmation_number, seat_info, booking_status, cost, currency, notes,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `).get(
        id, tripId, proposal.transitType ?? null, proposal.operator,
        proposal.routeNumber ?? null, proposal.fromLocation ?? null, proposal.toLocation ?? null,
        proposal.departureDate ?? null, proposal.departureTime ?? null,
        proposal.arrivalDate ?? null, proposal.arrivalTime ?? null,
        proposal.confirmationNumber ?? null, proposal.seatInfo ?? null,
        proposal.bookingStatus ?? 'unbooked', proposal.cost ?? null, proposal.currency ?? null,
        proposal.notes ?? null, now, now
      ) as Record<string, unknown>;
      addedTransit.push(camelize<TripTransit>(row));
    }
  }

  return NextResponse.json({ addedEvents, addedFlights, addedHotels, addedRentalCars, addedParking, addedTransit });
}
