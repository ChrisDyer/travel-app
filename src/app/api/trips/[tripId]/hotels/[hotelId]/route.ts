import { NextResponse } from 'next/server';
import { db, camelize } from '@/db';
import { getUserId } from '@/lib/auth';
import type { TripHotel } from '@/types/travel';

type Params = { params: Promise<{ tripId: string; hotelId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { tripId, hotelId } = await params;
  const userId = getUserId(request);
  const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId);
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  const colMap: Record<string, string> = {
    name: 'name', address: 'address', locationUrl: 'location_url',
    checkInDate: 'check_in_date', checkInTime: 'check_in_time',
    checkOutDate: 'check_out_date', checkOutTime: 'check_out_time',
    confirmationNumber: 'confirmation_number', roomType: 'room_type', amenities: 'amenities',
    bookingStatus: 'booking_status', cancellationPolicy: 'cancellation_policy',
    cancellationDeadline: 'cancellation_deadline', cost: 'cost', currency: 'currency', notes: 'notes',
  };
  const setClauses: string[] = ['updated_at = ?'];
  const values: unknown[] = [new Date().toISOString()];
  for (const [key, col] of Object.entries(colMap)) {
    if (key in body) { setClauses.push(`${col} = ?`); values.push(body[key]); }
  }
  values.push(hotelId, tripId);

  const hotel = db.prepare(
    `UPDATE trip_hotels SET ${setClauses.join(', ')} WHERE id = ? AND trip_id = ? RETURNING *`
  ).get(...values) as Record<string, unknown> | undefined;
  if (!hotel) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(camelize<TripHotel>(hotel));
}

export async function DELETE(request: Request, { params }: Params) {
  const { tripId, hotelId } = await params;
  const userId = getUserId(request);
  const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId);
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  db.prepare('DELETE FROM trip_hotels WHERE id = ? AND trip_id = ?').run(hotelId, tripId);
  return new NextResponse(null, { status: 204 });
}
