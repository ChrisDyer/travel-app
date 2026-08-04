/** The single normalizer: every source row that can appear on a calendar becomes one
 *  CalendarItem here, and nowhere else.
 *
 *  Both callers — the per-trip .ics download and the subscribe-able feed — build their
 *  items through this function and then run filterItems() over the result. The summary and
 *  description formatting (including the emoji prefixes) is carried over verbatim from the
 *  old inline export route so already-imported events keep matching text as well as UIDs.
 *
 *  Unlike ics.ts / filters.ts / token.ts this module touches the DB, so it has no .mjs
 *  test; its correctness is verified by diffing the export output (docs/calendar-feed/
 *  01-schema-and-normalizer.md, Verification).
 */
import { db, camelizeAll } from '@/db';
import { skipsBooking } from '@/lib/bookings';
import type {
  Trip, TripDay, TripEvent, TripFlight, TripHotel, TripRentalCar, TripParking, TripTransit,
} from '@/types/travel';
import type { CalendarItem } from './filters';

/** Joined text of the non-empty parts, or null — the description convention throughout. */
function lines(...parts: (string | false | null | undefined)[]): string | null {
  return parts.filter(Boolean).join('\n') || null;
}

function uid(prefix: string, id: string): string {
  return `${prefix}-${id}@travel.zo-bot.com`;
}

/** SQLite booleans arrive as 0/1; a row's hide flag is OR'd with its trip's, which is what
 *  makes the trip-level column cascade to everything beneath it. */
function isHidden(rowFlag: unknown, tripHidden: boolean): boolean {
  return tripHidden || Boolean(rowFlag);
}

