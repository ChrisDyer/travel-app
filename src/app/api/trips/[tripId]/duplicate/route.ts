import { NextResponse } from 'next/server';
import { db, camelize } from '@/db';
import { getUserId } from '@/lib/auth';
import { withErrorHandling } from '@/lib/api-helpers';
import type { Trip } from '@/types/travel';

export const POST = withErrorHandling(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  const { tripId } = await params;
  const userId = getUserId(request);

  const src = db.prepare('SELECT * FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId) as Record<string, unknown> | undefined;
  if (!src) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const newTripId = crypto.randomUUID();
  const now = new Date().toISOString();

  const duplicate = db.transaction(() => {
    db.prepare(`
      INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status,
                         cover_image_url, travelers, notes, travel_mode, rental_car_needed,
                         digest_enabled, digest_day_of_week, budget, budget_currency,
                         created_at, updated_at)
      SELECT ?, user_id, title || ' (Copy)', destination, start_date, end_date, 'planning',
             cover_image_url, travelers, notes, travel_mode, rental_car_needed,
             0, digest_day_of_week, budget, budget_currency, ?, ?
      FROM trips WHERE id = ?
    `).run(newTripId, now, now, tripId);

    const days = db.prepare('SELECT * FROM trip_days WHERE trip_id = ? ORDER BY day_number').all(tripId) as
      { id: string; date: string; day_number: number; title: string | null; notes: string | null }[];
    const insertDay = db.prepare('INSERT INTO trip_days (id, trip_id, date, day_number, title, notes) VALUES (?, ?, ?, ?, ?, ?)');
    const dayIdMap = new Map<string, string>();
    for (const d of days) {
      const newDayId = crypto.randomUUID();
      dayIdMap.set(d.id, newDayId);
      insertDay.run(newDayId, newTripId, d.date, d.day_number, d.title, d.notes);
    }

    const events = db.prepare('SELECT * FROM trip_events WHERE trip_id = ?').all(tripId) as Record<string, unknown>[];
    const insertEvent = db.prepare(`
      INSERT INTO trip_events (id, trip_day_id, trip_id, category, title, start_time, end_time,
        location, location_url, booking_status, confirmation_number, confirmation_source,
        source_email_id, booking_url, cost, currency, seat_info, vendor, order_number,
        cancellation_policy, cancellation_deadline, hike_distance, hike_elevation, trailhead_location, alltrails_url,
        sort_order, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'unbooked', NULL, 'manual', NULL, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const e of events) {
      const newDayId = dayIdMap.get(e.trip_day_id as string);
      if (!newDayId) continue;
      insertEvent.run(
        crypto.randomUUID(), newDayId, newTripId, e.category, e.title, e.start_time, e.end_time,
        e.location, e.location_url, e.booking_url, e.cost, e.currency, e.seat_info, e.vendor,
        e.hike_distance, e.hike_elevation, e.trailhead_location, e.alltrails_url,
        e.sort_order, e.notes, now, now
      );
    }

    const flights = db.prepare('SELECT * FROM trip_flights WHERE trip_id = ?').all(tripId) as Record<string, unknown>[];
    const insertFlight = db.prepare(`
      INSERT INTO trip_flights (id, trip_id, trip_type, airline, flight_number, departure_airport, arrival_airport,
        departure_date, departure_time, arrival_date, arrival_time, confirmation_number, seats,
        return_flight_number, return_departure_date, return_departure_time, return_arrival_date, return_arrival_time,
        return_confirmation_number, return_seats, booking_status, cancellation_policy, cost, currency, notes,
        created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL, ?, 'unbooked', ?, ?, ?, ?, ?, ?)
    `);
    for (const f of flights) {
      insertFlight.run(
        crypto.randomUUID(), newTripId, f.trip_type, f.airline, f.flight_number, f.departure_airport, f.arrival_airport,
        f.departure_date, f.departure_time, f.arrival_date, f.arrival_time, f.seats,
        f.return_flight_number, f.return_departure_date, f.return_departure_time, f.return_arrival_date, f.return_arrival_time,
        f.return_seats, f.cancellation_policy, f.cost, f.currency, f.notes, now, now
      );
    }

    const hotels = db.prepare('SELECT * FROM trip_hotels WHERE trip_id = ?').all(tripId) as Record<string, unknown>[];
    const insertHotel = db.prepare(`
      INSERT INTO trip_hotels (id, trip_id, name, address, location_url, check_in_date, check_in_time,
        check_out_date, check_out_time, confirmation_number, room_type, amenities, booking_status,
        cancellation_policy, cancellation_deadline, cost, currency, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 'unbooked', ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const h of hotels) {
      insertHotel.run(
        crypto.randomUUID(), newTripId, h.name, h.address, h.location_url, h.check_in_date, h.check_in_time,
        h.check_out_date, h.check_out_time, h.room_type, h.amenities,
        h.cancellation_policy, h.cancellation_deadline, h.cost, h.currency, h.notes, now, now
      );
    }

    const parkingSpots = db.prepare('SELECT * FROM trip_parking WHERE trip_id = ?').all(tripId) as Record<string, unknown>[];
    const insertParking = db.prepare(`
      INSERT INTO trip_parking (id, trip_id, location, address, level, start_date, start_time, end_date, end_time,
        confirmation_number, order_number, vendor, booking_status, cost, currency, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, 'unbooked', ?, ?, ?, ?, ?)
    `);
    for (const p of parkingSpots) {
      insertParking.run(
        crypto.randomUUID(), newTripId, p.location, p.address, p.level, p.start_date, p.start_time, p.end_date, p.end_time,
        p.vendor, p.cost, p.currency, p.notes, now, now
      );
    }

    const rentalCars = db.prepare('SELECT * FROM trip_rental_cars WHERE trip_id = ?').all(tripId) as Record<string, unknown>[];
    const insertRentalCar = db.prepare(`
      INSERT INTO trip_rental_cars (id, trip_id, company, car_class, confirmation_number, pickup_date, pickup_time,
        pickup_location, dropoff_date, dropoff_time, dropoff_location, driver_name, booking_status,
        cancellation_policy, cost, currency, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 'unbooked', ?, ?, ?, ?, ?, ?)
    `);
    for (const c of rentalCars) {
      insertRentalCar.run(
        crypto.randomUUID(), newTripId, c.company, c.car_class, c.pickup_date, c.pickup_time,
        c.pickup_location, c.dropoff_date, c.dropoff_time, c.dropoff_location, c.driver_name,
        c.cancellation_policy, c.cost, c.currency, c.notes, now, now
      );
    }

    const transit = db.prepare('SELECT * FROM trip_transit WHERE trip_id = ?').all(tripId) as Record<string, unknown>[];
    const insertTransit = db.prepare(`
      INSERT INTO trip_transit (id, trip_id, transit_type, operator, route_number, from_location, to_location,
        departure_date, departure_time, arrival_date, arrival_time, confirmation_number, seat_info, booking_status,
        cost, currency, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'unbooked', ?, ?, ?, ?, ?)
    `);
    for (const t of transit) {
      insertTransit.run(
        crypto.randomUUID(), newTripId, t.transit_type, t.operator, t.route_number, t.from_location, t.to_location,
        t.departure_date, t.departure_time, t.arrival_date, t.arrival_time, t.seat_info,
        t.cost, t.currency, t.notes, now, now
      );
    }

    db.prepare(`
      INSERT INTO trip_cover_images (trip_id, data, updated_at)
      SELECT ?, data, ? FROM trip_cover_images WHERE trip_id = ?
    `).run(newTripId, now, tripId);

    const newTrip = db.prepare('SELECT cover_image_url FROM trips WHERE id = ?').get(newTripId) as { cover_image_url: string | null };
    if (newTrip.cover_image_url) {
      db.prepare('UPDATE trips SET cover_image_url = ? WHERE id = ?').run(`/api/trips/${newTripId}/cover-image?v=${Date.now()}`, newTripId);
    }
  });
  duplicate();

  const created = db.prepare('SELECT * FROM trips WHERE id = ?').get(newTripId) as Record<string, unknown>;
  return NextResponse.json(camelize<Trip>(created), { status: 201 });
});
