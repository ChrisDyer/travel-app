import { db, camelize, camelizeAll } from '@/db';
import { getUserId } from '@/lib/auth';
import type {
  Trip, TripDay, TripEvent, TripFlight, TripHotel, TripRentalCar, TripParking, TripTransit,
} from '@/types/travel';

// --- iCalendar helpers ----------------------------------------------------------

function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// Fold lines to 75 octets per RFC 5545 (continuation lines start with a space).
function fold(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let rest = line;
  chunks.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 74) {
    chunks.push(' ' + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest.length) chunks.push(' ' + rest);
  return chunks.join('\r\n');
}

function toDateStamp(d = new Date()): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// 'YYYY-MM-DD' + optional 'HH:MM' → floating local datetime, or all-day DATE value.
function dtProperty(name: string, date: string, time?: string | null): string | null {
  if (!date) return null;
  const ymd = date.replace(/-/g, '');
  if (time && /^\d{1,2}:\d{2}/.test(time)) {
    const [h, m] = time.split(':');
    return `${name}:${ymd}T${h.padStart(2, '0')}${m.padStart(2, '0')}00`;
  }
  return `${name};VALUE=DATE:${ymd}`;
}

// For all-day spans DTEND is exclusive, so add one day.
function nextDay(date: string): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

interface EventInput {
  uid: string;
  summary: string;
  start: { date: string; time?: string | null };
  end?: { date: string; time?: string | null } | null;
  location?: string | null;
  description?: string | null;
}

