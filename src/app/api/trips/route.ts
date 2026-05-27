import { NextResponse } from 'next/server';
import { db, camelize, camelizeAll } from '@/db';
import { getUserId } from '@/lib/auth';
import type { Trip, TripDay } from '@/types/travel';

export async function GET(request: Request) {
  const userId = getUserId(request);
  const rows = db.prepare('SELECT * FROM trips WHERE user_id = ? ORDER BY created_at DESC').all(userId) as Record<string, unknown>[];
  return NextResponse.json(camelizeAll<Trip>(rows));
}

export async function POST(request: Request) {
  const userId = getUserId(request);
  const body = await request.json();
  const { title, destination, startDate, endDate, status = 'planning' } = body;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const trip = db.prepare(`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `).get(id, userId, title, destination, startDate, endDate, status, now, now) as Record<string, unknown>;

  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  const insertDay = db.prepare(
    'INSERT INTO trip_days (id, trip_id, date, day_number) VALUES (?, ?, ?, ?)'
  );
  const insertDays = db.transaction((days: TripDay[]) => {
    for (const day of days) insertDay.run(day.id, day.tripId, day.date, day.dayNumber);
  });

  const days: TripDay[] = [];
  for (let d = new Date(start), i = 1; d <= end; d.setDate(d.getDate() + 1), i++) {
    days.push({ id: crypto.randomUUID(), tripId: id, date: d.toISOString().split('T')[0], dayNumber: i } as TripDay);
  }
  if (days.length > 0) insertDays(days);

  return NextResponse.json(camelize<Trip>(trip), { status: 201 });
}
