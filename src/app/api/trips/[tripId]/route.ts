import { NextResponse } from 'next/server';
import { db, camelize } from '@/db';
import { getUserId } from '@/lib/auth';
import { withErrorHandling } from '@/lib/api-helpers';
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

  const before = db.prepare('SELECT start_date, end_date FROM trips WHERE id = ? AND user_id = ?')
    .get(tripId, userId) as { start_date: string; end_date: string } | undefined;
  if (!before) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Build SET clause dynamically from body keys
  const colMap: Record<string, string> = {
    title: 'title', destination: 'destination', startDate: 'start_date', endDate: 'end_date',
    status: 'status', coverImageUrl: 'cover_image_url', travelers: 'travelers', notes: 'notes',
    travelMode: 'travel_mode', rentalCarNeeded: 'rental_car_needed', digestEnabled: 'digest_enabled',
    digestDayOfWeek: 'digest_day_of_week', budget: 'budget', budgetCurrency: 'budget_currency',
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
  values.push(tripId, userId);

  const trip = db.prepare(
    `UPDATE trips SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ? RETURNING *`
  ).get(...values) as Record<string, unknown> | undefined;
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Reconcile trip_days when dates change
  const datesChanged =
    (typeof body.startDate === 'string' && body.startDate !== before.start_date) ||
    (typeof body.endDate === 'string' && body.endDate !== before.end_date);
  if (datesChanged) {
    const t = camelize<Trip>(trip);
    const start = new Date(t.startDate + 'T00:00:00');
    const end = new Date(t.endDate + 'T00:00:00');

    const expectedDates: string[] = [];
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      expectedDates.push(d.toISOString().split('T')[0]);
    }

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
