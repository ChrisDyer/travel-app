'use client';

import { useState } from 'react';
import { Trip, TripDay, TripEvent, TripFlight, TripHotel, TripParking, TripRentalCar, TripTransit, PackingItem } from '@/types/travel';
import { DaySection } from './DaySection';
import { EventForm } from './EventForm';
import { KeyBookings } from './KeyBookings';
import { TripMap, MapLocation } from './TripMap';
import { CancellationDeadlines } from './CancellationDeadlines';
import { FlightForm } from './FlightForm';
import { HotelForm } from './HotelForm';
import { ParkingForm } from './ParkingForm';
import { RentalCarForm } from './RentalCarForm';
import { TransitForm } from './TransitForm';
import { PackingChecklist } from './PackingChecklist';
import { TripCostSummary } from './TripCostSummary';
import { TripAssistant } from '@/components/trips/TripAssistant';

interface ItineraryDocumentProps {
  trip: Trip;
  initialDays: TripDay[];
  initialEvents: TripEvent[];
  initialFlights: TripFlight[];
  initialHotels: TripHotel[];
  initialParking: TripParking[];
  initialRentalCars: TripRentalCar[];
  initialTransit: TripTransit[];
  initialPackingItems: PackingItem[];
}

export function ItineraryDocument({ trip, initialDays, initialEvents, initialFlights, initialHotels, initialParking, initialRentalCars, initialTransit, initialPackingItems }: ItineraryDocumentProps) {
  const [days, setDays] = useState<TripDay[]>(initialDays);
  const [events, setEvents] = useState<TripEvent[]>(initialEvents);
  const [flights, setFlights] = useState<TripFlight[]>(initialFlights);
  const [hotels, setHotels] = useState<TripHotel[]>(initialHotels);
  const [parking, setParking] = useState<TripParking[]>(initialParking);
  const [rentalCars, setRentalCars] = useState<TripRentalCar[]>(initialRentalCars);
  const [transit, setTransit] = useState<TripTransit[]>(initialTransit);
  const [editingEvent, setEditingEvent] = useState<TripEvent | null>(null);
  const [addingToDay, setAddingToDay] = useState<TripDay | null>(null);
  const [editingFlight, setEditingFlight] = useState<TripFlight | null>(null);
  const [editingHotel, setEditingHotel] = useState<TripHotel | null>(null);
  const [editingParking, setEditingParking] = useState<TripParking | null>(null);
  const [editingRentalCar, setEditingRentalCar] = useState<TripRentalCar | null>(null);
  const [editingTransit, setEditingTransit] = useState<TripTransit | null>(null);
  const [selectedDay, setSelectedDay] = useState<TripDay | null>(null);

  function handleDayTitleChanged(dayId: string, title: string | null) {
    setDays((prev) => prev.map((d) => d.id === dayId ? { ...d, title } : d));
  }

  function handleDayNotesChanged(dayId: string, notes: string | null) {
    setDays((prev) => prev.map((d) => d.id === dayId ? { ...d, notes } : d));
  }

  async function reorderEvent(dayId: string, eventId: string, direction: 'up' | 'down') {
    // Untimed events for this day in current display order
    const untimed = events
      .filter((e) => e.tripDayId === dayId && !e.startTime)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = untimed.findIndex((e) => e.id === eventId);
    const swapWith = direction === 'up' ? idx - 1 : idx + 1;
    if (idx === -1 || swapWith < 0 || swapWith >= untimed.length) return;

    const a = untimed[idx], b = untimed[swapWith];
    // Ensure distinct sort orders even if both are 0 (legacy rows default to 0)
    const aOrder = b.sortOrder === a.sortOrder ? a.sortOrder + (direction === 'up' ? -1 : 1) : b.sortOrder;
    const bOrder = a.sortOrder;

    const prevEvents = events;
    setEvents((prev) => prev.map((e) =>
      e.id === a.id ? { ...e, sortOrder: aOrder } : e.id === b.id ? { ...e, sortOrder: bOrder } : e
    ));
    try {
      const r1 = await fetch(`/api/trips/${trip.id}/events/${a.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sortOrder: aOrder }),
      });
      const r2 = await fetch(`/api/trips/${trip.id}/events/${b.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sortOrder: bOrder }),
      });
      if (!r1.ok || !r2.ok) throw new Error();
    } catch {
      setEvents(prevEvents); // roll back optimistic move
      window.alert('Could not reorder. Please try again.');
    }
  }

  function handleEventSaved(event: TripEvent, isNew: boolean) {
    setEvents((prev) => isNew ? [...prev, event] : prev.map((e) => e.id === event.id ? event : e));
    setEditingEvent(null);
    setAddingToDay(null);
  }

  function handleEventDeleted(eventId: string) {
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
    setEditingEvent(null);
  }

  const eventsForDay = (dayId: string) =>
    events
      .filter((e) => e.tripDayId === dayId)
      .sort((a, b) => {
        if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
        return a.sortOrder - b.sortOrder;
      });

  function flightsForDay(date: string) {
    const items: { flight: TripFlight; role: 'departure' | 'arrival' | 'return-departure' | 'return-arrival' }[] = [];
    for (const f of flights) {
      if (f.departureDate === date) items.push({ flight: f, role: 'departure' });
      // Arrival: show on arrivalDate if set, otherwise fall back to departureDate when arrivalTime exists
      const effectiveArrDate = f.arrivalDate ?? (f.arrivalTime ? f.departureDate : null);
      if (f.arrivalTime && effectiveArrDate === date) {
        items.push({ flight: f, role: 'arrival' });
      }
      if (f.tripType === 'round-trip') {
        if (f.returnDepartureDate === date) items.push({ flight: f, role: 'return-departure' });
        const effectiveRetArrDate = f.returnArrivalDate ?? (f.returnArrivalTime ? f.returnDepartureDate : null);
        if (f.returnArrivalTime && effectiveRetArrDate === date) {
          items.push({ flight: f, role: 'return-arrival' });
        }
      }
    }
    return items;
  }

  function parkingForDay(date: string) {
    const items: { parking: TripParking; role: 'dropoff' | 'pickup' }[] = [];
    for (const p of parking) {
      if (p.startDate === date) items.push({ parking: p, role: 'dropoff' });
      if (p.endDate && p.endDate !== p.startDate && p.endDate === date) {
        items.push({ parking: p, role: 'pickup' });
      }
    }
    return items;
  }

  function rentalCarsForDay(date: string) {
    const items: { rentalCar: TripRentalCar; role: 'pickup' | 'dropoff' }[] = [];
    for (const c of rentalCars) {
      if (c.pickupDate === date) items.push({ rentalCar: c, role: 'pickup' });
      if (c.dropoffDate && c.dropoffDate !== c.pickupDate && c.dropoffDate === date) {
        items.push({ rentalCar: c, role: 'dropoff' });
      }
    }
    return items;
  }

  function transitForDay(date: string) {
    return transit.filter((t) => t.departureDate === date);
  }

  function hotelsForDay(date: string) {
    const items: { hotel: TripHotel; role: 'checkin' | 'checkout' }[] = [];
    for (const h of hotels) {
      if (h.checkInDate === date) items.push({ hotel: h, role: 'checkin' });
      if (h.checkOutDate === date) items.push({ hotel: h, role: 'checkout' });
    }
    return items;
  }

  // The home airport is the departure of the first (earliest) flight — never show its parking on the map.
  const firstFlight = [...flights]
    .filter((f) => f.departureDate && f.departureAirport)
    .sort((a, b) => a.departureDate!.localeCompare(b.departureDate!))[0];
  const homeAirportCode = firstFlight?.departureAirport
    ? (firstFlight.departureAirport.match(/\(([A-Z]{3})\)/i)?.[1]?.toUpperCase() ?? firstFlight.departureAirport.toUpperCase())
    : null;
  function isDepartureAirportParking(location: string): boolean {
    if (!homeAirportCode) return false;
    const match = location.match(/\(([A-Z]{3})\)/);
    return match ? match[1] === homeAirportCode : false;
  }

  const mapLocations: MapLocation[] = [
    ...hotels.filter((h) => h.address).map((h) => ({ title: h.name, address: h.address!, type: 'hotel' as const })),
    ...parking.filter((p) => p.address && !isDepartureAirportParking(p.location)).map((p) => ({ title: p.location, address: p.address!, type: 'parking' as const })),
    ...events.filter((e) => e.location).map((e) => ({ title: e.title, address: e.location!, type: 'event' as const })),
    ...rentalCars.filter((c) => c.pickupLocation).map((c) => ({ title: `${c.company} Pick-up`, address: c.pickupLocation!, type: 'rental' as const })),
  ];

  function getActiveMapLocations(date: string): MapLocation[] {
    return [
      ...hotels
        .filter((h) => h.address && h.checkInDate && date >= h.checkInDate && (!h.checkOutDate || date < h.checkOutDate))
        .map((h) => ({ title: h.name, address: h.address!, type: 'hotel' as const })),
      ...parking
        .filter((p) => p.address && !isDepartureAirportParking(p.location) && p.startDate && date >= p.startDate && date <= (p.endDate ?? p.startDate))
        .map((p) => ({ title: p.location, address: p.address!, type: 'parking' as const })),
      ...events
        .filter((e) => e.location && days.find((d) => d.id === e.tripDayId)?.date === date)
        .map((e) => ({ title: e.title, address: e.location!, type: 'event' as const })),
      ...rentalCars
        .filter((c) => c.pickupLocation && c.pickupDate && date >= c.pickupDate && (!c.dropoffDate || date <= c.dropoffDate))
        .map((c) => ({ title: `${c.company} Pick-up`, address: c.pickupLocation!, type: 'rental' as const })),
    ];
  }

  return (
    <>
      <TripAssistant
        tripId={trip.id}
        days={days}
        onEventsAdded={(newEvents) => setEvents((prev) => [...prev, ...newEvents])}
        onFlightsAdded={(newFlights) => setFlights((prev) => [...prev, ...newFlights])}
        onHotelsAdded={(newHotels) => setHotels((prev) => [...prev, ...newHotels])}
        onRentalCarsAdded={(newCars) => setRentalCars((prev) => [...prev, ...newCars])}
        onParkingAdded={(newParking) => setParking((prev) => [...prev, ...newParking])}
        onTransitAdded={(newTransit) => setTransit((prev) => [...prev, ...newTransit])}
      />

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-[640px_1fr] gap-8 items-start">
        {/* Left column: map + bookings + cancellations */}
        <div className="lg:sticky lg:top-8">
          <TripMap
            locations={mapLocations}
            activeLocations={selectedDay ? getActiveMapLocations(selectedDay.date) : undefined}
            selectedDate={selectedDay?.date}
            onClear={() => setSelectedDay(null)}
          />

          <KeyBookings
            tripId={trip.id}
            travelMode={trip.travelMode}
            rentalCarNeeded={trip.rentalCarNeeded}
            flights={flights}
            hotels={hotels}
            parking={parking}
            rentalCars={rentalCars}
            transit={transit}
            onFlightsChange={setFlights}
            onHotelsChange={setHotels}
            onParkingChange={setParking}
            onRentalCarsChange={setRentalCars}
            onTransitChange={setTransit}
          />

          <CancellationDeadlines
            hotels={hotels}
            events={events}
            flights={flights}
            rentalCars={rentalCars}
            parking={parking}
            transit={transit}
          />

          <TripCostSummary
            trip={trip}
            events={events}
            flights={flights}
            hotels={hotels}
            parking={parking}
            rentalCars={rentalCars}
            transit={transit}
          />
        </div>

        {/* Right column: daily itinerary */}
        <div className="space-y-12">
          {days.map((day) => (
            <DaySection
              key={day.id}
              day={day}
              events={eventsForDay(day.id)}
              dayFlights={flightsForDay(day.date)}
              dayHotels={hotelsForDay(day.date)}
              dayParking={parkingForDay(day.date)}
              dayRentalCars={rentalCarsForDay(day.date)}
              dayTransit={transitForDay(day.date)}
              isSelected={selectedDay?.id === day.id}
              onSelectDay={(d) => setSelectedDay((prev) => prev?.id === d.id ? null : d)}
              onAddEvent={setAddingToDay}
              onEditEvent={setEditingEvent}
              onEditFlight={(f) => setEditingFlight(f)}
              onEditHotel={(h) => setEditingHotel(h)}
              onEditParking={(p) => setEditingParking(p)}
              onEditRentalCar={(c) => setEditingRentalCar(c)}
              onEditTransit={(t) => setEditingTransit(t)}
              onDayTitleChanged={handleDayTitleChanged}
              onDayNotesChanged={handleDayNotesChanged}
              onReorderEvent={(eventId, dir) => reorderEvent(day.id, eventId, dir)}
            />
          ))}
        </div>
      </div>

      {(editingEvent || addingToDay) && (
        <EventForm
          tripId={trip.id}
          day={addingToDay ?? (days.find((d) => d.id === editingEvent!.tripDayId) ?? days[0])}
          days={days}
          event={editingEvent}
          onSaved={handleEventSaved}
          onDeleted={handleEventDeleted}
          onClose={() => { setEditingEvent(null); setAddingToDay(null); }}
        />
      )}

      {editingFlight && (
        <FlightForm
          tripId={trip.id}
          flight={editingFlight}
          onSaved={(f, isNew) => {
            setFlights((prev) => isNew ? [...prev, f] : prev.map((x) => x.id === f.id ? f : x));
            setEditingFlight(null);
          }}
          onDeleted={(id) => { setFlights((prev) => prev.filter((x) => x.id !== id)); setEditingFlight(null); }}
          onClose={() => setEditingFlight(null)}
        />
      )}

      {editingHotel && (
        <HotelForm
          tripId={trip.id}
          hotel={editingHotel}
          onSaved={(h, isNew) => {
            setHotels((prev) => isNew ? [...prev, h] : prev.map((x) => x.id === h.id ? h : x));
            setEditingHotel(null);
          }}
          onDeleted={(id) => { setHotels((prev) => prev.filter((x) => x.id !== id)); setEditingHotel(null); }}
          onClose={() => setEditingHotel(null)}
        />
      )}

      {editingParking && (
        <ParkingForm
          tripId={trip.id}
          parking={editingParking}
          onSaved={(p, isNew) => {
            setParking((prev) => isNew ? [...prev, p] : prev.map((x) => x.id === p.id ? p : x));
            setEditingParking(null);
          }}
          onDeleted={(id) => { setParking((prev) => prev.filter((x) => x.id !== id)); setEditingParking(null); }}
          onClose={() => setEditingParking(null)}
        />
      )}

      {editingRentalCar && (
        <RentalCarForm
          tripId={trip.id}
          rentalCar={editingRentalCar}
          onSaved={(c, isNew) => {
            setRentalCars((prev) => isNew ? [...prev, c] : prev.map((x) => x.id === c.id ? c : x));
            setEditingRentalCar(null);
          }}
          onDeleted={(id) => { setRentalCars((prev) => prev.filter((x) => x.id !== id)); setEditingRentalCar(null); }}
          onClose={() => setEditingRentalCar(null)}
        />
      )}

      {editingTransit && (
        <TransitForm
          tripId={trip.id}
          transit={editingTransit}
          onSaved={(t, isNew) => {
            setTransit((prev) => isNew ? [...prev, t] : prev.map((x) => x.id === t.id ? t : x));
            setEditingTransit(null);
          }}
          onDeleted={(id) => { setTransit((prev) => prev.filter((x) => x.id !== id)); setEditingTransit(null); }}
          onClose={() => setEditingTransit(null)}
        />
      )}
    </>
  );
}
