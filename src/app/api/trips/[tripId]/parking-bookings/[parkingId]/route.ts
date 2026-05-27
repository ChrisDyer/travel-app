import { NextResponse } from 'next/server';
import { db, camelize } from '@/db';
import { getUserId } from '@/lib/auth';
import type { TripParking } from '@/types/travel';

type Params = { params: Promise<{ tripId: string; parkingId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { tripId, parkingId } = await params;
  const userId = getUserId(request);
  const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId);
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  const colMap: Record<string, string> = {
    location: 'location', address: 'address', level: 'level',
    startDate: 'start_date', startTime: 'start_time', endDate: 'end_date', endTime: 'end_time',
    confirmationNumber: 'confirmation_number', orderNumber: 'order_number', vendor: 'vendor',
    bookingStatus: 'booking_status', cost: 'cost', currency: 'currency', notes: 'notes',
  };
  const setClauses: string[] = ['updated_at = ?'];
  const values: unknown[] = [new Date().toISOString()];
  for (const [key, col] of Object.entries(colMap)) {
    if (key in body) { setClauses.push(`${col} = ?`); values.push(body[key]); }
  }
  values.push(parkingId, tripId);

  const spot = db.prepare(
    `UPDATE trip_parking SET ${setClauses.join(', ')} WHERE id = ? AND trip_id = ? RETURNING *`
  ).get(...values) as Record<string, unknown> | undefined;
  if (!spot) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(camelize<TripParking>(spot));
}

export async function DELETE(request: Request, { params }: Params) {
  const { tripId, parkingId } = await params;
  const userId = getUserId(request);
  const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId);
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  db.prepare('DELETE FROM trip_parking WHERE id = ? AND trip_id = ?').run(parkingId, tripId);
  return new NextResponse(null, { status: 204 });
}
