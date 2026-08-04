import { NextResponse } from 'next/server';
import { db, camelize } from '@/db';
import { getUserId } from '@/lib/auth';
import { withErrorHandling } from '@/lib/api-helpers';
import { datesBetween } from '@/lib/dates';
import { geocodePlace } from '@/lib/geocode';
import type { Trip } from '@/types/travel';

export const GET = withErrorHandling(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  const { tripId } = await params;
  const userId = getUserId(request);
  const trip = db.prepare('SELECT * FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId) as Record<string, unknown> | undefined;
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(camelize<Trip>(trip));
});

export const PATCH = withErrorHandling(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  const { tripId } = await params;
  const userId = getUserId(request);
  const body = await request.json();

  const before = db.prepare('SELECT start_date, end_date, destination FROM trips WHERE id = ? AND user_id = ?')
    .get(tripId, userId) as { start_date: string; end_date: string; destination: string } | undefined;
  if (!before) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Build SET clause dynamically from body keys.
  // planningNotes and its bookkeeping columns are deliberately absent. The brief is written
  // only via /api/trips/{tripId}/brief, which snapshots the previous value and derives the
  // author from x-internal-token. A second write path here would bypass both and make the
  // Undo button lie. See docs/trip-brief/00-overview.md.
  const colMap: Record<string, string> = {
    title: 'title', destination: 'destination', startDate: 'start_date', endDate: 'end_date',
    status: 'status', coverImageUrl: 'cover_image_url', travelers: 'travelers', notes: 'notes',
    travelMode: 'travel_mode', rentalCarNeeded: 'rental_car_needed', digestEnabled: 'digest_enabled',
    digestDayOfWeek: 'digest_day_of_week', budget: 'budget', budgetCurrency: 'budget_currency',
    hideFromCalendar: 'hide_from_calendar', timezone: 'timezone',
  };
  const setClauses: string[] = ['updated_at = ?'];
  const values: unknown[] = [new Date().toISOString()];
  for (const [key, col] of Object.entries(colMap)) {
    if (key in body) {
      const val = body[key];
      setClauses.push(`${col} = ?`);
      values.push(typeof val === 'boolean' ? (val ? 1 : 0) : val);
    }
  }

  const destinationChanged = typeof body.destination === 'string' && body.destination !== before.destination;
  if (destinationChanged) {
    // Changing the destination invalidates the cached geocode. Clearing these in the same UPDATE
    // is what stops the map pin sitting on the old city under the new city's label.
    // See docs/app-pages/00-overview.md, rule 1.
    //
    // resolved_timezone is derived from the same geocode and is cleared with them. `timezone` is
    // NOT — that is the user's explicit override, and wiping it because someone fixed a typo in
    // the destination would silently break their calendar times.
    setClauses.push('latitude = NULL', 'longitude = NULL', 'resolved_name = NULL', 'resolved_timezone = NULL');
  }
  values.push(tripId, userId);

  const trip = db.prepare(
    `UPDATE trips SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ? RETURNING *`
  ).get(...values) as Record<string, unknown> | undefined;
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (destinationChanged) {
    // Best-effort re-resolve, in-line. GET /api/map is still the lazy safety net, but waiting for
    // someone to open the map would leave every timed item in this trip without a timezone in the
    // meantime — and the calendar feed publishes those as all-day. That would show up in both
    // subscribers' calendars as events flipping to all-day and back hours later. Failure here is
    // non-fatal: the cache simply stays NULL and /api/map fills it later.
    try {
      const resolved = await geocodePlace(trip.destination as string);
      if (resolved) {
        db.prepare('UPDATE trips SET latitude = ?, longitude = ?, resolved_name = ?, resolved_timezone = ? WHERE id = ? AND user_id = ?')
          .run(resolved.latitude, resolved.longitude, resolved.name, resolved.timezone, tripId, userId);
        Object.assign(trip, {
          latitude: resolved.latitude,
          longitude: resolved.longitude,
          resolved_name: resolved.name,
          resolved_timezone: resolved.timezone,
        });
      }
    } catch {
      // Network/timeout — leave the cache NULL rather than failing the edit.
    }
  }

  // Reconcile trip_days when dates change
  const datesChanged =
    (typeof body.startDate === 'string' && body.startDate !== before.start_date) ||
    (typeof body.endDate === 'string' && body.endDate !== before.end_date);
  if (datesChanged) {
    const t = camelize<Trip>(trip);
    const expectedDates: string[] = datesBetween(t.startDate, t.endDate);

    const existingDays = db.prepare('SELECT * FROM trip_days WHERE trip_id = ?').all(tripId) as { id: string; date: string }[];
    const toDelete = existingDays.filter((d) => !expectedDates.includes(d.date));

    if (toDelete.length > 0) {
      if (expectedDates.length > 0) {
        const placeholders = expectedDates.map(() => '?').join(', ');
        db.prepare(`DELETE FROM trip_days WHERE trip_id = ? AND date NOT IN (${placeholders})`).run(tripId, ...expectedDates);
      } else {
        db.prepare('DELETE FROM trip_days WHERE trip_id = ?').run(tripId);
      }
    }

    const existingDates = new Set(existingDays.map((d) => d.date).filter((d) => expectedDates.includes(d)));
    const toInsert = expectedDates.filter((d) => !existingDates.has(d));
    if (toInsert.length > 0) {
      const insertDay = db.prepare('INSERT INTO trip_days (id, trip_id, date, day_number) VALUES (?, ?, ?, 0)');
      const insertAll = db.transaction((dates: string[]) => {
        for (const date of dates) insertDay.run(crypto.randomUUID(), tripId, date);
      });
      insertAll(toInsert);
    }

    // Renumber all days in date order
    const allDays = db.prepare('SELECT id, date FROM trip_days WHERE trip_id = ? ORDER BY date ASC').all(tripId) as { id: string; date: string }[];
    const updateNum = db.prepare('UPDATE trip_days SET day_number = ? WHERE id = ?');
    const renumber = db.transaction(() => {
      allDays.forEach((day, i) => updateNum.run(i + 1, day.id));
    });
    renumber();
  }

  return NextResponse.json(camelize<Trip>(trip));
});

export const DELETE = withErrorHandling(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  const { tripId } = await params;
  const userId = getUserId(request);
  db.prepare('DELETE FROM trips WHERE id = ? AND user_id = ?').run(tripId, userId);
  return new NextResponse(null, { status: 204 });
});
