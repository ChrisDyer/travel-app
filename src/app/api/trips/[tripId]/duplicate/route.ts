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
                         travelers, notes, travel_mode, rental_car_needed,
                         digest_enabled, digest_day_of_week, budget, budget_currency,
                         created_at, updated_at)
      SELECT ?, user_id, title || ' (Copy)', destination, start_date, end_date, 'planning',
             travelers, notes, travel_mode, rental_car_needed,
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
        cancellation_policy, cancellation_deadline, sort_order, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'unbooked', NULL, 'manual', NULL, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?)
    `);
    for (const e of events) {
      const newDayId = dayIdMap.get(e.trip_day_id as string);
      if (!newDayId) continue;
      insertEvent.run(
        crypto.randomUUID(), newDayId, newTripId, e.category, e.title, e.start_time, e.end_time,
        e.location, e.location_url, e.booking_url, e.cost, e.currency, e.seat_info, e.vendor,
        e.sort_order, e.notes, now, now
      );
    }
  });
  duplicate();

  const created = db.prepare('SELECT * FROM trips WHERE id = ?').get(newTripId) as Record<string, unknown>;
  return NextResponse.json(camelize<Trip>(created), { status: 201 });
});
