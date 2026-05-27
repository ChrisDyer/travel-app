import { notFound } from 'next/navigation';
import { db, camelize, camelizeAll } from '@/db';
import { getServerUserId } from '@/lib/auth';
import { TripDay, TripEvent, BookingStatus, PackingCategory, PackingItem } from '@/types/travel';
import { PrintTrigger } from './PrintTrigger';

const categoryIcons: Record<string, string> = {
  flight: '✈', hotel: '🏨', restaurant: '🍽', activity: '🎯', transport: '🚗', parking: '🅿️', note: '📝',
};

const statusLabels: Record<BookingStatus, string> = {
  confirmed: 'Confirmed', pending: 'Pending', unbooked: 'Needs Booking',
};

export default async function PrintPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const userId = await getServerUserId();

  const tripRow = db.prepare('SELECT * FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId) as Record<string, unknown> | undefined;
  if (!tripRow) notFound();
  const trip = camelize<{ id: string; title: string; destination: string; startDate: string; endDate: string }>(tripRow);

  const days = camelizeAll<TripDay>(db.prepare('SELECT * FROM trip_days WHERE trip_id = ? ORDER BY day_number ASC').all(tripId) as Record<string, unknown>[]);
  const events = camelizeAll<TripEvent>(db.prepare('SELECT * FROM trip_events WHERE trip_id = ? ORDER BY sort_order ASC').all(tripId) as Record<string, unknown>[]);
  const packing = camelizeAll<PackingItem>(db.prepare('SELECT * FROM packing_items WHERE trip_id = ? ORDER BY sort_order ASC').all(tripId) as Record<string, unknown>[]);

  const packingByCategory = packing.reduce<Partial<Record<PackingCategory, PackingItem[]>>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category]!.push(item);
    return acc;
  }, {});

  const packingCategoryOrder: PackingCategory[] = ['Documents & Essentials', 'Clothing', 'Tech & Apps', 'Health & Comfort'];

  function formatDateRange(start: string, end: string) {
    const s = new Date(start + 'T00:00:00');
    const e = new Date(end + 'T00:00:00');
    return `${s.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
  }

  return (
    <div className="print-layout bg-white min-h-screen p-8 max-w-4xl mx-auto">
      <PrintTrigger />

      <div className="mb-12 pb-8 border-b-2 border-stone-200">
        <h1 className="text-5xl font-serif font-bold text-stone-900">{trip.title}</h1>
        <p className="text-2xl text-stone-500 mt-2">{trip.destination}</p>
        <p className="text-stone-400 mt-1">{formatDateRange(trip.startDate, trip.endDate)}</p>
      </div>

      {days.map((day) => {
        const dayEvents = events
          .filter((e) => e.tripDayId === day.id)
          .sort((a, b) => {
            if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
            return a.sortOrder - b.sortOrder;
          });

        return (
          <div key={day.id} className="day-section mb-10">
            <div className="mb-4">
              <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Day {day.dayNumber}</span>
              <h2 className="text-3xl font-serif font-bold text-stone-900">
                {new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </h2>
              {day.title && <p className="text-stone-600 font-medium">{day.title}</p>}
            </div>

            <div className="ml-2 pl-4 border-l-2 border-stone-200 space-y-3">
              {dayEvents.map((event) => (
                <div key={event.id} className="event-card bg-stone-50 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-2">
                      <span>{categoryIcons[event.category] ?? '📌'}</span>
                      <div>
                        <p className="font-semibold text-stone-900">{event.title}</p>
                        {event.location && <p className="text-sm text-stone-500">{event.location}</p>}
                        {event.confirmationNumber && (
                          <p className="text-xs text-stone-400">Conf: {event.confirmationNumber}</p>
                        )}
                        {(event.vendor || event.orderNumber) && (
                          <p className="text-xs text-stone-400">
                            {[event.vendor, event.orderNumber ? `#${event.orderNumber}` : null].filter(Boolean).join(' · ')}
                          </p>
                        )}
                        {event.seatInfo && (
                          <p className="text-xs text-stone-400">Seats: {event.seatInfo}</p>
                        )}
                        {event.cancellationDeadline && (
                          <p className="text-xs text-stone-400">
                            Cancel by {new Date(event.cancellationDeadline + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            {event.cancellationPolicy ? ` · ${event.cancellationPolicy}` : ''}
                          </p>
                        )}
                        {!event.cancellationDeadline && event.cancellationPolicy && (
                          <p className="text-xs text-stone-400">{event.cancellationPolicy}</p>
                        )}
                        {event.notes && <p className="text-sm text-stone-500 mt-1">{event.notes}</p>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {event.startTime && <p className="text-sm font-mono text-stone-500">{event.startTime}</p>}
                      <p className="text-xs mt-1">{statusLabels[event.bookingStatus as BookingStatus]}</p>
                      {event.cost != null && (
                        <p className="text-xs text-stone-400">{event.currency ?? 'USD'} {Number(event.cost).toFixed(2)}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {dayEvents.length === 0 && (
                <p className="text-stone-400 text-sm py-2">No events planned.</p>
              )}
            </div>
          </div>
        );
      })}
      {packing.length > 0 && (
        <div className="mt-12 pt-8 border-t-2 border-stone-200">
          <h2 className="text-3xl font-serif font-bold text-stone-900 mb-6">Packing Checklist</h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-6">
            {packingCategoryOrder.map((cat) => {
              const items = packingByCategory[cat];
              if (!items?.length) return null;
              return (
                <div key={cat}>
                  <h3 className="text-sm font-semibold text-stone-500 uppercase tracking-wider mb-2">{cat}</h3>
                  <ul className="space-y-1.5">
                    {items.map((pi) => (
                      <li key={pi.id} className="flex items-center gap-2 text-sm text-stone-700">
                        <span className="w-4 h-4 border border-stone-400 rounded-sm shrink-0 inline-block" />
                        {pi.item}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
