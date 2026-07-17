import { notFound } from 'next/navigation';
import { db, camelize, camelizeAll } from '@/db';
import { getServerUserId } from '@/lib/auth';
import { ItineraryDocument } from '@/components/itinerary/ItineraryDocument';
import { TripWeather } from '@/components/itinerary/TripWeather';
import { TripHeaderActions } from '@/components/trips/TripHeaderActions';
import { TripStatusNudge } from '@/components/trips/TripStatusNudge';
import { TravelShell } from '@/appShell/TravelShell';
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

  const subtitle = `${trip.destination} - ${formatDateRange(trip.startDate, trip.endDate, 'long')}`;

  return (
    <TravelShell
      title={trip.title}
      subtitle={subtitle}
      backHref="/trips"
      backLabel="Trips"
      activeLocalNav="trips"
      actions={
        <>
          <span className={`hidden rounded-full px-2.5 py-1 text-xs font-medium capitalize sm:inline-flex ${statusColors[trip.status] ?? statusColors.planning}`}>
            {statusLabel(trip.status)}
          </span>
          <TripHeaderActions trip={trip} />
        </>
      }
    >
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
        <p className="py-16 text-center text-slate-400">No days in this trip yet.</p>
      )}
    </TravelShell>
  );
}
