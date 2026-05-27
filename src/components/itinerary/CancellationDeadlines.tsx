'use client';

import { TripHotel, TripEvent, TripFlight, TripRentalCar, TripParking, TripTransit } from '@/types/travel';
import { BrandLogo } from './BrandLogo';

interface CancellationDeadlinesProps {
  hotels: TripHotel[];
  events: TripEvent[];
  flights: TripFlight[];
  rentalCars: TripRentalCar[];
  parking: TripParking[];
  transit: TripTransit[];
}

interface CancelItem {
  key: string;
  icon: string;
  logoName: string | null;
  name: string;
  deadline: string | null;
  policy: string | null;
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function DeadlineBadge({ dateStr }: { dateStr: string }) {
  const days = daysUntil(dateStr);
  const label = days < 0 ? 'Passed' : days === 0 ? 'Today' : `${days}d left`;
  const color =
    days < 0
      ? 'bg-stone-100 text-stone-400'
      : days <= 3
      ? 'bg-red-100 text-red-700'
      : days <= 7
      ? 'bg-amber-100 text-amber-700'
      : 'bg-green-100 text-green-700';
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${color}`}>
      {label}
    </span>
  );
}

export function CancellationDeadlines({ hotels, events, flights, rentalCars, parking, transit }: CancellationDeadlinesProps) {
  const items: CancelItem[] = [
    ...hotels
      .filter((h) => h.cancellationDeadline || h.cancellationPolicy)
      .map((h) => ({
        key: h.id,
        icon: '🏨',
        logoName: h.name,
        name: h.name,
        deadline: h.cancellationDeadline,
        policy: h.cancellationPolicy,
      })),
    ...events
      .filter((e) => (e.cancellationDeadline || e.cancellationPolicy) && !e.cancellationPolicy?.toLowerCase().includes('non-refundable'))
      .map((e) => ({
        key: e.id,
        icon: '🎯',
        logoName: e.title,
        name: e.title,
        deadline: e.cancellationDeadline,
        policy: e.cancellationPolicy,
      })),
    ...flights
      .filter((f) => f.cancellationPolicy)
      .map((f) => ({
        key: f.id,
        icon: '✈️',
        logoName: f.airline,
        name: [f.airline, f.flightNumber].filter(Boolean).join(' ') || 'Flight',
        deadline: null,
        policy: f.cancellationPolicy,
      })),
    ...rentalCars
      .filter((c) => c.cancellationPolicy)
      .map((c) => ({
        key: c.id,
        icon: '🚗',
        logoName: c.company,
        name: c.company,
        deadline: null,
        policy: c.cancellationPolicy,
      })),
  ];

  const needsBooking: { key: string; icon: string; logoName: string | null; name: string }[] = [
    ...flights.filter((f) => f.bookingStatus === 'unbooked').map((f) => ({
      key: `flight-${f.id}`, icon: '✈️', logoName: f.airline,
      name: [f.airline, f.flightNumber].filter(Boolean).join(' ') || 'Flight',
    })),
    ...hotels.filter((h) => h.bookingStatus === 'unbooked').map((h) => ({
      key: `hotel-${h.id}`, icon: '🏨', logoName: h.name, name: h.name,
    })),
    ...rentalCars.filter((c) => c.bookingStatus === 'unbooked').map((c) => ({
      key: `car-${c.id}`, icon: '🚗', logoName: c.company, name: c.company,
    })),
    ...parking.filter((p) => p.bookingStatus === 'unbooked').map((p) => ({
      key: `parking-${p.id}`, icon: '🅿️', logoName: null, name: p.location,
    })),
    ...transit.filter((t) => t.bookingStatus === 'unbooked').map((t) => ({
      key: `transit-${t.id}`, icon: '🚆', logoName: null,
      name: [t.operator, t.routeNumber].filter(Boolean).join(' '),
    })),
    ...events.filter((e) => e.bookingStatus === 'unbooked' && e.category !== 'note').map((e) => ({
      key: `event-${e.id}`, icon: '🎯', logoName: e.title, name: e.title,
    })),
  ];

  if (items.length === 0 && needsBooking.length === 0) return null;

  const sorted = [...items].sort((a, b) => {
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return 0;
  });

  return (
    <div className="space-y-6 mb-8">
      {needsBooking.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-stone-600 mb-2">Needs Booking</h2>
          <div className="rounded-xl border border-red-100 divide-y divide-red-50 overflow-hidden">
            {needsBooking.map((item) => (
              <div key={item.key} className="flex items-center gap-3 px-4 py-2.5 bg-red-50">
                <BrandLogo name={item.logoName} fallback={item.icon} heightClass="h-5" />
                <span className="text-sm text-stone-800">{item.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {sorted.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-stone-600 mb-2">Cancellation Deadlines</h2>
          <div className="rounded-xl border border-stone-200 divide-y divide-stone-100 overflow-hidden">
            {sorted.map((item) => (
              <div key={item.key} className="flex items-start gap-3 px-4 py-3 bg-white">
                <BrandLogo name={item.logoName} fallback={item.icon} heightClass="h-5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-stone-800">{item.name}</span>
                    {item.deadline && <DeadlineBadge dateStr={item.deadline} />}
                  </div>
                  {item.deadline && (
                    <p className="text-xs text-stone-500 mt-0.5">
                      Cancel by{' '}
                      {new Date(item.deadline + 'T00:00:00').toLocaleDateString('en-US', {
                        month: 'long', day: 'numeric', year: 'numeric',
                      })}
                    </p>
                  )}
                  {item.policy && (
                    <p className="text-xs text-stone-400 mt-0.5">{item.policy}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
