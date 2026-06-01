import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { db, camelize } from '@/db';
import { getUserId } from '@/lib/auth';
import type { Trip, PackingItem, PackingCategory } from '@/types/travel';

const anthropic = new Anthropic();

// Minimal per-minute spend guard (single-user app).
const AI_MAX_PER_WINDOW = 15;
const AI_WINDOW_MS = 60_000;
let aiWindowStart = 0;
let aiWindowCount = 0;
function aiRateLimitOk(): boolean {
  const now = Date.now();
  if (now - aiWindowStart >= AI_WINDOW_MS) { aiWindowStart = now; aiWindowCount = 0; }
  aiWindowCount++;
  return aiWindowCount <= AI_MAX_PER_WINDOW;
}

const CATEGORIES: PackingCategory[] = ['Documents & Essentials', 'Clothing', 'Tech & Apps', 'Health & Comfort'];

function parseItems(text: string): { category: string; item: string }[] {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  try {
    const arr = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(arr)) return [];
    return arr.filter((x) => x && typeof x.category === 'string' && typeof x.item === 'string')
      .map((x) => ({ category: x.category, item: x.item.trim() }));
  } catch {
    return [];
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const userId = getUserId(request);

  if (!aiRateLimitOk()) return NextResponse.json({ error: 'Rate limit exceeded — try again shortly.' }, { status: 429 });

  const tripRow = db.prepare('SELECT * FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId) as Record<string, unknown> | undefined;
  if (!tripRow) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const trip = camelize<Trip>(tripRow);

  const days = Math.max(1, Math.round((new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime()) / 86400000) + 1);
  const existing = new Set(
    (db.prepare('SELECT lower(item) AS item FROM packing_items WHERE trip_id = ?').all(tripId) as { item: string }[]).map((r) => r.item)
  );

  const system = `You are a travel packing expert. Suggest a practical packing list. Respond with ONLY a JSON array (no prose, no markdown fences) of objects {"category": one of ["Documents & Essentials","Clothing","Tech & Apps","Health & Comfort"], "item": string}. Provide 15-30 concise items total, tailored to the destination, season/dates, and trip length.`;
  const userMsg = `Trip: ${trip.title} to ${trip.destination}\nDates: ${trip.startDate} to ${trip.endDate} (${days} days)`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system,
      messages: [{ role: 'user', content: userMsg }],
    });
    const text = msg.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('');

    const now = new Date().toISOString();
    const insert = db.prepare(`
      INSERT INTO packing_items (id, trip_id, category, item, is_packed, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, ?, ?, ?) RETURNING *
    `);
    const countInCat = db.prepare('SELECT COUNT(*) AS n FROM packing_items WHERE trip_id = ? AND category = ?');

    const added: PackingItem[] = [];
    for (const p of parseItems(text)) {
      if (!CATEGORIES.includes(p.category as PackingCategory) || !p.item) continue;
      const key = p.item.toLowerCase();
      if (existing.has(key)) continue; // dedup against current list + this batch
      existing.add(key);
      const sortOrder = (countInCat.get(tripId, p.category) as { n: number }).n;
      const row = insert.get(crypto.randomUUID(), tripId, p.category, p.item, sortOrder, now, now) as Record<string, unknown>;
      added.push(camelize<PackingItem>(row));
    }
    return NextResponse.json({ added });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'AI error' }, { status: 500 });
  }
}
