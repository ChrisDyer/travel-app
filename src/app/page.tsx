import Link from 'next/link';
import { CalendarClock, CheckCircle2, CloudSun, MapPin, PlaneTakeoff } from 'lucide-react';
import { db, camelizeAll } from '@/db';
import { TravelShell } from '@/appShell/TravelShell';
import { TripWeather } from '@/components/itinerary/TripWeather';
import { Button } from '@/components/ui/button';
import { apiUrl } from '@/lib/api';
import { cancellationDeadlines, emptyItineraries, needsBooking, upcomingTrips, type BookingNeed } from '@/lib/agenda';
import { getAccessInfo, getServerUserId } from '@/lib/auth';
import { formatDateRange, fmt12 } from '@/lib/dates';
import { localToday, statusColors, statusLabel, tripTiming } from '@/lib/trip-status';
import type { TripEvent } from '@/types/travel';

function relative(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 0) return `${Math.abs(days)} days ago`;
  return `in ${days} days`;
}

function coverUrl(tripId: string, coverImageUrl: string | null): string | null {
  const hasBlob = db.prepare('SELECT 1 FROM trip_cover_images WHERE trip_id = ?').get(tripId);
  if (!hasBlob && !coverImageUrl) return null;
  return apiUrl(`/api/trips/${tripId}/cover-image`);
}

function groupNeeds(needs: BookingNeed[]): { tripId: string; tripTitle: string; items: BookingNeed[] }[] {
  const groups = new Map<string, { tripId: string; tripTitle: string; items: BookingNeed[] }>();
  for (const item of needs) {
    const existing = groups.get(item.trip.id) ?? { tripId: item.trip.id, tripTitle: item.trip.title, items: [] };
    existing.items.push(item);
    groups.set(item.trip.id, existing);
  }
  return [...groups.values()];
}

