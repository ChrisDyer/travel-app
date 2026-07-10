'use client';

import { useState } from 'react';
import { TripFlight, TripHotel, TripParking, TripRentalCar, TripTransit, BookingStatus, TripStatus } from '@/types/travel';
import { BookingRef } from './booking-selection';
import { Button } from '@/components/ui/button';
import { BookingStatusBadge } from './BookingStatusBadge';
import { FlightForm } from './FlightForm';
import { HotelForm } from './HotelForm';
import { ParkingForm } from './ParkingForm';
import { RentalCarForm } from './RentalCarForm';
import { TransitForm } from './TransitForm';
import { getLogoPath } from '@/lib/logos';
import { BrandLogo } from './BrandLogo';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from '@/components/ui/toast';
import { fmt12, fmtShortDate } from '@/lib/dates';

interface KeyBookingsProps {
  tripId: string;
  travelMode: 'fly' | 'drive';
  rentalCarNeeded: boolean;
  flights: TripFlight[];
  hotels: TripHotel[];
  parking: TripParking[];
  rentalCars: TripRentalCar[];
  transit: TripTransit[];
  onFlightsChange: (flights: TripFlight[]) => void;
  onHotelsChange: (hotels: TripHotel[]) => void;
  onParkingChange: (parking: TripParking[]) => void;
  onRentalCarsChange: (rentalCars: TripRentalCar[]) => void;
  onTransitChange: (transit: TripTransit[]) => void;
  onSelect: (ref: BookingRef) => void;
}

const statusBorder: Record<BookingStatus, string> = {
  confirmed: 'border-emerald-200 bg-emerald-50',
  pending:   'border-amber-200 bg-amber-50',
  unbooked:  'border-stone-200 bg-stone-50',
};

function LegRow({ label, flightNum, date, depTime, arrTime }: {
  label?: string; flightNum?: string | null; date?: string | null;
  depTime?: string | null; arrTime?: string | null;
}) {
  const parts = [
    fmtShortDate(date ?? null),
    depTime || arrTime ? [fmt12(depTime ?? null), fmt12(arrTime ?? null)].filter(Boolean).join(' → ') : null,
  ].filter(Boolean);

  return (
    <div className="flex items-baseline gap-2 mt-0.5">
      {label && <span className="text-xs font-semibold text-stone-400 w-16 shrink-0">{label}</span>}
      {flightNum && <span className="text-xs font-medium text-stone-700">{flightNum}</span>}
      <span className="text-xs text-stone-500">{parts.join(' · ')}</span>
    </div>
  );
}