export function buildCalendarItems(opts: { userId: string; tripId?: string }): CalendarItem[] {
  const { userId, tripId } = opts;

  // With a tripId, scope to that one trip and verify it belongs to the user. Without one,
  // every trip the user owns — a feed must never see another user's data.
  const tripRows = tripId
    ? (db.prepare('SELECT * FROM trips WHERE id = ? AND user_id = ?').all(tripId, userId) as Record<string, unknown>[])
    : (db.prepare('SELECT * FROM trips WHERE user_id = ?').all(userId) as Record<string, unknown>[]);
  const trips = camelizeAll<Trip>(tripRows);
  if (trips.length === 0) return [];

  const tripIds = trips.map((t) => t.id);
  const tripById = new Map(trips.map((t) => [t.id, t]));

  // One query per source table, scoped to the trips resolved above.
  const placeholders = tripIds.map(() => '?').join(', ');
  const rowsFor = <T>(table: string): T[] =>
    camelizeAll<T>(
      db.prepare(`SELECT * FROM ${table} WHERE trip_id IN (${placeholders})`).all(...tripIds) as Record<string, unknown>[]
    );

  const days = rowsFor<TripDay>('trip_days');
  const dayDate = new Map(days.map((d) => [d.id, d.date]));
  const events = rowsFor<TripEvent>('trip_events');
  const flights = rowsFor<TripFlight>('trip_flights');
  const hotels = rowsFor<TripHotel>('trip_hotels');
  const cars = rowsFor<TripRentalCar>('trip_rental_cars');
  const parking = rowsFor<TripParking>('trip_parking');
  const transit = rowsFor<TripTransit>('trip_transit');

  const items: CalendarItem[] = [];

  /** The trip fields every item inherits. */
  const base = (trip: Trip) => ({
    tripId: trip.id,
    tripTitle: trip.title,
    tripStatus: trip.status,
  });

  // --- trip span: the all-day banner across the whole trip ---------------------
  for (const trip of trips) {
    if (!trip.startDate) continue;
    items.push({
      uid: uid('trip', trip.id),
      kind: 'tripSpan',
      id: trip.id,
      ...base(trip),
      bookingStatus: null,
      noBookingNeeded: false,
      eventCategory: null,
      hidden: Boolean(trip.hideFromCalendar),
      summary: trip.title,
      start: { date: trip.startDate },
      end: trip.endDate ? { date: trip.endDate } : null,
      location: trip.destination,
      description: null,
      updatedAt: String(trip.updatedAt),
    });
  }

  // --- day events --------------------------------------------------------------
  for (const e of events) {
    const trip = tripById.get(e.tripId);
    if (!trip) continue;
    const date = dayDate.get(e.tripDayId);
    if (!date) continue;
    items.push({
      uid: uid('event', e.id),
      kind: 'event',
      id: e.id,
      ...base(trip),
      // A hike never shows a booking status in the app (see CLAUDE.md, "Plans that need no
      // booking"), so it must not be caught by a "confirmed only" feed either.
      bookingStatus: e.category === 'hike' ? null : e.bookingStatus,
      noBookingNeeded: skipsBooking(e),
      eventCategory: e.category,
      hidden: isHidden(e.hideFromCalendar, Boolean(trip.hideFromCalendar)),
      summary: e.title,
      start: { date, time: e.startTime },
      end: e.endTime ? { date, time: e.endTime } : null,
      location: e.location,
      description: e.notes,
      updatedAt: String(e.updatedAt),
    });
  }

  // --- flights: both legs come from the one row -------------------------------
  for (const f of flights) {
    const trip = tripById.get(f.tripId);
    if (!trip) continue;
    const hidden = isHidden(f.hideFromCalendar, Boolean(trip.hideFromCalendar));

    if (f.departureDate) {
      const route = [f.departureAirport, f.arrivalAirport].filter(Boolean).join(' → ');
      items.push({
        uid: uid('flight', f.id),
        kind: 'flight',
        id: f.id,
        ...base(trip),
        bookingStatus: f.bookingStatus,
        noBookingNeeded: false,
        eventCategory: null,
        hidden,
        summary: `✈️ ${[f.airline, f.flightNumber].filter(Boolean).join(' ') || 'Flight'}${route ? ` (${route})` : ''}`,
        start: { date: f.departureDate, time: f.departureTime },
        end: f.arrivalDate ? { date: f.arrivalDate, time: f.arrivalTime } : null,
        location: f.departureAirport,
        description: lines(
          f.confirmationNumber && `Conf: ${f.confirmationNumber}`,
          f.seats && `Seats: ${f.seats}`,
          f.notes
        ),
        updatedAt: String(f.updatedAt),
      });
    }

    // The return leg lives in the same row. The old export route read only the outbound
    // columns, so nobody ever saw the flight home — this is the bug fix.
    if (f.returnDepartureDate) {
      // The journey home runs the other way, so the route reads arrival → departure.
      const route = [f.arrivalAirport, f.departureAirport].filter(Boolean).join(' → ');
      items.push({
        uid: uid('flight-return', f.id),
        kind: 'flightReturn',
        id: f.id,
        ...base(trip),
        bookingStatus: f.bookingStatus,
        noBookingNeeded: false,
        eventCategory: null,
        hidden,
        summary: `✈️ ${[f.airline, f.returnFlightNumber ?? f.flightNumber].filter(Boolean).join(' ') || 'Flight'}${route ? ` (${route})` : ''}`,
        start: { date: f.returnDepartureDate, time: f.returnDepartureTime },
        end: f.returnArrivalDate ? { date: f.returnArrivalDate, time: f.returnArrivalTime } : null,
        location: f.arrivalAirport,
        description: lines(
          f.returnConfirmationNumber && `Conf: ${f.returnConfirmationNumber}`,
          f.returnSeats && `Seats: ${f.returnSeats}`,
          f.notes
        ),
        updatedAt: String(f.updatedAt),
      });
    }
  }

  // --- hotels ------------------------------------------------------------------
  for (const h of hotels) {
    const trip = tripById.get(h.tripId);
    if (!trip || !h.checkInDate) continue;
    items.push({
      uid: uid('hotel', h.id),
      kind: 'hotel',
      id: h.id,
      ...base(trip),
      bookingStatus: h.bookingStatus,
      noBookingNeeded: false,
      eventCategory: null,
      hidden: isHidden(h.hideFromCalendar, Boolean(trip.hideFromCalendar)),
      summary: `🏨 ${h.name}`,
      start: { date: h.checkInDate, time: h.checkInTime },
      end: h.checkOutDate ? { date: h.checkOutDate, time: h.checkOutTime } : null,
      location: h.address,
      description: lines(
        h.confirmationNumber && `Conf: ${h.confirmationNumber}`,
        h.roomType && `Room: ${h.roomType}`,
        h.notes
      ),
      updatedAt: String(h.updatedAt),
    });
  }

  // --- rental cars -------------------------------------------------------------
  for (const c of cars) {
    const trip = tripById.get(c.tripId);
    if (!trip || !c.pickupDate) continue;
    items.push({
      uid: uid('car', c.id),
      kind: 'car',
      id: c.id,
      ...base(trip),
      bookingStatus: c.bookingStatus,
      noBookingNeeded: false,
      eventCategory: null,
      hidden: isHidden(c.hideFromCalendar, Boolean(trip.hideFromCalendar)),
      summary: `🚗 ${c.company}${c.carClass ? ` (${c.carClass})` : ''}`,
      start: { date: c.pickupDate, time: c.pickupTime },
      end: c.dropoffDate ? { date: c.dropoffDate, time: c.dropoffTime } : null,
      location: c.pickupLocation,
      description: lines(
        c.confirmationNumber && `Conf: ${c.confirmationNumber}`,
        c.dropoffLocation && `Drop-off: ${c.dropoffLocation}`,
        c.notes
      ),
      updatedAt: String(c.updatedAt),
    });
  }

  // --- parking -----------------------------------------------------------------
  for (const p of parking) {
    const trip = tripById.get(p.tripId);
    if (!trip || !p.startDate) continue;
    items.push({
      uid: uid('parking', p.id),
      kind: 'parking',
      id: p.id,
      ...base(trip),
      bookingStatus: p.bookingStatus,
      noBookingNeeded: false,
      eventCategory: null,
      hidden: isHidden(p.hideFromCalendar, Boolean(trip.hideFromCalendar)),
      summary: `🅿️ ${p.location}`,
      start: { date: p.startDate, time: p.startTime },
      end: p.endDate ? { date: p.endDate, time: p.endTime } : null,
      location: p.address,
      description: lines(
        p.confirmationNumber && `Conf: ${p.confirmationNumber}`,
        p.vendor && `Vendor: ${p.vendor}`,
        p.notes
      ),
      updatedAt: String(p.updatedAt),
    });
  }

  // --- transit -----------------------------------------------------------------
  for (const t of transit) {
    const trip = tripById.get(t.tripId);
    if (!trip || !t.departureDate) continue;
    const route = [t.fromLocation, t.toLocation].filter(Boolean).join(' → ');
    items.push({
      uid: uid('transit', t.id),
      kind: 'transit',
      id: t.id,
      ...base(trip),
      bookingStatus: t.bookingStatus,
      noBookingNeeded: false,
      eventCategory: null,
      hidden: isHidden(t.hideFromCalendar, Boolean(trip.hideFromCalendar)),
      summary: `🚆 ${t.operator}${route ? ` (${route})` : ''}`,
      start: { date: t.departureDate, time: t.departureTime },
      end: t.arrivalDate ? { date: t.arrivalDate, time: t.arrivalTime } : null,
      location: t.fromLocation,
      description: lines(
        t.confirmationNumber && `Conf: ${t.confirmationNumber}`,
        t.seatInfo && `Seat: ${t.seatInfo}`,
        t.notes
      ),
      updatedAt: String(t.updatedAt),
    });
  }

  // Deterministic order, so two fetches with no edits are byte-identical. That is what
  // makes the output diffable and what any future ETag would hash.
  items.sort((a, b) => {
    if (a.start.date !== b.start.date) return a.start.date < b.start.date ? -1 : 1;
    const aTime = a.start.time ?? '';
    const bTime = b.start.time ?? '';
    if (aTime !== bTime) return aTime < bTime ? -1 : 1;
    return a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0;
  });

  return items;
}