function buildVEvent(dtstamp: string, e: EventInput): string | null {
  const dtStart = dtProperty('DTSTART', e.start.date, e.start.time);
  if (!dtStart) return null;

  const lines = ['BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${dtstamp}`, dtStart];

  // Resolve DTEND. Timed events use the provided end (or omit). All-day events must use
  // an exclusive end date.
  const startAllDay = dtStart.includes('VALUE=DATE');
  if (e.end?.date) {
    const endTimed = e.end.time && /^\d{1,2}:\d{2}/.test(e.end.time);
    if (!startAllDay && endTimed) {
      lines.push(dtProperty('DTEND', e.end.date, e.end.time)!);
    } else {
      lines.push(dtProperty('DTEND', nextDay(e.end.date), null)!);
    }
  } else if (startAllDay) {
    lines.push(dtProperty('DTEND', nextDay(e.start.date), null)!);
  }

  lines.push(`SUMMARY:${escapeText(e.summary)}`);
  if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
  if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
  lines.push('END:VEVENT');
  return lines.map(fold).join('\r\n');
}

// --- Route ----------------------------------------------------------------------

export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const userId = getUserId(request);

  const tripRow = db.prepare('SELECT * FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId) as Record<string, unknown> | undefined;
  if (!tripRow) return new Response('Not found', { status: 404 });
  const trip = camelize<Trip>(tripRow);

  const days = camelizeAll<TripDay>(db.prepare('SELECT * FROM trip_days WHERE trip_id = ?').all(tripId) as Record<string, unknown>[]);
  const dayDate = new Map(days.map((d) => [d.id, d.date]));
  const events = camelizeAll<TripEvent>(db.prepare('SELECT * FROM trip_events WHERE trip_id = ?').all(tripId) as Record<string, unknown>[]);
  const flights = camelizeAll<TripFlight>(db.prepare('SELECT * FROM trip_flights WHERE trip_id = ?').all(tripId) as Record<string, unknown>[]);
  const hotels = camelizeAll<TripHotel>(db.prepare('SELECT * FROM trip_hotels WHERE trip_id = ?').all(tripId) as Record<string, unknown>[]);
  const cars = camelizeAll<TripRentalCar>(db.prepare('SELECT * FROM trip_rental_cars WHERE trip_id = ?').all(tripId) as Record<string, unknown>[]);
  const parking = camelizeAll<TripParking>(db.prepare('SELECT * FROM trip_parking WHERE trip_id = ?').all(tripId) as Record<string, unknown>[]);
  const transit = camelizeAll<TripTransit>(db.prepare('SELECT * FROM trip_transit WHERE trip_id = ?').all(tripId) as Record<string, unknown>[]);

  const dtstamp = toDateStamp();
  const vevents: string[] = [];
  const add = (e: EventInput | null) => { if (e) { const v = buildVEvent(dtstamp, e); if (v) vevents.push(v); } };

  for (const e of events) {
    const date = dayDate.get(e.tripDayId);
    if (!date) continue;
    add({
      uid: `event-${e.id}@travel.zo-bot.com`,
      summary: e.title,
      start: { date, time: e.startTime },
      end: e.endTime ? { date, time: e.endTime } : null,
      location: e.location,
      description: e.notes,
    });
  }

  for (const f of flights) {
    if (!f.departureDate) continue;
    const route = [f.departureAirport, f.arrivalAirport].filter(Boolean).join(' → ');
    add({
      uid: `flight-${f.id}@travel.zo-bot.com`,
      summary: `✈️ ${[f.airline, f.flightNumber].filter(Boolean).join(' ') || 'Flight'}${route ? ` (${route})` : ''}`,
      start: { date: f.departureDate, time: f.departureTime },
      end: f.arrivalDate ? { date: f.arrivalDate, time: f.arrivalTime } : null,
      location: f.departureAirport,
      description: [f.confirmationNumber && `Conf: ${f.confirmationNumber}`, f.seats && `Seats: ${f.seats}`, f.notes].filter(Boolean).join('\n') || null,
    });
  }

  for (const h of hotels) {
    if (!h.checkInDate) continue;
    add({
      uid: `hotel-${h.id}@travel.zo-bot.com`,
      summary: `🏨 ${h.name}`,
      start: { date: h.checkInDate, time: h.checkInTime },
      end: h.checkOutDate ? { date: h.checkOutDate, time: h.checkOutTime } : null,
      location: h.address,
      description: [h.confirmationNumber && `Conf: ${h.confirmationNumber}`, h.roomType && `Room: ${h.roomType}`, h.notes].filter(Boolean).join('\n') || null,
    });
  }

  for (const c of cars) {
    if (!c.pickupDate) continue;
    add({
      uid: `car-${c.id}@travel.zo-bot.com`,
      summary: `🚗 ${c.company}${c.carClass ? ` (${c.carClass})` : ''}`,
      start: { date: c.pickupDate, time: c.pickupTime },
      end: c.dropoffDate ? { date: c.dropoffDate, time: c.dropoffTime } : null,
      location: c.pickupLocation,
      description: [c.confirmationNumber && `Conf: ${c.confirmationNumber}`, c.dropoffLocation && `Drop-off: ${c.dropoffLocation}`, c.notes].filter(Boolean).join('\n') || null,
    });
  }

  for (const p of parking) {
    if (!p.startDate) continue;
    add({
      uid: `parking-${p.id}@travel.zo-bot.com`,
      summary: `🅿️ ${p.location}`,
      start: { date: p.startDate, time: p.startTime },
      end: p.endDate ? { date: p.endDate, time: p.endTime } : null,
      location: p.address,
      description: [p.confirmationNumber && `Conf: ${p.confirmationNumber}`, p.vendor && `Vendor: ${p.vendor}`, p.notes].filter(Boolean).join('\n') || null,
    });
  }

  for (const t of transit) {
    if (!t.departureDate) continue;
    const route = [t.fromLocation, t.toLocation].filter(Boolean).join(' → ');
    add({
      uid: `transit-${t.id}@travel.zo-bot.com`,
      summary: `🚆 ${t.operator}${route ? ` (${route})` : ''}`,
      start: { date: t.departureDate, time: t.departureTime },
      end: t.arrivalDate ? { date: t.arrivalDate, time: t.arrivalTime } : null,
      location: t.fromLocation,
      description: [t.confirmationNumber && `Conf: ${t.confirmationNumber}`, t.seatInfo && `Seat: ${t.seatInfo}`, t.notes].filter(Boolean).join('\n') || null,
    });
  }

  const calendar = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//zo-bot//travel-app//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(trip.title)}`,
    ...vevents,
    'END:VCALENDAR',
  ].join('\r\n');

  const safeName = (trip.title || 'trip').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'trip';

  return new Response(calendar, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${safeName}.ics"`,
    },
  });
}
