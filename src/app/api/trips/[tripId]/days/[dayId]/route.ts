import { NextResponse } from 'next/server';
import { db } from '@/db';
import { getUserId } from '@/lib/auth';
import { withErrorHandling } from '@/lib/api-helpers';

export const PATCH = withErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ tripId: string; dayId: string }> }
) => {
  const { tripId, dayId } = await params;
  const userId = getUserId(request);

  const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId);
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json() as { title?: string | null };
  const title = body.title?.trim() || null;

  db.prepare('UPDATE trip_days SET title = ? WHERE id = ? AND trip_id = ?').run(title, dayId, tripId);

  return NextResponse.json({ id: dayId, title });
});
