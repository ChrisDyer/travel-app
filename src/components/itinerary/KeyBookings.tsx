'use client';

import { useState } from 'react';
import { TripFlight, TripHotel, TripParking, TripRentalCar, TripTransit, BookingStatus, TripStatus } from '@/types/travel';
import { Button } from '@/components/ui/button';
import { BookingStatusBadge } from './BookingStatusBadge';
import { FlightForm } from './FlightForm';
import { HotelForm } from './HotelForm';
import { ParkingForm } from './ParkingForm';
import { RentalCarForm } from './RentalCarForm';
import { TransitForm } from './TransitForm';
import { getLogoPath } from '@/lib/logos';
import { BrandLogo } from './BrandLogo';
import { getMapsUrl } from '@/lib/maps';
import { ChevronDown, MapPin } from 'lucide-react';

interface KeyBookingsProps {
  tripId: string;
  travelMode: 'fly' | 'drive';
  rentalCarNeeded: boolean;
  initialFlights: TripFlight[];
  initialHotels: TripHotel[];
  initialParking: TripParking[];
  initialRentalCars: TripRentalCar[];
  initialTransit: TripTransit[];
  onFlightsChange: (flights: TripFlight[]) => void;
  onHotelsChange: (hotels: TripHotel[]) => void;
  onParkingChange: (parking: TripParking[]) => void;
  onRentalCarsChange: (rentalCars: TripRentalCar[]) => void;
  onTransitChange: (transit: TripTransit[]) => void;
}

