import { NextResponse } from 'next/server';
import { db, camelize } from '@/db';
import { getUserId } from '@/lib/auth';
import type { PackingItem } from '@/types/travel';

type Params = { params: Promise<{ tripId: string; itemId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { tripId, itemId } = await params;
  const userId = getUserId(request);
  const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId);
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  const colMap: Record<string, string> = {
    category: 'category', item: 'item', isPacked: 'is_packed', sortOrder: 'sort_order',
  };
  const setClauses: string[] = ['updated_at = ?'];
  const values: unknown[] = [new Date().toISOString()];
  for (const [key, col] of Object.entries(colMap)) {
    if (key in body) {
      setClauses.push(`${col} = ?`);
      // Coerce boolean to integer for SQLite
      values.push(key === 'isPacked' ? (body[key] ? 1 : 0) : body[key]);
    }
  }
  values.push(itemId, tripId);

  const item = db.prepare(
    `UPDATE packing_items SET ${setClauses.join(', ')} WHERE id = ? AND trip_id = ? RETURNING *`
  ).get(...values) as Record<string, unknown> | undefined;
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(camelize<PackingItem>(item));
}

export async function DELETE(request: Request, { params }: Params) {
  const { tripId, itemId } = await params;
  const userId = getUserId(request);
  const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId);
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  db.prepare('DELETE FROM packing_items WHERE id = ? AND trip_id = ?').run(itemId, tripId);
  return new NextResponse(null, { status: 204 });
}