function DateRangeLine({ startDate, endDate, startLabel, endLabel }: {
  startDate?: string | null; endDate?: string | null; startLabel: string; endLabel: string;
}) {
  const start = fmtShortDate(startDate ?? null);
  const end = fmtShortDate(endDate ?? null);
  if (start && end) return <span className="text-xs text-stone-500">{start} – {end}</span>;
  if (start) return <span className="text-xs text-stone-500">{startLabel}: {start}</span>;
  if (end) return <span className="text-xs text-stone-500">{endLabel}: {end}</span>;
  return null;
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
  flights, hotels, parking, rentalCars, transit,
  onFlightsChange, onHotelsChange, onParkingChange, onRentalCarsChange, onTransitChange,
  onSelect,
}: KeyBookingsProps) {
  const [addingFlight, setAddingFlight] = useState(false);
  const [addingHotel, setAddingHotel] = useState(false);
  const [addingParking, setAddingParking] = useState(false);
  const [addingRentalCar, setAddingRentalCar] = useState(false);
  const [addingTransit, setAddingTransit] = useState(false);

  const [flightsOpen, setFlightsOpen] = useState(flights.length > 0);
  const [hotelsOpen, setHotelsOpen] = useState(hotels.length > 0);
  const [parkingOpen, setParkingOpen] = useState(parking.length > 0);
  const [rentalCarsOpen, setRentalCarsOpen] = useState(rentalCars.length > 0);
  const [transitOpen, setTransitOpen] = useState(transit.length > 0);

  function handleFlightSaved(f: TripFlight, isNew: boolean) {
    onFlightsChange(isNew ? [...flights, f] : flights.map((x) => x.id === f.id ? f : x));
    setAddingFlight(false);
    toast('Flight saved');
  }
  function handleHotelSaved(h: TripHotel, isNew: boolean) {
    onHotelsChange(isNew ? [...hotels, h] : hotels.map((x) => x.id === h.id ? h : x));
    setAddingHotel(false);
    toast('Hotel saved');
  }
  function handleParkingSaved(p: TripParking, isNew: boolean) {
    onParkingChange(isNew ? [...parking, p] : parking.map((x) => x.id === p.id ? p : x));
    setAddingParking(false);
    toast('Parking saved');
  }
  function handleRentalCarSaved(c: TripRentalCar, isNew: boolean) {
    onRentalCarsChange(isNew ? [...rentalCars, c] : rentalCars.map((x) => x.id === c.id ? c : x));
    setAddingRentalCar(false);
    toast('Rental car saved');
  }
  function handleTransitSaved(t: TripTransit, isNew: boolean) {
    onTransitChange(isNew ? [...transit, t] : transit.map((x) => x.id === t.id ? t : x));
    setAddingTransit(false);
    toast('Transit saved');
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
              onClick={() => onSelect({ kind: 'flight', id: f.id })}
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
                        <LegRow label="Outbound" flightNum={f.flightNumber} date={f.departureDate} depTime={f.departureTime} arrTime={f.arrivalTime} />
                        {(f.returnFlightNumber || f.returnDepartureDate) && (
                          <LegRow label="Return" flightNum={f.returnFlightNumber} date={f.returnDepartureDate} depTime={f.returnDepartureTime} arrTime={f.returnArrivalTime} />
                        )}
                      </>
                    ) : (
                      <LegRow flightNum={f.flightNumber} date={f.departureDate} depTime={f.departureTime} arrTime={f.arrivalTime} />
                    )}
                  </div>
                </div>
                <BookingStatusBadge status={f.bookingStatus as BookingStatus} />
                <ChevronRight className="h-4 w-4 text-stone-300 shrink-0 self-center" />
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
              onClick={() => onSelect({ kind: 'hotel', id: h.id })}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-3 min-w-0">
                  <BrandLogo name={h.name} fallback="🏨" heightClass="h-4" />
                  <div className="min-w-0">
                    {/* Always show the full property name — the logo only identifies the chain */}
                    <p className="text-sm font-semibold text-stone-900">{h.name}</p>
                    <div className="mt-1">
                      <DateRangeLine startDate={h.checkInDate} endDate={h.checkOutDate} startLabel="Check-in" endLabel="Check-out" />
                    </div>
                  </div>
                </div>
                <BookingStatusBadge status={h.bookingStatus as BookingStatus} />
                <ChevronRight className="h-4 w-4 text-stone-300 shrink-0 self-center" />
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
            onClick={() => onSelect({ kind: 'parking', id: p.id })}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 min-w-0">
                <span className="text-sm mt-0.5 shrink-0">🅿️</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-stone-900">
                    {p.location}
                    {p.level && <span className="font-normal text-stone-500 ml-2 text-xs">{p.level}</span>}
                  </p>
                  <div className="mt-1">
                    <DateRangeLine startDate={p.startDate} endDate={p.endDate} startLabel="Drop-off" endLabel="Pick-up" />
                  </div>
                </div>
              </div>
              <BookingStatusBadge status={p.bookingStatus as BookingStatus} />
              <ChevronRight className="h-4 w-4 text-stone-300 shrink-0 self-center" />
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
              onClick={() => onSelect({ kind: 'rentalCar', id: c.id })}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-3 min-w-0">
                  <BrandLogo name={c.company} fallback="🚗" heightClass="h-4" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-stone-900">
                      {!carLogo && c.company}
                      {c.carClass && <span className="font-normal text-stone-500 ml-2 text-xs">{c.carClass}</span>}
                    </p>
                  <div className="mt-1">
                    <DateRangeLine startDate={c.pickupDate} endDate={c.dropoffDate} startLabel="Pick-up" endLabel="Drop-off" />
                  </div>
                </div>
              </div>
              <BookingStatusBadge status={c.bookingStatus as BookingStatus} />
              <ChevronRight className="h-4 w-4 text-stone-300 shrink-0 self-center" />
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
            onClick={() => onSelect({ kind: 'transit', id: t.id })}
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
                      <span className="text-xs text-stone-500">Dep: {fmtShortDate(t.departureDate)}{t.departureTime ? ` @ ${fmt12(t.departureTime)}` : ''}</span>
                    )}
                  </div>
                </div>
              </div>
              <BookingStatusBadge status={t.bookingStatus as BookingStatus} />
              <ChevronRight className="h-4 w-4 text-stone-300 shrink-0 self-center" />
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
                `Out: ${[f.flightNumber, fmtShortDate(f.departureDate), f.departureTime && f.arrivalTime ? `${fmt12(f.departureTime)} → ${fmt12(f.arrivalTime)}` : null, f.confirmationNumber ? `Conf: ${f.confirmationNumber}` : null, f.seats ? `Seats: ${f.seats}` : null].filter(Boolean).join(' · ')}`,
                f.returnFlightNumber || f.returnDepartureDate ? `Ret: ${[f.returnFlightNumber, fmtShortDate(f.returnDepartureDate), f.returnDepartureTime && f.returnArrivalTime ? `${fmt12(f.returnDepartureTime)} → ${fmt12(f.returnArrivalTime)}` : null, f.returnConfirmationNumber ? `Conf: ${f.returnConfirmationNumber}` : null, f.returnSeats ? `Seats: ${f.returnSeats}` : null].filter(Boolean).join(' · ')}` : null,
              ].filter(Boolean).join(' | ')
            : [f.flightNumber, `${f.departureAirport} → ${f.arrivalAirport}`, fmtShortDate(f.departureDate), f.departureTime && f.arrivalTime ? `${fmt12(f.departureTime)} → ${fmt12(f.arrivalTime)}` : null, f.confirmationNumber ? `Conf: ${f.confirmationNumber}` : null, f.seats ? `Seats: ${f.seats}` : null].filter(Boolean).join(' · '),
          status: f.bookingStatus,
        })),
        ...hotels.map((h) => ({
          key: `ph-${h.id}`, icon: '🏨', title: h.name,
          sub: [h.address, h.checkInDate ? `Check-in: ${fmtShortDate(h.checkInDate)}${h.checkInTime ? ` @ ${fmt12(h.checkInTime)}` : ''}` : null, h.checkOutDate ? `Check-out: ${fmtShortDate(h.checkOutDate)}${h.checkOutTime ? ` @ ${fmt12(h.checkOutTime)}` : ''}` : null, h.confirmationNumber ? `Conf: ${h.confirmationNumber}` : null, h.roomType].filter(Boolean).join(' · '),
          status: h.bookingStatus,
        })),
        ...parking.map((p) => ({
          key: `pp-${p.id}`, icon: '🅿️', title: `${p.location}${p.level ? ` · ${p.level}` : ''}`,
          sub: [p.startDate ? `Drop-off: ${fmtShortDate(p.startDate)}${p.startTime && p.startTime !== '00:00' ? ` @ ${fmt12(p.startTime)}` : ''}` : null, p.endDate ? `Pick-up: ${fmtShortDate(p.endDate)}${p.endTime && p.endTime !== '00:00' ? ` @ ${fmt12(p.endTime)}` : ''}` : null, p.confirmationNumber ? `Conf: ${p.confirmationNumber}` : null, p.orderNumber ? `Order: ${p.orderNumber}` : null, p.cost != null ? `${p.currency ?? 'USD'} ${Number(p.cost).toFixed(2)}` : null].filter(Boolean).join(' · '),
          status: p.bookingStatus,
        })),
        ...rentalCars.map((c) => ({
          key: `pc-${c.id}`, icon: '🚗', title: `${c.company}${c.carClass ? ` · ${c.carClass}` : ''}`,
          sub: [c.pickupDate ? `Pick-up: ${fmtShortDate(c.pickupDate)}${c.pickupTime ? ` @ ${fmt12(c.pickupTime)}` : ''}` : null, c.pickupLocation, c.dropoffDate ? `Drop-off: ${fmtShortDate(c.dropoffDate)}${c.dropoffTime ? ` @ ${fmt12(c.dropoffTime)}` : ''}` : null, c.confirmationNumber ? `Conf: ${c.confirmationNumber}` : null, c.cost != null ? `${c.currency ?? 'USD'} ${Number(c.cost).toFixed(2)}` : null].filter(Boolean).join(' · '),
          status: c.bookingStatus,
        })),
        ...transit.map((t) => ({
          key: `pt-${t.id}`, icon: t.transitType ? (transitTypeIcon[t.transitType] ?? '🚌') : '🚌',
          title: `${t.operator}${t.routeNumber ? ` · ${t.routeNumber}` : ''}`,
          sub: [t.fromLocation && t.toLocation ? `${t.fromLocation} → ${t.toLocation}` : (t.fromLocation ?? t.toLocation), t.departureDate ? `Dep: ${fmtShortDate(t.departureDate)}${t.departureTime ? ` @ ${fmt12(t.departureTime)}` : ''}` : null, t.confirmationNumber ? `Conf: ${t.confirmationNumber}` : null, t.seatInfo, t.cost != null ? `${t.currency ?? 'USD'} ${Number(t.cost).toFixed(2)}` : null].filter(Boolean).join(' · '),
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

      {/* Forms (add only — editing happens via the booking detail drawer) */}
      {addingFlight && (
        <FlightForm tripId={tripId} flight={null}
          onSaved={handleFlightSaved}
          onDeleted={(id) => { onFlightsChange(flights.filter((x) => x.id !== id)); toast('Flight deleted'); }}
          onClose={() => setAddingFlight(false)} />
      )}
      {addingHotel && (
        <HotelForm tripId={tripId} hotel={null}
          onSaved={handleHotelSaved}
          onDeleted={(id) => { onHotelsChange(hotels.filter((x) => x.id !== id)); toast('Hotel deleted'); }}
          onClose={() => setAddingHotel(false)} />
      )}
      {addingParking && (
        <ParkingForm tripId={tripId} parking={null}
          onSaved={handleParkingSaved}
          onDeleted={(id) => { onParkingChange(parking.filter((x) => x.id !== id)); toast('Parking deleted'); }}
          onClose={() => setAddingParking(false)} />
      )}
      {addingRentalCar && (
        <RentalCarForm tripId={tripId} rentalCar={null}
          onSaved={handleRentalCarSaved}
          onDeleted={(id) => { onRentalCarsChange(rentalCars.filter((x) => x.id !== id)); toast('Rental car deleted'); }}
          onClose={() => setAddingRentalCar(false)} />
      )}
      {addingTransit && (
        <TransitForm tripId={tripId} transit={null}
          onSaved={handleTransitSaved}
          onDeleted={(id) => { onTransitChange(transit.filter((x) => x.id !== id)); toast('Transit deleted'); }}
          onClose={() => setAddingTransit(false)} />
      )}
    </div>
  );
}
