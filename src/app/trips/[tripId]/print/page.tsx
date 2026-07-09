import { notFound } from 'next/navigation';
import { db, camelize, camelizeAll } from '@/db';
import { getServerUserId } from '@/lib/auth';
import { TripDay, TripEvent, TripFlight, TripHotel, TripParking, TripRentalCar, TripTransit, BookingStatus, PackingCategory, PackingItem } from '@/types/travel';
import { PrintTrigger } from './PrintTrigger';

const eventIcons: Record<string, string> = {
  flight: '✈', hotel: '🏨', restaurant: '🍽', activity: '🎯', transport: '🚗', parking: '🅿️', note: '📝',
};

const statusLabels: Record<BookingStatus, string> = {
  confirmed: 'Confirmed', pending: 'Pending', unbooked: 'Needs Booking',
};

function fmt12(time: string | null | undefined) {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatDateRange(start: string, end: string) {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  return `${s.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
}

export default async function PrintPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const userId = await getServerUserId();

  const tripRow = db.prepare('SELECT * FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId) as Record<string, unknown> | undefined;
  if (!tripRow) notFound();
  const trip = camelize<{ id: string; title: string; destination: string; startDate: string; endDate: string }>(tripRow);

  const days = camelizeAll<TripDay>(db.prepare('SELECT * FROM trip_days WHERE trip_id = ? ORDER BY day_number ASC').all(tripId) as Record<string, unknown>[]);
  const events = camelizeAll<TripEvent>(db.prepare('SELECT * FROM trip_events WHERE trip_id = ? ORDER BY sort_order ASC').all(tripId) as Record<string, unknown>[]);
  const flights = camelizeAll<TripFlight>(db.prepare('SELECT * FROM trip_flights WHERE trip_id = ? ORDER BY departure_date ASC, departure_time ASC').all(tripId) as Record<string, unknown>[]);
  const hotels = camelizeAll<TripHotel>(db.prepare('SELECT * FROM trip_hotels WHERE trip_id = ? ORDER BY check_in_date ASC').all(tripId) as Record<string, unknown>[]);
  const parking = camelizeAll<TripParking>(db.prepare('SELECT * FROM trip_parking WHERE trip_id = ? ORDER BY start_date ASC').all(tripId) as Record<string, unknown>[]);
  const rentalCars = camelizeAll<TripRentalCar>(db.prepare('SELECT * FROM trip_rental_cars WHERE trip_id = ? ORDER BY pickup_date ASC').all(tripId) as Record<string, unknown>[]);
  const transit = camelizeAll<TripTransit>(db.prepare('SELECT * FROM trip_transit WHERE trip_id = ? ORDER BY departure_date ASC').all(tripId) as Record<string, unknown>[]);
  const packing = camelizeAll<PackingItem>(db.prepare('SELECT * FROM packing_items WHERE trip_id = ? ORDER BY sort_order ASC').all(tripId) as Record<string, unknown>[]);

  const packingByCategory = packing.reduce<Partial<Record<PackingCategory, PackingItem[]>>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category]!.push(item);
    return acc;
  }, {});
  const packingCategoryOrder: PackingCategory[] = ['Documents & Essentials', 'Clothing', 'Tech & Apps', 'Health & Comfort'];

  // Per-day booking helpers (mirrors ItineraryDocument logic)
  function flightsForDay(date: string) {
    const items: { flight: TripFlight; role: 'departure' | 'arrival' | 'return-departure' | 'return-arrival' }[] = [];
    for (const f of flights) {
      if (f.departureDate === date) items.push({ flight: f, role: 'departure' });
      const effArrDate = f.arrivalDate ?? (f.arrivalTime ? f.departureDate : null);
      if (f.arrivalTime && effArrDate === date) items.push({ flight: f, role: 'arrival' });
      if (f.tripType === 'round-trip') {
        if (f.returnDepartureDate === date) items.push({ flight: f, role: 'return-departure' });
        const effRetArrDate = f.returnArrivalDate ?? (f.returnArrivalTime ? f.returnDepartureDate : null);
        if (f.returnArrivalTime && effRetArrDate === date) items.push({ flight: f, role: 'return-arrival' });
      }
    }
    return items;
  }

  function hotelsForDay(date: string) {
    const items: { hotel: TripHotel; role: 'checkin' | 'checkout' }[] = [];
    for (const h of hotels) {
      if (h.checkInDate === date) items.push({ hotel: h, role: 'checkin' });
      if (h.checkOutDate === date) items.push({ hotel: h, role: 'checkout' });
    }
    return items;
  }

  function parkingForDay(date: string) {
    const items: { parking: TripParking; role: 'dropoff' | 'pickup' }[] = [];
    for (const p of parking) {
      if (p.startDate === date) items.push({ parking: p, role: 'dropoff' });
      if (p.endDate && p.endDate !== p.startDate && p.endDate === date) items.push({ parking: p, role: 'pickup' });
    }
    return items;
  }

  function rentalCarsForDay(date: string) {
    const items: { rentalCar: TripRentalCar; role: 'pickup' | 'dropoff' }[] = [];
    for (const c of rentalCars) {
      if (c.pickupDate === date) items.push({ rentalCar: c, role: 'pickup' });
      if (c.dropoffDate && c.dropoffDate !== c.pickupDate && c.dropoffDate === date) items.push({ rentalCar: c, role: 'dropoff' });
    }
    return items;
  }

  function transitForDay(date: string) {
    return transit.filter((t) => t.departureDate === date);
  }

  type PrintItem =
    | { kind: 'event'; time: string | null; event: TripEvent }
    | { kind: 'flight'; time: string | null; flight: TripFlight; role: string }
    | { kind: 'hotel'; time: string | null; hotel: TripHotel; role: string }
    | { kind: 'parking'; time: string | null; parking: TripParking; role: string }
    | { kind: 'rentalCar'; time: string | null; rentalCar: TripRentalCar; role: string }
    | { kind: 'transit'; time: string | null; transit: TripTransit };

  function buildDayItems(day: TripDay): PrintItem[] {
    const date = day.date;
    const dayEvents = events
      .filter((e) => e.tripDayId === day.id)
      .sort((a, b) => {
        if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
        return a.sortOrder - b.sortOrder;
      });

    const items: PrintItem[] = [
      ...dayEvents.map((e) => ({ kind: 'event' as const, time: e.startTime, event: e })),
      ...flightsForDay(date).map(({ flight, role }) => {
        let time: string | null | undefined = null;
        if (role === 'departure') time = flight.departureTime;
        else if (role === 'arrival') time = flight.arrivalTime;
        else if (role === 'return-departure') time = flight.returnDepartureTime;
        else if (role === 'return-arrival') time = flight.returnArrivalTime;
        return { kind: 'flight' as const, time: time ?? null, flight, role };
      }),
      ...hotelsForDay(date).map(({ hotel, role }) => ({
        kind: 'hotel' as const,
        time: (role === 'checkin' ? hotel.checkInTime : hotel.checkOutTime) ?? null,
        hotel,
        role,
      })),
      ...parkingForDay(date).map(({ parking: p, role }) => {
        const raw = (role === 'dropoff' ? p.startTime : p.endTime) ?? null;
        return { kind: 'parking' as const, time: raw === '00:00' ? null : raw, parking: p, role };
      }),
      ...rentalCarsForDay(date).map(({ rentalCar, role }) => ({
        kind: 'rentalCar' as const,
        time: (role === 'pickup' ? rentalCar.pickupTime : rentalCar.dropoffTime) ?? null,
        rentalCar,
        role,
      })),
      ...transitForDay(date).map((t) => ({
        kind: 'transit' as const,
        time: t.departureTime ?? null,
        transit: t,
      })),
    ];

    return items.sort((a, b) => {
      if (a.time && b.time) return a.time.localeCompare(b.time);
      if (a.time) return -1;
      if (b.time) return 1;
      return 0;
    });
  }

  return (
    <div className="print-layout bg-white min-h-screen p-8 max-w-4xl mx-auto">
      <PrintTrigger />

      {/* Trip header */}
      <div className="mb-10 pb-8 border-b-2 border-stone-200">
        <h1 className="text-5xl font-serif font-bold text-stone-900">{trip.title}</h1>
        <p className="text-2xl text-stone-500 mt-2">{trip.destination}</p>
        <p className="text-stone-400 mt-1">{formatDateRange(trip.startDate, trip.endDate)}</p>
      </div>

      {/* Key Bookings Summary */}
      {(flights.length > 0 || hotels.length > 0) && (
        <div className="mb-10 pb-8 border-b border-stone-200">
          <h2 className="text-xl font-serif font-bold text-stone-900 mb-4">Key Bookings</h2>
          <div className="grid grid-cols-1 gap-3">
            {flights.map((f) => (
              <div key={f.id} className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                <span className="text-lg shrink-0">✈</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-stone-900 text-sm">
                    {[f.airline, f.flightNumber].filter(Boolean).join(' ') || 'Flight'}
                    {f.tripType === 'round-trip' && <span className="text-xs font-normal text-stone-500 ml-2">Round-trip</span>}
                  </p>
                  {(f.departureAirport || f.arrivalAirport) && (
                    <p className="text-xs text-stone-600">{f.departureAirport} → {f.arrivalAirport}</p>
                  )}
                  {f.departureDate && (
                    <p className="text-xs text-stone-500">
                      Departs {new Date(f.departureDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {f.departureTime && ` at ${fmt12(f.departureTime)}`}
                    </p>
                  )}
                  {f.tripType === 'round-trip' && f.returnDepartureDate && (
                    <p className="text-xs text-stone-500">
                      Returns {new Date(f.returnDepartureDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {f.returnDepartureTime && ` at ${fmt12(f.returnDepartureTime)}`}
                    </p>
                  )}
                  {f.confirmationNumber && <p className="text-xs text-stone-400">Conf: {f.confirmationNumber}</p>}
                  {f.seats && <p className="text-xs text-stone-400">Seats: {f.seats}</p>}
                </div>
                <span className="text-xs font-medium text-stone-500 shrink-0">{statusLabels[f.bookingStatus as BookingStatus]}</span>
              </div>
            ))}
            {hotels.map((h) => (
              <div key={h.id} className="flex items-start gap-3 p-3 bg-amber-50 rounded-lg border border-amber-100">
                <span className="text-lg shrink-0">🏨</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-stone-900 text-sm">{h.name}</p>
                  {h.address && <p className="text-xs text-stone-600">{h.address}</p>}
                  {(h.checkInDate || h.checkOutDate) && (
                    <p className="text-xs text-stone-500">
                      {h.checkInDate && `Check-in ${new Date(h.checkInDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                      {h.checkOutDate && ` · Check-out ${new Date(h.checkOutDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                    </p>
                  )}
                  {h.confirmationNumber && <p className="text-xs text-stone-400">Conf: {h.confirmationNumber}</p>}
                  {h.roomType && <p className="text-xs text-stone-400">Room: {h.roomType}</p>}
                </div>
                <span className="text-xs font-medium text-stone-500 shrink-0">{statusLabels[h.bookingStatus as BookingStatus]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Day-by-day itinerary */}
      {days.map((day) => {
        const items = buildDayItems(day);
        return (
          <div key={day.id} className="day-section mb-10">
            <div className="mb-4">
              <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Day {day.dayNumber}</span>
              <h2 className="text-3xl font-serif font-bold text-stone-900">
                {new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </h2>
              {day.title && <p className="text-stone-600 font-medium">{day.title}</p>}
              {day.notes && <p className="text-sm text-stone-500 whitespace-pre-wrap mt-0.5">{day.notes}</p>}
            </div>

            <div className="ml-2 pl-4 border-l-2 border-stone-200 space-y-3">
              {items.map((item, i) => {
                if (item.kind === 'event') {
                  const event = item.event;
                  return (
                    <div key={event.id} className="event-card bg-stone-50 rounded-lg p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-2">
                          <span>{eventIcons[event.category] ?? '📌'}</span>
                          <div>
                            <p className="font-semibold text-stone-900">{event.title}</p>
                            {event.location && <p className="text-sm text-stone-500">{event.location}</p>}
                            {event.confirmationNumber && <p className="text-xs text-stone-400">Conf: {event.confirmationNumber}</p>}
                            {(event.vendor || event.orderNumber) && (
                              <p className="text-xs text-stone-400">
                                {[event.vendor, event.orderNumber ? `#${event.orderNumber}` : null].filter(Boolean).join(' · ')}
                              </p>
                            )}
                            {event.seatInfo && <p className="text-xs text-stone-400">Seats: {event.seatInfo}</p>}
                            {event.cancellationDeadline && (
                              <p className="text-xs text-stone-400">
                                Cancel by {new Date(event.cancellationDeadline + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                {event.cancellationPolicy ? ` · ${event.cancellationPolicy}` : ''}
                              </p>
                            )}
                            {!event.cancellationDeadline && event.cancellationPolicy && <p className="text-xs text-stone-400">{event.cancellationPolicy}</p>}
                            {event.notes && <p className="text-sm text-stone-500 mt-1">{event.notes}</p>}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          {event.startTime && <p className="text-sm font-mono text-stone-500">{fmt12(event.startTime)}</p>}
                          <p className="text-xs mt-1">{statusLabels[event.bookingStatus as BookingStatus]}</p>
                          {event.cost != null && <p className="text-xs text-stone-400">{event.currency ?? 'USD'} {Number(event.cost).toFixed(2)}</p>}
                        </div>
                      </div>
                    </div>
                  );
                }

                if (item.kind === 'flight') {
                  const f = item.flight;
                  const role = item.role;
                  const isReturn = role === 'return-departure' || role === 'return-arrival';
                  const isDep = role === 'departure' || role === 'return-departure';
                  const label = isDep ? (isReturn ? 'Return departs' : 'Departs') : (isReturn ? 'Return arrives' : 'Arrives');
                  const flightNum = isReturn ? f.returnFlightNumber : f.flightNumber;
                  const route = isDep
                    ? `${isReturn ? f.arrivalAirport : f.departureAirport} → ${isReturn ? f.departureAirport : f.arrivalAirport}`
                    : `${f.departureAirport} → ${f.arrivalAirport}`;
                  return (
                    <div key={`flight-${f.id}-${role}-${i}`} className="event-card bg-blue-50 rounded-lg p-3 border border-blue-100">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold text-stone-900 text-sm">
                            ✈ {[f.airline, flightNum].filter(Boolean).join(' ')}
                            {route.trim() && <span className="text-stone-500 font-normal ml-1.5 text-xs">{route}</span>}
                          </p>
                          <p className="text-xs text-blue-700">{label}</p>
                          {f.seats && !isReturn && <p className="text-xs text-stone-400">Seats: {f.seats}</p>}
                          {isReturn && f.returnSeats && <p className="text-xs text-stone-400">Seats: {f.returnSeats}</p>}
                          {f.confirmationNumber && !isReturn && <p className="text-xs text-stone-400">Conf: {f.confirmationNumber}</p>}
                        </div>
                        {item.time && <p className="text-sm font-semibold text-stone-700 shrink-0">{fmt12(item.time)}</p>}
                      </div>
                    </div>
                  );
                }

                if (item.kind === 'hotel') {
                  const h = item.hotel;
                  const isIn = item.role === 'checkin';
                  return (
                    <div key={`hotel-${h.id}-${item.role}-${i}`} className="event-card bg-amber-50 rounded-lg p-3 border border-amber-100">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold text-stone-900 text-sm">🏨 {h.name}</p>
                          <p className="text-xs text-amber-700">{isIn ? 'Check-in' : 'Check-out'}</p>
                          {h.address && <p className="text-xs text-stone-500">{h.address}</p>}
                          {h.confirmationNumber && <p className="text-xs text-stone-400">Conf: {h.confirmationNumber}</p>}
                          {isIn && h.roomType && <p className="text-xs text-stone-400">Room: {h.roomType}</p>}
                        </div>
                        {item.time && <p className="text-sm font-semibold text-stone-700 shrink-0">{fmt12(item.time)}</p>}
                      </div>
                    </div>
                  );
                }

                if (item.kind === 'parking') {
                  const p = item.parking;
                  const isDropoff = item.role === 'dropoff';
                  return (
                    <div key={`parking-${p.id}-${item.role}-${i}`} className="event-card bg-slate-50 rounded-lg p-3 border border-slate-200">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold text-stone-900 text-sm">🅿️ {p.location}</p>
                          <p className="text-xs text-slate-600">{isDropoff ? 'Drop-off' : 'Pick-up'}</p>
                          {p.level && <p className="text-xs text-stone-400">{p.level}</p>}
                          {p.confirmationNumber && <p className="text-xs text-stone-400">Conf: {p.confirmationNumber}</p>}
                        </div>
                        {item.time && <p className="text-sm font-semibold text-stone-700 shrink-0">{fmt12(item.time)}</p>}
                      </div>
                    </div>
                  );
                }

                if (item.kind === 'rentalCar') {
                  const c = item.rentalCar;
                  const isPickup = item.role === 'pickup';
                  return (
                    <div key={`rental-${c.id}-${item.role}-${i}`} className="event-card bg-slate-50 rounded-lg p-3 border border-slate-200">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold text-stone-900 text-sm">🚗 {c.company}</p>
                          <p className="text-xs text-slate-600">{isPickup ? 'Pick-up' : 'Drop-off'}{isPickup && c.pickupLocation ? ` · ${c.pickupLocation}` : !isPickup && c.dropoffLocation ? ` · ${c.dropoffLocation}` : ''}</p>
                          {c.confirmationNumber && <p className="text-xs text-stone-400">Conf: {c.confirmationNumber}</p>}
                        </div>
                        {item.time && <p className="text-sm font-semibold text-stone-700 shrink-0">{fmt12(item.time)}</p>}
                      </div>
                    </div>
                  );
                }

                if (item.kind === 'transit') {
                  const t = item.transit;
                  return (
                    <div key={`transit-${t.id}-${i}`} className="event-card bg-stone-50 rounded-lg p-3 border border-stone-200">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold text-stone-900 text-sm">🚆 {[t.operator, t.routeNumber].filter(Boolean).join(' ')}</p>
                          {(t.fromLocation || t.toLocation) && (
                            <p className="text-xs text-stone-500">{t.fromLocation}{t.toLocation ? ` → ${t.toLocation}` : ''}</p>
                          )}
                          {t.confirmationNumber && <p className="text-xs text-stone-400">Conf: {t.confirmationNumber}</p>}
                        </div>
                        {item.time && <p className="text-sm font-semibold text-stone-700 shrink-0">{fmt12(item.time)}</p>}
                      </div>
                    </div>
                  );
                }

                return null;
              })}
              {items.length === 0 && (
                <p className="text-stone-400 text-sm py-2">No events planned.</p>
              )}
            </div>
          </div>
        );
      })}

      {/* Packing checklist */}
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
