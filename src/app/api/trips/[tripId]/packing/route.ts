import { NextResponse } from 'next/server';
import { db, camelize, camelizeAll } from '@/db';
import { getUserId } from '@/lib/auth';
import { requireFields, withErrorHandling } from '@/lib/api-helpers';
import type { PackingItem } from '@/types/travel';

export const GET = withErrorHandling(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  const { tripId } = await params;
  const userId = getUserId(request);
  const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId);
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const items = db.prepare('SELECT * FROM packing_items WHERE trip_id = ? ORDER BY sort_order ASC').all(tripId) as Record<string, unknown>[];
  return NextResponse.json(camelizeAll<PackingItem>(items));
});

export const POST = withErrorHandling(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  const { tripId } = await params;
  const userId = getUserId(request);
  const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId);
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  const invalid = requireFields(body, ['category', 'item']);
  if (invalid) return invalid;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const item = db.prepare(`
    INSERT INTO packing_items (id, trip_id, category, item, is_packed, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `).get(
    id, tripId, body.category, body.item,
    body.isPacked ? 1 : 0, body.sortOrder ?? 0, now, now
  ) as Record<string, unknown>;

  return NextResponse.json(camelize<PackingItem>(item), { status: 201 });
});
