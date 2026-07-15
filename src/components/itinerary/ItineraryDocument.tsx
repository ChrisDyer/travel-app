'use client';

import { useState } from 'react';
import { Trip, TripDay, TripEvent, TripFlight, TripHotel, TripParking, TripRentalCar, TripTransit, PackingItem } from '@/types/travel';
import { BookingKind, BookingRef } from './booking-selection';
import { AddPlanMenu } from './AddPlanMenu';
import { BookingDetailSheet } from './BookingDetailSheet';
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
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { apiUrl } from '@/lib/api';

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

const kindLabel: Record<BookingRef['kind'], string> = {
  flight: 'Flight', hotel: 'Hotel', parking: 'Parking', rentalCar: 'Rental car', transit: 'Transit', event: 'Event',
};

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
  const [selection, setSelection] = useState<BookingRef | null>(null);
  const [adding, setAdding] = useState<BookingKind | null>(null);
  const [mobileTab, setMobileTab] = useState<'itinerary' | 'bookings' | 'overview'>('itinerary');

  function handleAdd(kind: BookingKind) {
    if (kind === 'event') {
      setAddingToDay(selectedDay ?? days[0]);
    } else {
      setAdding(kind);
    }
  }

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
      const r1 = await fetch(apiUrl(`/api/trips/${trip.id}/events/${a.id}`), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sortOrder: aOrder }),
      });
      const r2 = await fetch(apiUrl(`/api/trips/${trip.id}/events/${b.id}`), {
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
    toast(isNew ? 'Event added' : 'Event saved');
  }

  function handleEventDeleted(eventId: string) {
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
    setEditingEvent(null);
    toast('Event deleted');
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

  const isEmpty = events.length === 0 && flights.length === 0 && hotels.length === 0
    && parking.length === 0 && rentalCars.length === 0 && transit.length === 0;

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

      <div className="lg:hidden no-print sticky top-0 z-20 -mx-4 px-4 py-2 bg-stone-50/95 backdrop-blur border-b border-stone-200 flex gap-1">
        {(
          [
            { key: 'itinerary', label: 'Itinerary' },
            { key: 'bookings', label: 'Bookings' },
            { key: 'overview', label: 'Overview' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setMobileTab(tab.key)}
            className={cn(
              'min-h-10 rounded-full text-xs font-medium px-3 py-1.5 transition-colors',
              mobileTab === tab.key ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-500'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-[640px_1fr] gap-8 items-start">
        {/* Left column: map + bookings + cancellations */}
        <div className="lg:sticky lg:top-8">
          <div className={cn(mobileTab !== 'overview' && 'max-lg:hidden', 'print:block')}>
            <TripMap
              locations={mapLocations}
              activeLocations={selectedDay ? getActiveMapLocations(selectedDay.date) : undefined}
              selectedDate={selectedDay?.date}
              onClear={() => setSelectedDay(null)}
            />
          </div>

          <div className={cn(mobileTab !== 'bookings' && 'max-lg:hidden', 'print:block')}>
            <KeyBookings
              travelMode={trip.travelMode}
              rentalCarNeeded={trip.rentalCarNeeded}
              flights={flights}
              hotels={hotels}
              parking={parking}
              rentalCars={rentalCars}
              transit={transit}
              onAdd={handleAdd}
              onSelect={(ref) => setSelection(ref)}
            />
          </div>

          <div className={cn(mobileTab !== 'overview' && 'max-lg:hidden', 'print:block')}>
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
        </div>

        {/* Right column: daily itinerary */}
        <div className={cn(mobileTab !== 'itinerary' && 'max-lg:hidden', 'print:block', 'space-y-12 max-lg:pb-24')}>
          <div className="flex justify-end">
            <AddPlanMenu onAdd={handleAdd} />
          </div>

          {isEmpty && (
            <div className="no-print rounded-xl border border-dashed border-stone-300 bg-white p-6 text-center">
              <p className="font-serif text-lg text-stone-700">Let&apos;s plan this trip ✈</p>
              <p className="text-sm text-stone-500 mt-1 max-w-md mx-auto">
                Use <strong>Add a plan</strong> to add flights, hotels, and more — or open the Trip Assistant and paste a confirmation email.
              </p>
            </div>
          )}
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
              onSelectItem={(ref) => setSelection(ref)}
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

      {(editingFlight || adding === 'flight') && (
        <FlightForm
          tripId={trip.id}
          flight={editingFlight}
          onSaved={(f, isNew) => {
            setFlights((prev) => isNew ? [...prev, f] : prev.map((x) => x.id === f.id ? f : x));
            setEditingFlight(null);
            setAdding(null);
            toast('Flight saved');
          }}
          onDeleted={(id) => { setFlights((prev) => prev.filter((x) => x.id !== id)); setEditingFlight(null); toast('Flight deleted'); }}
          onClose={() => { setEditingFlight(null); setAdding(null); }}
        />
      )}

      {(editingHotel || adding === 'hotel') && (
        <HotelForm
          tripId={trip.id}
          hotel={editingHotel}
          onSaved={(h, isNew) => {
            setHotels((prev) => isNew ? [...prev, h] : prev.map((x) => x.id === h.id ? h : x));
            setEditingHotel(null);
            setAdding(null);
            toast('Hotel saved');
          }}
          onDeleted={(id) => { setHotels((prev) => prev.filter((x) => x.id !== id)); setEditingHotel(null); toast('Hotel deleted'); }}
          onClose={() => { setEditingHotel(null); setAdding(null); }}
        />
      )}

      {(editingParking || adding === 'parking') && (
        <ParkingForm
          tripId={trip.id}
          parking={editingParking}
          onSaved={(p, isNew) => {
            setParking((prev) => isNew ? [...prev, p] : prev.map((x) => x.id === p.id ? p : x));
            setEditingParking(null);
            setAdding(null);
            toast('Parking saved');
          }}
          onDeleted={(id) => { setParking((prev) => prev.filter((x) => x.id !== id)); setEditingParking(null); toast('Parking deleted'); }}
          onClose={() => { setEditingParking(null); setAdding(null); }}
        />
      )}

      {(editingRentalCar || adding === 'rentalCar') && (
        <RentalCarForm
          tripId={trip.id}
          rentalCar={editingRentalCar}
          onSaved={(c, isNew) => {
            setRentalCars((prev) => isNew ? [...prev, c] : prev.map((x) => x.id === c.id ? c : x));
            setEditingRentalCar(null);
            setAdding(null);
            toast('Rental car saved');
          }}
          onDeleted={(id) => { setRentalCars((prev) => prev.filter((x) => x.id !== id)); setEditingRentalCar(null); toast('Rental car deleted'); }}
          onClose={() => { setEditingRentalCar(null); setAdding(null); }}
        />
      )}

      {(editingTransit || adding === 'transit') && (
        <TransitForm
          tripId={trip.id}
          transit={editingTransit}
          onSaved={(t, isNew) => {
            setTransit((prev) => isNew ? [...prev, t] : prev.map((x) => x.id === t.id ? t : x));
            setEditingTransit(null);
            setAdding(null);
            toast('Transit saved');
          }}
          onDeleted={(id) => { setTransit((prev) => prev.filter((x) => x.id !== id)); setEditingTransit(null); toast('Transit deleted'); }}
          onClose={() => { setEditingTransit(null); setAdding(null); }}
        />
      )}

      <BookingDetailSheet
        tripId={trip.id}
        selection={selection}
        flights={flights}
        hotels={hotels}
        parking={parking}
        rentalCars={rentalCars}
        transit={transit}
        events={events}
        days={days}
        onClose={() => setSelection(null)}
        onEdit={(ref) => {
          // Fallback from the documented "keep the drawer open" approach: nested
          // Dialog-over-Sheet let Esc close both layers at once instead of just the
          // form, so the drawer closes first and the form opens standalone.
          setSelection(null);
          if (ref.kind === 'flight') setEditingFlight(flights.find((f) => f.id === ref.id) ?? null);
          else if (ref.kind === 'hotel') setEditingHotel(hotels.find((h) => h.id === ref.id) ?? null);
          else if (ref.kind === 'parking') setEditingParking(parking.find((p) => p.id === ref.id) ?? null);
          else if (ref.kind === 'rentalCar') setEditingRentalCar(rentalCars.find((c) => c.id === ref.id) ?? null);
          else if (ref.kind === 'transit') setEditingTransit(transit.find((t) => t.id === ref.id) ?? null);
          else if (ref.kind === 'event') setEditingEvent(events.find((e) => e.id === ref.id) ?? null);
        }}
        onDeleted={(ref) => {
          if (ref.kind === 'flight') setFlights((prev) => prev.filter((f) => f.id !== ref.id));
          else if (ref.kind === 'hotel') setHotels((prev) => prev.filter((h) => h.id !== ref.id));
          else if (ref.kind === 'parking') setParking((prev) => prev.filter((p) => p.id !== ref.id));
          else if (ref.kind === 'rentalCar') setRentalCars((prev) => prev.filter((c) => c.id !== ref.id));
          else if (ref.kind === 'transit') setTransit((prev) => prev.filter((t) => t.id !== ref.id));
          else if (ref.kind === 'event') setEvents((prev) => prev.filter((e) => e.id !== ref.id));
          setSelection(null);
          toast(`${kindLabel[ref.kind]} deleted`);
        }}
      />
    </>
  );
}
