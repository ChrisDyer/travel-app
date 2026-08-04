import { NextResponse } from 'next/server';
import { db, camelize, camelizeAll } from '@/db';
import { getUserId } from '@/lib/auth';
import { requireFields, withErrorHandling } from '@/lib/api-helpers';
import { datesBetween } from '@/lib/dates';
import type { Trip, TripDay } from '@/types/travel';

export const GET = withErrorHandling(async (request: Request) => {
  const userId = getUserId(request);
  const rows = db.prepare('SELECT * FROM trips WHERE user_id = ? ORDER BY created_at DESC').all(userId) as Record<string, unknown>[];
  return NextResponse.json(camelizeAll<Trip>(rows));
});

export const POST = withErrorHandling(async (request: Request) => {
  const userId = getUserId(request);
  const body = await request.json();
  const invalid = requireFields(body, ['title', 'destination', 'startDate', 'endDate']);
  if (invalid) return invalid;

  const {
    title, destination, startDate, endDate,
    status = 'planning',
    travelMode = 'fly',
    rentalCarNeeded = false,
    travelers = '[]',
    notes = null,
    budget = null,
    budgetCurrency = null,
    hideFromCalendar = 0,
  } = body;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const trip = db.prepare(`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status,
                       travel_mode, rental_car_needed, travelers, notes, budget, budget_currency,
                       hide_from_calendar, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `).get(id, userId, title, destination, startDate, endDate, status,
         travelMode, rentalCarNeeded ? 1 : 0,
         typeof travelers === 'string' ? travelers : JSON.stringify(travelers),
         notes, budget, budgetCurrency, hideFromCalendar ? 1 : 0, now, now) as Record<string, unknown>;

  const insertDay = db.prepare(
    'INSERT INTO trip_days (id, trip_id, date, day_number) VALUES (?, ?, ?, ?)'
  );
  const insertDays = db.transaction((days: TripDay[]) => {
    for (const day of days) insertDay.run(day.id, day.tripId, day.date, day.dayNumber);
  });

  const days: TripDay[] = datesBetween(startDate, endDate).map((date, i) => ({
    id: crypto.randomUUID(), tripId: id, date, dayNumber: i + 1,
  } as TripDay));
  if (days.length > 0) insertDays(days);

  return NextResponse.json(camelize<Trip>(trip), { status: 201 });
});
