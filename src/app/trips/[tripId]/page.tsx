import { notFound } from 'next/navigation';
import Link from 'next/link';
import { db, camelize, camelizeAll } from '@/db';
import { getServerUserId } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { ItineraryDocument } from '@/components/itinerary/ItineraryDocument';
import { TripWeather } from '@/components/itinerary/TripWeather';
import { PackingChecklist } from '@/components/itinerary/PackingChecklist';
import { TripHeaderActions } from '@/components/trips/TripHeaderActions';
import { Trip, TripDay, TripEvent, PackingItem, TripFlight, TripHotel, TripParking, TripRentalCar, TripTransit } from '@/types/travel';

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

  function formatDateRange(start: string, end: string) {
    const s = new Date(start + 'T00:00:00');
    const e = new Date(end + 'T00:00:00');
    return `${s.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="bg-white border-b border-stone-200 px-6 py-4 flex items-center justify-between no-print">
        <div className="flex items-center gap-4">
          <Link href="/trips" className="text-stone-400 hover:text-stone-700 text-sm">← Trips</Link>
          <div>
            <h1 className="text-xl font-serif font-bold text-stone-900">{trip.title}</h1>
            <p className="text-sm text-stone-500">{trip.destination} · {formatDateRange(trip.startDate, trip.endDate)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <TripHeaderActions trip={trip} />
          <Link href={`/trips/${tripId}/print`} target="_blank">
            <Button variant="outline" size="sm">Print / PDF</Button>
          </Link>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-10">
        <TripWeather tripId={tripId} />
        <ItineraryDocument
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
