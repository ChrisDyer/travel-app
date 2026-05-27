import { NextResponse } from 'next/server';
import { db, camelize, camelizeAll } from '@/db';
import { getUserId } from '@/lib/auth';
import type { TripParking } from '@/types/travel';

export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const userId = getUserId(request);
  const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId);
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const spots = db.prepare('SELECT * FROM trip_parking WHERE trip_id = ? ORDER BY start_date ASC, start_time ASC').all(tripId) as Record<string, unknown>[];
  return NextResponse.json(camelizeAll<TripParking>(spots));
}

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const userId = getUserId(request);
  const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId);
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const spot = db.prepare(`
    INSERT INTO trip_parking (
      id, trip_id, location, address, level, start_date, start_time, end_date, end_time,
      confirmation_number, order_number, vendor, booking_status, cost, currency, notes,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `).get(
    id, tripId, body.location, body.address ?? null, body.level ?? null,
    body.startDate ?? null, body.startTime ?? null, body.endDate ?? null, body.endTime ?? null,
    body.confirmationNumber ?? null, body.orderNumber ?? null, body.vendor ?? null,
    body.bookingStatus ?? 'unbooked', body.cost ?? null, body.currency ?? null,
    body.notes ?? null, now, now
  ) as Record<string, unknown>;

  return NextResponse.json(camelize<TripParking>(spot), { status: 201 });
}
