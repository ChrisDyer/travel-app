import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Home } from 'lucide-react';
import { db, camelize, camelizeAll } from '@/db';
import { getServerUserId } from '@/lib/auth';
import { ItineraryDocument } from '@/components/itinerary/ItineraryDocument';
import { TripWeather } from '@/components/itinerary/TripWeather';
import { PackingChecklist } from '@/components/itinerary/PackingChecklist';
import { TripHeaderActions } from '@/components/trips/TripHeaderActions';
import { TripStatusNudge } from '@/components/trips/TripStatusNudge';
import { Trip, TripDay, TripEvent, PackingItem, TripFlight, TripHotel, TripParking, TripRentalCar, TripTransit } from '@/types/travel';
import { statusColors, statusLabel } from '@/lib/trip-status';
import { formatDateRange } from '@/lib/dates';

export default async function TripPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const userId = await getServerUserId();

  const tripRow = db.prepare('SELECT * FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId) as Record<string, unknown> | undefined;
  if (!tripRow) notFound();
  const trip = camelize<Trip>(tripRow);

  const days = camelizeAll<TripDay>(db.prepare('SELECT * FROM trip_days WHERE trip_id = ? ORDER BY day_number ASC').all(tripId) as Record<string, unknown>[]);
  const events = camelizeAll<TripEvent>(db.prepare('SELECT * FROM trip_events WHERE trip_id = ? ORDER BY sort_order ASC').all(tripId) as Record<string, unknown>[]);
  const packing = camelizeAll<PackingItem>(db.prepare('SELECT * FROM packing_items WHERE trip_id = ? ORDER BY sort_order ASC').all(tripId) as Record<string, unknown>[]);
  const flights = camelizeAll<TripFlight>(db.prepare('SELECT * FROM trip_flights WHERE trip_id = ? ORDER BY departure_date ASC, departure_time ASC').all(tripId) as Record<string, unknown>[]);
  const hotels = camelizeAll<TripHotel>(db.prepare('SELECT * FROM trip_hotels WHERE trip_id = ? ORDER BY check_in_date ASC').all(tripId) as Record<string, unknown>[]);
  const parkingSpots = camelizeAll<TripParking>(db.prepare('SELECT * FROM trip_parking WHERE trip_id = ? ORDER BY start_date ASC, start_time ASC').all(tripId) as Record<string, unknown>[]);
  const rentalCars = camelizeAll<TripRentalCar>(db.prepare('SELECT * FROM trip_rental_cars WHERE trip_id = ? ORDER BY pickup_date ASC, pickup_time ASC').all(tripId) as Record<string, unknown>[]);
  const transitItems = camelizeAll<TripTransit>(db.prepare('SELECT * FROM trip_transit WHERE trip_id = ? ORDER BY departure_date ASC, departure_time ASC').all(tripId) as Record<string, unknown>[]);

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="bg-white border-b border-stone-200 px-6 py-4 max-sm:px-4 max-sm:py-3 flex items-center justify-between no-print">
        <div className="flex items-center gap-4 min-w-0">
          <a href="https://zo-bot.com" className="text-stone-400 hover:text-stone-700 transition-colors" title="zo-bot.com">
            <Home size={18} />
          </a>
          <Link href="/trips" className="text-stone-400 hover:text-stone-700 text-sm">← Trips</Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="min-w-0 text-xl font-serif font-bold text-stone-900 truncate">{trip.title}</h1>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${statusColors[trip.status] ?? statusColors.planning}`}>
                {statusLabel(trip.status)}
              </span>
            </div>
            <p className="text-sm text-stone-500">{trip.destination} · {formatDateRange(trip.startDate, trip.endDate, 'long')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <TripHeaderActions trip={trip} />
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-10">
        <TripStatusNudge trip={trip} />
        <TripWeather tripId={tripId} />
        <ItineraryDocument
          key={trip.updatedAt as string}
          trip={trip}
          initialDays={days}
          initialEvents={events}
          initialFlights={flights}
          initialHotels={hotels}
          initialParking={parkingSpots}
          initialRentalCars={rentalCars}
          initialTransit={transitItems}
          initialPackingItems={packing}
        />
        {days.length === 0 && (
          <p className="text-stone-400 text-center py-16">No days in this trip yet.</p>
        )}
      </main>
    </div>
  );
}
