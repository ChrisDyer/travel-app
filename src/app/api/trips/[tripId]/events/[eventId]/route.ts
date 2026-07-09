import { NextResponse } from 'next/server';
import { db, camelize } from '@/db';
import { getUserId } from '@/lib/auth';
import { withErrorHandling } from '@/lib/api-helpers';
import type { TripEvent } from '@/types/travel';

type Params = { params: Promise<{ tripId: string; eventId: string }> };

export const PATCH = withErrorHandling(async (request: Request, { params }: Params) => {
  const { tripId, eventId } = await params;
  const userId = getUserId(request);
  const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId);
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  const colMap: Record<string, string> = {
    tripDayId: 'trip_day_id', category: 'category', title: 'title', startTime: 'start_time',
    endTime: 'end_time', location: 'location', locationUrl: 'location_url',
    bookingStatus: 'booking_status', confirmationNumber: 'confirmation_number',
    confirmationSource: 'confirmation_source', sourceEmailId: 'source_email_id',
    bookingUrl: 'booking_url', cost: 'cost', currency: 'currency', seatInfo: 'seat_info',
    vendor: 'vendor', orderNumber: 'order_number', cancellationPolicy: 'cancellation_policy',
    cancellationDeadline: 'cancellation_deadline', sortOrder: 'sort_order', notes: 'notes',
  };
  const setClauses: string[] = ['updated_at = ?'];
  const values: unknown[] = [new Date().toISOString()];
  for (const [key, col] of Object.entries(colMap)) {
    if (key in body) { setClauses.push(`${col} = ?`); values.push(body[key]); }
  }
  values.push(eventId, tripId);

  const event = db.prepare(
    `UPDATE trip_events SET ${setClauses.join(', ')} WHERE id = ? AND trip_id = ? RETURNING *`
  ).get(...values) as Record<string, unknown> | undefined;
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(camelize<TripEvent>(event));
});

export const DELETE = withErrorHandling(async (request: Request, { params }: Params) => {
  const { tripId, eventId } = await params;
  const userId = getUserId(request);
  const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId);
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  db.prepare('DELETE FROM trip_events WHERE id = ? AND trip_id = ?').run(eventId, tripId);
  return new NextResponse(null, { status: 204 });
});