function TodayEvents({ tripId, today }: { tripId: string; today: string }) {
  const rows = db.prepare(`
    SELECT trip_events.*
    FROM trip_events
    JOIN trip_days ON trip_days.id = trip_events.trip_day_id
    WHERE trip_events.trip_id = ? AND trip_days.date = ?
    ORDER BY CASE WHEN trip_events.start_time IS NULL OR trip_events.start_time = '' THEN 1 ELSE 0 END,
      trip_events.start_time ASC,
      trip_events.sort_order ASC
  `).all(tripId, today) as Record<string, unknown>[];
  const events = camelizeAll<TripEvent>(rows);
  if (events.length === 0) return null;

  return (
    <div className="mt-5 border-t border-white/20 pt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Today</p>
      <div className="mt-2 grid gap-2">
        {events.map((event) => (
          <div key={event.id} className="flex min-w-0 items-center justify-between gap-3 rounded-md bg-white/10 px-3 py-2 text-sm text-white/90">
            <span className="min-w-0 truncate">{event.title}</span>
            {event.startTime && <span className="shrink-0 text-white/65">{fmt12(event.startTime)}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function OverviewPage() {
  const userId = await getServerUserId();
  const access = await getAccessInfo();
  const today = localToday();
  const trips = upcomingTrips(userId, today, 5);
  const [nextTrip, ...followingTrips] = trips;
  const deadlines = cancellationDeadlines(userId, today).filter((row) => row.daysUntil >= 0 && row.daysUntil <= 30).slice(0, 10);
  const bookingNeeds = needsBooking(userId, today);
  const emptyTrips = emptyItineraries(userId, today);
  const needGroups = groupNeeds(bookingNeeds);
  const legsVersion = nextTrip
    ? ((db.prepare('SELECT MAX(updated_at) AS value FROM trip_legs WHERE trip_id = ?').get(nextTrip.id) as { value: string | null }).value ?? '')
    : '';
  const hasActions = deadlines.length > 0 || bookingNeeds.length > 0 || emptyTrips.length > 0;
  const heroCover = nextTrip ? coverUrl(nextTrip.id, nextTrip.coverImageUrl) : null;

  return (
    <TravelShell title="Overview" subtitle="What needs attention across Travel" contentClassName="max-w-6xl">
      {!nextTrip ? (
        <section className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-950">No upcoming trips</h2>
          <p className="mt-2 text-sm text-slate-500">Create a trip to start building an itinerary.</p>
          {!access.readOnly && (
            <Link href="/trips/new" className="mt-5 inline-flex">
              <Button>Plan a trip</Button>
            </Link>
          )}
        </section>
      ) : (
        <div className="space-y-8">
          <Link href={`/trips/${nextTrip.id}`} className="block overflow-hidden rounded-lg border border-slate-800 bg-slate-950 text-white shadow-sm transition hover:border-blue-500">
            <div className="grid min-h-80 lg:grid-cols-[1.4fr_1fr]">
              <div className="relative min-h-60 bg-slate-800">
                {heroCover ? (
                  <img src={heroCover} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full min-h-60 items-center justify-center bg-slate-800">
                    <PlaneTakeoff className="h-16 w-16 text-slate-600" aria-hidden="true" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-transparent to-transparent" />
              </div>
              <div className="flex flex-col justify-center p-6 sm:p-8">
                <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-medium ${statusColors[nextTrip.status] ?? statusColors.planning}`}>
                  {statusLabel(nextTrip.status)}
                </span>
                <h2 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">{nextTrip.title}</h2>
                <p className="mt-3 flex items-center gap-2 text-sm text-slate-300"><MapPin className="h-4 w-4" aria-hidden="true" />{nextTrip.destination}</p>
                <p className="mt-2 text-sm text-slate-300">{formatDateRange(nextTrip.startDate, nextTrip.endDate)} - {tripTiming(nextTrip.startDate, nextTrip.endDate, today)}</p>
                {today >= nextTrip.startDate && today <= nextTrip.endDate && <TodayEvents tripId={nextTrip.id} today={today} />}
              </div>
            </div>
          </Link>

          <section>
            <div className="mb-3 flex items-center gap-2 text-slate-700">
              <CloudSun className="h-5 w-5 text-blue-600" aria-hidden="true" />
              <h2 className="text-lg font-semibold text-slate-950">Weather</h2>
            </div>
            <TripWeather tripId={nextTrip.id} legsVersion={legsVersion} />
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5 flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-blue-600" aria-hidden="true" />
              <h2 className="text-lg font-semibold text-slate-950">Action list</h2>
            </div>
            {!hasActions ? (
              <div className="flex items-center gap-2 rounded-md bg-slate-50 px-4 py-3 text-sm text-slate-500">
                <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" />
                Nothing needs attention.
              </div>
            ) : (
              <div className="grid gap-6 lg:grid-cols-3">
                {deadlines.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Cancellation deadlines</h3>
                    <div className="mt-3 grid gap-2">
                      {deadlines.map((item) => (
                        <Link key={`${item.trip.id}-${item.type}-${item.label}-${item.deadline}`} href={`/trips/${item.trip.id}`} className="rounded-md border border-slate-200 px-3 py-2 text-sm hover:border-slate-300 hover:bg-slate-50">
                          <span className="block font-medium text-slate-900">{item.label}</span>
                          <span className="block text-slate-500">{item.trip.title} - {relative(item.daysUntil)}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                {needGroups.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Needs booking</h3>
                    <div className="mt-3 grid gap-3">
                      {needGroups.map((group) => (
                        <Link key={group.tripId} href={`/trips/${group.tripId}`} className="rounded-md border border-slate-200 px-3 py-2 text-sm hover:border-slate-300 hover:bg-slate-50">
                          <span className="block font-medium text-slate-900">{group.tripTitle}</span>
                          <span className="mt-1 block text-slate-500">{group.items.slice(0, 3).map((item) => item.label).join(', ')}{group.items.length > 3 ? ` +${group.items.length - 3} more` : ''}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                {emptyTrips.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Nothing planned yet</h3>
                    <div className="mt-3 grid gap-2">
                      {emptyTrips.map((trip) => (
                        <Link key={trip.id} href={`/trips/${trip.id}`} className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-900 hover:border-slate-300 hover:bg-slate-50">
                          {trip.title}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {followingTrips.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-slate-950">Next trips</h2>
              <div className="mt-3 grid gap-4 sm:grid-cols-3">
                {followingTrips.slice(0, 3).map((trip) => (
                  <Link key={trip.id} href={`/trips/${trip.id}`} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusColors[trip.status] ?? statusColors.planning}`}>{statusLabel(trip.status)}</span>
                    <h3 className="mt-3 truncate text-base font-semibold text-slate-950">{trip.title}</h3>
                    <p className="mt-1 truncate text-sm text-slate-500">{trip.destination}</p>
                    <p className="mt-2 text-sm text-slate-400">{formatDateRange(trip.startDate, trip.endDate)}</p>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </TravelShell>
  );
}
