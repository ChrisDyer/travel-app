import { NextResponse } from 'next/server';
import { db, camelize } from '@/db';
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

  const body = await request.json() as { title?: string | null; notes?: string | null };

  const sets: string[] = [];
  const values: unknown[] = [];
  if ('title' in body) { sets.push('title = ?'); values.push(body.title?.trim() || null); }
  if ('notes' in body) { sets.push('notes = ?'); values.push(body.notes?.trim() || null); }
  if (sets.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  values.push(dayId, tripId);
  db.prepare(`UPDATE trip_days SET ${sets.join(', ')} WHERE id = ? AND trip_id = ?`).run(...values);

  const day = db.prepare('SELECT * FROM trip_days WHERE id = ?').get(dayId) as Record<string, unknown>;
  return NextResponse.json(camelize(day));
});