function fmt12(time: string | null) {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function fmtDate(date: string | null) {
  if (!date) return null;
  return new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

const statusBorder: Record<BookingStatus, string> = {
  confirmed: 'border-emerald-200 bg-emerald-50',
  pending:   'border-amber-200 bg-amber-50',
  unbooked:  'border-stone-200 bg-stone-50',
};

function LegRow({ label, flightNum, date, depTime, arrTime, conf, seats }: {
  label?: string; flightNum?: string | null; date?: string | null;
  depTime?: string | null; arrTime?: string | null; conf?: string | null; seats?: string | null;
}) {
  const parts = [
    fmtDate(date ?? null),
    depTime || arrTime ? [fmt12(depTime ?? null), fmt12(arrTime ?? null)].filter(Boolean).join(' → ') : null,
    conf ? `Conf: ${conf}` : null,
    seats ? `Seats: ${seats}` : null,
  ].filter(Boolean);

  return (
    <div className="flex items-baseline gap-2 mt-0.5">
      {label && <span className="text-xs font-semibold text-stone-400 w-16 shrink-0">{label}</span>}
      {flightNum && <span className="text-xs font-medium text-stone-700">{flightNum}</span>}
      <span className="text-xs text-stone-500">{parts.join(' · ')}</span>
    </div>
  );
}

function SectionHeader({ label, onAdd, addLabel, isOpen, onToggle }: {
  label: string; onAdd: () => void; addLabel: string; isOpen: boolean; onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between mt-5 mb-2 first:mt-0">
      <button
        className="flex items-center gap-1 group"
        onClick={onToggle}
      >
        <ChevronDown
          className={`h-4 w-4 text-stone-500 group-hover:text-stone-700 transition-transform duration-150 ${isOpen ? '' : '-rotate-90'}`}
        />
        <span className="text-sm font-semibold text-stone-600 group-hover:text-stone-800 transition-colors">{label}</span>
      </button>
      {isOpen && (
        <Button variant="ghost" size="sm" className="text-stone-400 hover:text-stone-700 text-xs h-6 px-2 no-print" onClick={onAdd}>
          + {addLabel}
        </Button>
      )}
    </div>
  );
}

const transitTypeIcon: Record<string, string> = {
  train: '🚆', bus: '🚌', ferry: '⛴️', subway: '🚇', shuttle: '🚐', taxi: '🚕', rideshare: '🚗', other: '🚌',
};

export function KeyBookings({
  tripId,
  travelMode, rentalCarNeeded,
  initialFlights, initialHotels, initialParking, initialRentalCars, initialTransit,
  onFlightsChange, onHotelsChange, onParkingChange, onRentalCarsChange, onTransitChange,
}: KeyBookingsProps) {
  const [flights, setFlights] = useState<TripFlight[]>(initialFlights);
  const [hotels, setHotels] = useState<TripHotel[]>(initialHotels);
  const [parking, setParking] = useState<TripParking[]>(initialParking);
  const [rentalCars, setRentalCars] = useState<TripRentalCar[]>(initialRentalCars);
  const [transit, setTransit] = useState<TripTransit[]>(initialTransit);

  const [editingFlight, setEditingFlight] = useState<TripFlight | null>(null);
  const [addingFlight, setAddingFlight] = useState(false);
  const [editingHotel, setEditingHotel] = useState<TripHotel | null>(null);
  const [addingHotel, setAddingHotel] = useState(false);
  const [editingParking, setEditingParking] = useState<TripParking | null>(null);
  const [addingParking, setAddingParking] = useState(false);
  const [editingRentalCar, setEditingRentalCar] = useState<TripRentalCar | null>(null);
  const [addingRentalCar, setAddingRentalCar] = useState(false);
  const [editingTransit, setEditingTransit] = useState<TripTransit | null>(null);
  const [addingTransit, setAddingTransit] = useState(false);

  const [flightsOpen, setFlightsOpen] = useState(false);
  const [hotelsOpen, setHotelsOpen] = useState(false);
  const [parkingOpen, setParkingOpen] = useState(false);
  const [rentalCarsOpen, setRentalCarsOpen] = useState(false);
  const [transitOpen, setTransitOpen] = useState(false);

  function updateFlights(next: TripFlight[]) { setFlights(next); onFlightsChange(next); }
  function updateHotels(next: TripHotel[]) { setHotels(next); onHotelsChange(next); }
  function updateParking(next: TripParking[]) { setParking(next); onParkingChange(next); }
  function updateRentalCars(next: TripRentalCar[]) { setRentalCars(next); onRentalCarsChange(next); }
  function updateTransit(next: TripTransit[]) { setTransit(next); onTransitChange(next); }

  function handleFlightSaved(f: TripFlight, isNew: boolean) {
    updateFlights(isNew ? [...flights, f] : flights.map((x) => x.id === f.id ? f : x));
    setEditingFlight(null); setAddingFlight(false);
  }
  function handleHotelSaved(h: TripHotel, isNew: boolean) {
    updateHotels(isNew ? [...hotels, h] : hotels.map((x) => x.id === h.id ? h : x));
    setEditingHotel(null); setAddingHotel(false);
  }
  function handleParkingSaved(p: TripParking, isNew: boolean) {
    updateParking(isNew ? [...parking, p] : parking.map((x) => x.id === p.id ? p : x));
    setEditingParking(null); setAddingParking(false);
  }
  function handleRentalCarSaved(c: TripRentalCar, isNew: boolean) {
    updateRentalCars(isNew ? [...rentalCars, c] : rentalCars.map((x) => x.id === c.id ? c : x));
    setEditingRentalCar(null); setAddingRentalCar(false);
  }
  function handleTransitSaved(t: TripTransit, isNew: boolean) {
    updateTransit(isNew ? [...transit, t] : transit.map((x) => x.id === t.id ? t : x));
    setEditingTransit(null); setAddingTransit(false);
  }

  return (
    <div className="mb-10">
      <h2 className="text-lg font-semibold text-stone-700 mb-3">Key Bookings</h2>

      {/* ── FLIGHTS ── */}
      {travelMode === 'fly' && <SectionHeader label="Flights" onAdd={() => setAddingFlight(true)} addLabel="Flight" isOpen={flightsOpen} onToggle={() => setFlightsOpen((v) => !v)} />}
      {travelMode === 'fly' && flightsOpen && <div className="space-y-2">
        {flights.map((f) => {
          const airlineLogo = getLogoPath(f.airline);
          return (
            <div
              key={f.id}
              className={`rounded-lg border p-3.5 cursor-pointer hover:shadow-sm transition-all no-print ${statusBorder[f.bookingStatus as BookingStatus]}`}
              onClick={() => setEditingFlight(f)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-3 min-w-0">
                  {/* Logo replaces icon + name; emoji shown when no logo */}
                  <BrandLogo name={f.airline} fallback="✈" heightClass="h-4" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-stone-900">
                        {/* Suppress airline name text when logo already shows it */}
                        {!airlineLogo && (f.airline ?? 'Flight')}
                        {(f.departureAirport || f.arrivalAirport) && (
                          <span className={`font-normal text-stone-500 text-xs ${!airlineLogo ? 'ml-2' : ''}`}>
                            {f.departureAirport} → {f.arrivalAirport}
                            {f.tripType === 'round-trip' && f.departureAirport ? ` → ${f.departureAirport}` : ''}
                          </span>
                        )}
                      </p>
                      {f.tripType === 'round-trip' && (
                        <span className="text-[10px] font-semibold bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">Round Trip</span>
                      )}
                    </div>
                    {f.tripType === 'round-trip' ? (
                      <>
                        <LegRow label="Outbound" flightNum={f.flightNumber} date={f.departureDate} depTime={f.departureTime} arrTime={f.arrivalTime} conf={f.confirmationNumber} seats={f.seats} />
                        {(f.returnFlightNumber || f.returnDepartureDate) && (
                          <LegRow label="Return" flightNum={f.returnFlightNumber} date={f.returnDepartureDate} depTime={f.returnDepartureTime} arrTime={f.returnArrivalTime} conf={f.returnConfirmationNumber} seats={f.returnSeats} />
                        )}
                      </>
                    ) : (
                      <LegRow flightNum={f.flightNumber} date={f.departureDate} depTime={f.departureTime} arrTime={f.arrivalTime} conf={f.confirmationNumber} seats={f.seats} />
                    )}
                    {f.cancellationPolicy && <p className="text-xs text-stone-400 mt-0.5">{f.cancellationPolicy}</p>}
                  </div>
                </div>
                <BookingStatusBadge status={f.bookingStatus as BookingStatus} />
              </div>
            </div>
          );
        })}
        {flights.length === 0 && (
          <p className="text-xs text-stone-400 italic py-1 no-print">No flights added.</p>
        )}
      </div>}

      {/* ── HOTELS ── */}
      <SectionHeader label="Hotels" onAdd={() => setAddingHotel(true)} addLabel="Hotel" isOpen={hotelsOpen} onToggle={() => setHotelsOpen((v) => !v)} />
      {hotelsOpen && <div className="space-y-2">
        {hotels.map((h) => {
          const hotelLogo = getLogoPath(h.name);
          return (
            <div
              key={h.id}
              className={`rounded-lg border p-3.5 cursor-pointer hover:shadow-sm transition-all no-print ${statusBorder[h.bookingStatus as BookingStatus]}`}
              onClick={() => setEditingHotel(h)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-3 min-w-0">
                  <BrandLogo name={h.name} fallback="🏨" heightClass="h-4" />
                  <div className="min-w-0">
                    {/* Always show the full property name — the logo only identifies the chain */}
                    <p className="text-sm font-semibold text-stone-900">{h.name}</p>
                  {h.address && (
                    <div className="flex items-center gap-1 min-w-0">
                      <p className="text-xs text-stone-400 truncate">{h.address}</p>
                      <a href={getMapsUrl(h.address)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="shrink-0">
                        <MapPin className="h-3.5 w-3.5 text-stone-400 hover:text-blue-500 transition-colors" />
                      </a>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                    {(h.checkInDate || h.checkInTime) && (
                      <span className="text-xs text-stone-500">Check-in: {fmtDate(h.checkInDate)}{h.checkInTime ? ` @ ${fmt12(h.checkInTime)}` : ''}</span>
                    )}
                    {(h.checkOutDate || h.checkOutTime) && (
                      <span className="text-xs text-stone-500">Check-out: {fmtDate(h.checkOutDate)}{h.checkOutTime ? ` @ ${fmt12(h.checkOutTime)}` : ''}</span>
                    )}
                    {h.roomType && <span className="text-xs text-stone-400">{h.roomType}</span>}
                    {h.confirmationNumber && <span className="text-xs text-stone-400">Conf: {h.confirmationNumber}</span>}
                    {h.amenities && <span className="text-xs text-stone-400">{h.amenities}</span>}
                    {h.cancellationPolicy && <span className="text-xs text-stone-400">{h.cancellationPolicy}</span>}
                  </div>
                </div>
              </div>
              <BookingStatusBadge status={h.bookingStatus as BookingStatus} />
            </div>
          </div>
          );
        })}
        {hotels.length === 0 && (
          <p className="text-xs text-stone-400 italic py-1 no-print">No hotels added.</p>
        )}
      </div>}

      {/* ── PARKING ── */}
      <SectionHeader label="Parking" onAdd={() => setAddingParking(true)} addLabel="Parking" isOpen={parkingOpen} onToggle={() => setParkingOpen((v) => !v)} />
      {parkingOpen && <div className="space-y-2">
        {parking.map((p) => (
          <div
            key={p.id}
            className={`rounded-lg border p-3.5 cursor-pointer hover:shadow-sm transition-all no-print ${statusBorder[p.bookingStatus as BookingStatus]}`}
            onClick={() => setEditingParking(p)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 min-w-0">
                <span className="text-sm mt-0.5 shrink-0">🅿️</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-stone-900">
                    {p.location}
                    {p.level && <span className="font-normal text-stone-500 ml-2 text-xs">{p.level}</span>}
                  </p>
                  {p.address && (
                    <div className="flex items-center gap-1 min-w-0">
                      <p className="text-xs text-stone-400 truncate">{p.address}</p>
                      <a href={getMapsUrl(p.address)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="shrink-0">
                        <MapPin className="h-3.5 w-3.5 text-stone-400 hover:text-blue-500 transition-colors" />
                      </a>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                    {(p.startDate || (p.startTime && p.startTime !== '00:00')) && (
                      <span className="text-xs text-stone-500">Drop-off: {fmtDate(p.startDate)}{p.startTime && p.startTime !== '00:00' ? ` @ ${fmt12(p.startTime)}` : ''}</span>
                    )}
                    {(p.endDate || (p.endTime && p.endTime !== '00:00')) && (
                      <span className="text-xs text-stone-500">Pick-up: {fmtDate(p.endDate)}{p.endTime && p.endTime !== '00:00' ? ` @ ${fmt12(p.endTime)}` : ''}</span>
                    )}
                    {p.vendor && <span className="text-xs text-stone-400">{p.vendor}</span>}
                    {p.confirmationNumber && <span className="text-xs text-stone-400">Conf: {p.confirmationNumber}</span>}
                    {p.orderNumber && <span className="text-xs text-stone-400">Order: {p.orderNumber}</span>}
                    {p.cost != null && <span className="text-xs text-stone-400">{p.currency ?? 'USD'} {Number(p.cost).toFixed(2)}</span>}
                  </div>
                </div>
              </div>
              <BookingStatusBadge status={p.bookingStatus as BookingStatus} />
            </div>
          </div>
        ))}
        {parking.length === 0 && (
          <p className="text-xs text-stone-400 italic py-1 no-print">No parking added.</p>
        )}
      </div>}

      {/* ── RENTAL CARS ── */}
      {!!rentalCarNeeded && <SectionHeader label="Rental Car" onAdd={() => setAddingRentalCar(true)} addLabel="Rental Car" isOpen={rentalCarsOpen} onToggle={() => setRentalCarsOpen((v) => !v)} />}
      {!!rentalCarNeeded && rentalCarsOpen && <div className="space-y-2">
        {rentalCars.map((c) => {
          const carLogo = getLogoPath(c.company);
          return (
            <div
              key={c.id}
              className={`rounded-lg border p-3.5 cursor-pointer hover:shadow-sm transition-all no-print ${statusBorder[c.bookingStatus as BookingStatus]}`}
              onClick={() => setEditingRentalCar(c)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-3 min-w-0">
                  <BrandLogo name={c.company} fallback="🚗" heightClass="h-4" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-stone-900">
                      {!carLogo && c.company}
                      {c.carClass && <span className="font-normal text-stone-500 ml-2 text-xs">{c.carClass}</span>}
                    </p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                    {(c.pickupDate || c.pickupTime) && (
                      <span className="text-xs text-stone-500">Pick-up: {fmtDate(c.pickupDate)}{c.pickupTime ? ` @ ${fmt12(c.pickupTime)}` : ''}</span>
                    )}
                    {c.pickupLocation && <span className="text-xs text-stone-400">{c.pickupLocation}</span>}
                    {(c.dropoffDate || c.dropoffTime) && (
                      <span className="text-xs text-stone-500">Drop-off: {fmtDate(c.dropoffDate)}{c.dropoffTime ? ` @ ${fmt12(c.dropoffTime)}` : ''}</span>
                    )}
                    {c.confirmationNumber && <span className="text-xs text-stone-400">Conf: {c.confirmationNumber}</span>}
                    {c.driverName && <span className="text-xs text-stone-400">Driver: {c.driverName}</span>}
                    {c.cost != null && <span className="text-xs text-stone-400">{c.currency ?? 'USD'} {Number(c.cost).toFixed(2)}</span>}
                  </div>
                </div>
              </div>
              <BookingStatusBadge status={c.bookingStatus as BookingStatus} />
            </div>
          </div>
          );
        })}
        {rentalCars.length === 0 && (
          <p className="text-xs text-stone-400 italic py-1 no-print">No rental cars added.</p>
        )}
      </div>}

      {/* ── TRANSIT ── */}
      <SectionHeader label="Transit" onAdd={() => setAddingTransit(true)} addLabel="Transit" isOpen={transitOpen} onToggle={() => setTransitOpen((v) => !v)} />
      {transitOpen && <div className="space-y-2">
        {transit.map((t) => (
          <div
            key={t.id}
            className={`rounded-lg border p-3.5 cursor-pointer hover:shadow-sm transition-all no-print ${statusBorder[t.bookingStatus as BookingStatus]}`}
            onClick={() => setEditingTransit(t)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 min-w-0">
                <span className="text-sm mt-0.5 shrink-0">{t.transitType ? (transitTypeIcon[t.transitType] ?? '🚌') : '🚌'}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-stone-900">
                    {t.operator}
                    {t.routeNumber && <span className="font-normal text-stone-500 ml-2 text-xs">{t.routeNumber}</span>}
                  </p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                    {(t.fromLocation || t.toLocation) && (
                      <span className="text-xs text-stone-500">{t.fromLocation}{t.fromLocation && t.toLocation ? ' → ' : ''}{t.toLocation}</span>
                    )}
                    {(t.departureDate || t.departureTime) && (
                      <span className="text-xs text-stone-500">Dep: {fmtDate(t.departureDate)}{t.departureTime ? ` @ ${fmt12(t.departureTime)}` : ''}</span>
                    )}
                    {t.confirmationNumber && <span className="text-xs text-stone-400">Conf: {t.confirmationNumber}</span>}
                    {t.seatInfo && <span className="text-xs text-stone-400">{t.seatInfo}</span>}
                    {t.cost != null && <span className="text-xs text-stone-400">{t.currency ?? 'USD'} {Number(t.cost).toFixed(2)}</span>}
                  </div>
                </div>
              </div>
              <BookingStatusBadge status={t.bookingStatus as BookingStatus} />
            </div>
          </div>
        ))}
        {transit.length === 0 && (
          <p className="text-xs text-stone-400 italic py-1 no-print">No transit added.</p>
        )}
      </div>}

      {/* Print versions */}
      {[
        ...flights.map((f) => ({
          key: `pf-${f.id}`, icon: '✈',
          title: `${f.airline ?? 'Flight'} ${f.tripType === 'round-trip' ? '(Round Trip)' : ''}`,
          sub: f.tripType === 'round-trip'
            ? [
                `Out: ${[f.flightNumber, fmtDate(f.departureDate), f.departureTime && f.arrivalTime ? `${fmt12(f.departureTime)} → ${fmt12(f.arrivalTime)}` : null, f.confirmationNumber ? `Conf: ${f.confirmationNumber}` : null, f.seats ? `Seats: ${f.seats}` : null].filter(Boolean).join(' · ')}`,
                f.returnFlightNumber || f.returnDepartureDate ? `Ret: ${[f.returnFlightNumber, fmtDate(f.returnDepartureDate), f.returnDepartureTime && f.returnArrivalTime ? `${fmt12(f.returnDepartureTime)} → ${fmt12(f.returnArrivalTime)}` : null, f.returnConfirmationNumber ? `Conf: ${f.returnConfirmationNumber}` : null, f.returnSeats ? `Seats: ${f.returnSeats}` : null].filter(Boolean).join(' · ')}` : null,
              ].filter(Boolean).join(' | ')
            : [f.flightNumber, `${f.departureAirport} → ${f.arrivalAirport}`, fmtDate(f.departureDate), f.departureTime && f.arrivalTime ? `${fmt12(f.departureTime)} → ${fmt12(f.arrivalTime)}` : null, f.confirmationNumber ? `Conf: ${f.confirmationNumber}` : null, f.seats ? `Seats: ${f.seats}` : null].filter(Boolean).join(' · '),
          status: f.bookingStatus,
        })),
        ...hotels.map((h) => ({
          key: `ph-${h.id}`, icon: '🏨', title: h.name,
          sub: [h.address, h.checkInDate ? `Check-in: ${fmtDate(h.checkInDate)}${h.checkInTime ? ` @ ${fmt12(h.checkInTime)}` : ''}` : null, h.checkOutDate ? `Check-out: ${fmtDate(h.checkOutDate)}${h.checkOutTime ? ` @ ${fmt12(h.checkOutTime)}` : ''}` : null, h.confirmationNumber ? `Conf: ${h.confirmationNumber}` : null, h.roomType].filter(Boolean).join(' · '),
          status: h.bookingStatus,
        })),
        ...parking.map((p) => ({
          key: `pp-${p.id}`, icon: '🅿️', title: `${p.location}${p.level ? ` · ${p.level}` : ''}`,
          sub: [p.startDate ? `Drop-off: ${fmtDate(p.startDate)}${p.startTime && p.startTime !== '00:00' ? ` @ ${fmt12(p.startTime)}` : ''}` : null, p.endDate ? `Pick-up: ${fmtDate(p.endDate)}${p.endTime && p.endTime !== '00:00' ? ` @ ${fmt12(p.endTime)}` : ''}` : null, p.confirmationNumber ? `Conf: ${p.confirmationNumber}` : null, p.orderNumber ? `Order: ${p.orderNumber}` : null, p.cost != null ? `${p.currency ?? 'USD'} ${Number(p.cost).toFixed(2)}` : null].filter(Boolean).join(' · '),
          status: p.bookingStatus,
        })),
        ...rentalCars.map((c) => ({
          key: `pc-${c.id}`, icon: '🚗', title: `${c.company}${c.carClass ? ` · ${c.carClass}` : ''}`,
          sub: [c.pickupDate ? `Pick-up: ${fmtDate(c.pickupDate)}${c.pickupTime ? ` @ ${fmt12(c.pickupTime)}` : ''}` : null, c.pickupLocation, c.dropoffDate ? `Drop-off: ${fmtDate(c.dropoffDate)}${c.dropoffTime ? ` @ ${fmt12(c.dropoffTime)}` : ''}` : null, c.confirmationNumber ? `Conf: ${c.confirmationNumber}` : null, c.cost != null ? `${c.currency ?? 'USD'} ${Number(c.cost).toFixed(2)}` : null].filter(Boolean).join(' · '),
          status: c.bookingStatus,
        })),
        ...transit.map((t) => ({
          key: `pt-${t.id}`, icon: t.transitType ? (transitTypeIcon[t.transitType] ?? '🚌') : '🚌',
          title: `${t.operator}${t.routeNumber ? ` · ${t.routeNumber}` : ''}`,
          sub: [t.fromLocation && t.toLocation ? `${t.fromLocation} → ${t.toLocation}` : (t.fromLocation ?? t.toLocation), t.departureDate ? `Dep: ${fmtDate(t.departureDate)}${t.departureTime ? ` @ ${fmt12(t.departureTime)}` : ''}` : null, t.confirmationNumber ? `Conf: ${t.confirmationNumber}` : null, t.seatInfo, t.cost != null ? `${t.currency ?? 'USD'} ${Number(t.cost).toFixed(2)}` : null].filter(Boolean).join(' · '),
          status: t.bookingStatus,
        })),
      ].map(({ key, icon, title, sub, status }) => (
        <div key={key} className="rounded-lg border border-stone-200 p-3 hidden print:flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-stone-900">{icon} {title}</p>
            {sub && <p className="text-xs text-stone-500 mt-0.5">{sub}</p>}
          </div>
          <span className="text-xs text-stone-400 capitalize shrink-0">{status}</span>
        </div>
      ))}

      {/* Forms */}
      {(editingFlight || addingFlight) && (
        <FlightForm tripId={tripId} flight={editingFlight}
          onSaved={handleFlightSaved}
          onDeleted={(id) => { updateFlights(flights.filter((x) => x.id !== id)); setEditingFlight(null); }}
          onClose={() => { setEditingFlight(null); setAddingFlight(false); }} />
      )}
      {(editingHotel || addingHotel) && (
        <HotelForm tripId={tripId} hotel={editingHotel}
          onSaved={handleHotelSaved}
          onDeleted={(id) => { updateHotels(hotels.filter((x) => x.id !== id)); setEditingHotel(null); }}
          onClose={() => { setEditingHotel(null); setAddingHotel(false); }} />
      )}
      {(editingParking || addingParking) && (
        <ParkingForm tripId={tripId} parking={editingParking}
          onSaved={handleParkingSaved}
          onDeleted={(id) => { updateParking(parking.filter((x) => x.id !== id)); setEditingParking(null); }}
          onClose={() => { setEditingParking(null); setAddingParking(false); }} />
      )}
      {(editingRentalCar || addingRentalCar) && (
        <RentalCarForm tripId={tripId} rentalCar={editingRentalCar}
          onSaved={handleRentalCarSaved}
          onDeleted={(id) => { updateRentalCars(rentalCars.filter((x) => x.id !== id)); setEditingRentalCar(null); }}
          onClose={() => { setEditingRentalCar(null); setAddingRentalCar(false); }} />
      )}
      {(editingTransit || addingTransit) && (
        <TransitForm tripId={tripId} transit={editingTransit}
          onSaved={handleTransitSaved}
          onDeleted={(id) => { updateTransit(transit.filter((x) => x.id !== id)); setEditingTransit(null); }}
          onClose={() => { setEditingTransit(null); setAddingTransit(false); }} />
      )}
    </div>
  );
}
