import { db, camelizeAll } from '@/db';
import { skipsBooking } from '@/lib/bookings';
import type { EventCategory, Trip } from '@/types/travel';

export interface AgendaTripRef { id: string; title: string; }

export type CancellationDeadline = {
  trip: AgendaTripRef;
  type: 'hotel' | 'event';
  label: string;
  deadline: string;
  daysUntil: number;
};

export type BookingNeed = {
  trip: AgendaTripRef;
  kind: 'event' | 'flight' | 'hotel' | 'rentalCar' | 'parking' | 'transit';
  label: string;
  date: string | null;
};

const MS_PER_DAY = 86400000;

export function daysUntil(date: string, today: string): number {
  const target = Date.parse(date + 'T12:00:00Z');
  const now = Date.parse(today + 'T12:00:00Z');
  return Math.round((target - now) / MS_PER_DAY);
}

export function upcomingTrips(userId: string, today: string, limit?: number): Trip[] {
  const rows = db.prepare(
    `SELECT * FROM trips
     WHERE user_id = ? AND end_date >= ?
     ORDER BY start_date ASC, end_date ASC`
  ).all(userId, today) as Record<string, unknown>[];
  const trips = camelizeAll<Trip>(rows);
  return typeof limit === 'number' ? trips.slice(0, limit) : trips;
}

export function cancellationDeadlines(userId: string, today: string): CancellationDeadline[] {
  const rows = db.prepare(`
    SELECT trips.id AS trip_id, trips.title AS trip_title, 'hotel' AS type,
      trip_hotels.name AS label, trip_hotels.cancellation_deadline AS deadline
    FROM trip_hotels
    JOIN trips ON trips.id = trip_hotels.trip_id
    WHERE trips.user_id = ?
      AND trip_hotels.cancellation_deadline IS NOT NULL
      AND trim(trip_hotels.cancellation_deadline) != ''
    UNION ALL
    SELECT trips.id AS trip_id, trips.title AS trip_title, 'event' AS type,
      trip_events.title AS label, trip_events.cancellation_deadline AS deadline
    FROM trip_events
    JOIN trips ON trips.id = trip_events.trip_id
    WHERE trips.user_id = ?
      AND trip_events.cancellation_deadline IS NOT NULL
      AND trim(trip_events.cancellation_deadline) != ''
  `).all(userId, userId) as {
    trip_id: string;
    trip_title: string;
    type: 'hotel' | 'event';
    label: string;
    deadline: string;
  }[];

  return rows
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.deadline))
    .map((row) => ({
      trip: { id: row.trip_id, title: row.trip_title },
      type: row.type,
      label: row.label,
      deadline: row.deadline,
      daysUntil: daysUntil(row.deadline, today),
    }))
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
}

export function needsBooking(userId: string, today: string): BookingNeed[] {
  const needs: BookingNeed[] = [];
  const eventRows = db.prepare(`
    SELECT trips.id AS trip_id, trips.title AS trip_title, trip_events.title AS label,
      trip_days.date AS date, trip_events.category, trip_events.takes_reservations
    FROM trip_events
    JOIN trips ON trips.id = trip_events.trip_id
    LEFT JOIN trip_days ON trip_days.id = trip_events.trip_day_id
    WHERE trips.user_id = ?
      AND trips.end_date >= ?
      AND trip_events.booking_status = 'unbooked'
      AND trip_events.category != 'hike'
  `).all(userId, today) as {
    trip_id: string;
    trip_title: string;
    label: string;
    date: string | null;
    category: EventCategory;
    takes_reservations: number | boolean;
  }[];

  for (const row of eventRows) {
    if (skipsBooking({ category: row.category, takesReservations: Boolean(row.takes_reservations) })) continue;
    needs.push({ trip: { id: row.trip_id, title: row.trip_title }, kind: 'event', label: row.label, date: row.date });
  }

  const unionRows = db.prepare(`
    SELECT trips.id AS trip_id, trips.title AS trip_title, 'flight' AS kind,
      trim(COALESCE(trip_flights.airline, '') || ' ' || COALESCE(trip_flights.flight_number, '')) AS label,
      trip_flights.departure_date AS date
    FROM trip_flights JOIN trips ON trips.id = trip_flights.trip_id
    WHERE trips.user_id = ? AND trips.end_date >= ? AND (trip_flights.booking_status = 'unbooked' OR trip_flights.booking_status IS NULL)
    UNION ALL
    SELECT trips.id AS trip_id, trips.title AS trip_title, 'hotel' AS kind,
      trip_hotels.name AS label, trip_hotels.check_in_date AS date
    FROM trip_hotels JOIN trips ON trips.id = trip_hotels.trip_id
    WHERE trips.user_id = ? AND trips.end_date >= ? AND (trip_hotels.booking_status = 'unbooked' OR trip_hotels.booking_status IS NULL)
    UNION ALL
    SELECT trips.id AS trip_id, trips.title AS trip_title, 'rentalCar' AS kind,
      trip_rental_cars.company AS label, trip_rental_cars.pickup_date AS date
    FROM trip_rental_cars JOIN trips ON trips.id = trip_rental_cars.trip_id
    WHERE trips.user_id = ? AND trips.end_date >= ? AND (trip_rental_cars.booking_status = 'unbooked' OR trip_rental_cars.booking_status IS NULL)
    UNION ALL
    -- Parking and transit carry takes_reservations too (migration 012). Unlike events there is
    -- no category gate, so the flag alone decides and the test stays in SQL; skipsBooking() is
    -- still the authority for that rule -- see src/lib/bookings.ts.
    SELECT trips.id AS trip_id, trips.title AS trip_title, 'parking' AS kind,
      trip_parking.location AS label, trip_parking.start_date AS date
    FROM trip_parking JOIN trips ON trips.id = trip_parking.trip_id
    WHERE trips.user_id = ? AND trips.end_date >= ? AND (trip_parking.booking_status = 'unbooked' OR trip_parking.booking_status IS NULL)
      AND trip_parking.takes_reservations != 0
    UNION ALL
    SELECT trips.id AS trip_id, trips.title AS trip_title, 'transit' AS kind,
      trip_transit.operator AS label, trip_transit.departure_date AS date
    FROM trip_transit JOIN trips ON trips.id = trip_transit.trip_id
    WHERE trips.user_id = ? AND trips.end_date >= ? AND (trip_transit.booking_status = 'unbooked' OR trip_transit.booking_status IS NULL)
      AND trip_transit.takes_reservations != 0
  `).all(
    userId, today,
    userId, today,
    userId, today,
    userId, today,
    userId, today
  ) as (Omit<BookingNeed, 'trip'> & { trip_id: string; trip_title: string })[];

  for (const row of unionRows) {
    needs.push({
      trip: { id: row.trip_id, title: row.trip_title },
      kind: row.kind,
      label: row.label?.trim() || row.kind,
      date: row.date,
    });
  }

  return needs.sort((a, b) => (a.date ?? '9999-99-99').localeCompare(b.date ?? '9999-99-99'));
}

export function emptyItineraries(userId: string, today: string): AgendaTripRef[] {
  return db.prepare(`
    SELECT id, title
    FROM trips
    WHERE user_id = ?
      AND end_date >= ?
      AND (SELECT COUNT(*) FROM trip_events WHERE trip_id = trips.id) = 0
    ORDER BY start_date ASC, end_date ASC
  `).all(userId, today) as AgendaTripRef[];
}
