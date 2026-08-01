'use client';

import { useState, type ReactNode } from 'react';
import { TripDay, TripEvent, TripFlight, TripHotel, TripParking, TripRentalCar, TripTransit } from '@/types/travel';
import { BookingRef, BookingKind } from './booking-selection';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { BrandLogo } from './BrandLogo';
import { BookingStatusBadge, NoBookingBadge } from './BookingStatusBadge';
import { apiUrl } from '@/lib/api';
import { skipsBooking } from '@/lib/bookings';
import { getMapsUrl } from '@/lib/maps';
import { fmt12, fmtShortDate } from '@/lib/dates';
import { toast } from '@/components/ui/toast';
import { MapPin } from 'lucide-react';

interface BookingDetailSheetProps {
  tripId: string;
  selection: BookingRef | null;
  flights: TripFlight[];
  hotels: TripHotel[];
  parking: TripParking[];
  rentalCars: TripRentalCar[];
  transit: TripTransit[];
  events: TripEvent[];
  days: TripDay[];
  onClose: () => void;
  onEdit: (ref: BookingRef) => void;
  onDeleted: (ref: BookingRef) => void;
}

const transitTypeIcon: Record<string, string> = {
  train: '🚆', bus: '🚌', ferry: '⛴️', subway: '🚇', shuttle: '🚐', taxi: '🚕', rideshare: '🚗', other: '🚌',
};

const categoryIcons: Record<string, string> = {
  flight: '✈', hotel: '🏨', restaurant: '🍽', activity: '🎯', hike: '🥾', transport: '🚗', parking: '🅿️', note: '📝',
};

function logoName(title: string): string {
  const lower = title.toLowerCase();
  const atIdx = lower.indexOf(' at ');
  if (atIdx !== -1) return title.slice(atIdx + 4).trim();
  const atSymIdx = lower.indexOf(' @ ');
  if (atSymIdx !== -1) return title.slice(atSymIdx + 3).trim();
  return title;
}

const deleteEndpoint: Record<BookingKind, (tripId: string, id: string) => string> = {
  flight: (t, id) => `/api/trips/${t}/flights/${id}`,
  hotel: (t, id) => `/api/trips/${t}/hotels/${id}`,
  parking: (t, id) => `/api/trips/${t}/parking-bookings/${id}`,
  rentalCar: (t, id) => `/api/trips/${t}/rental-cars/${id}`,
  transit: (t, id) => `/api/trips/${t}/transit/${id}`,
  event: (t, id) => `/api/trips/${t}/events/${id}`,
};

type Row = { label: string; value: ReactNode | null | undefined };

function costValue(cost: number | null, currency: string | null): string | null {
  if (cost == null) return null;
  return `${currency ?? 'USD'} ${Number(cost).toFixed(2)}`;
}

// 'Sat, Aug 8 3:05 PM → 5:30 PM', or '… → Sun, Aug 9 5:30 PM' when the end date differs.
function whenRange(date1: string | null, time1: string | null, date2: string | null, time2: string | null): string | null {
  const d1 = fmtShortDate(date1);
  const t1 = fmt12(time1);
  const d2 = fmtShortDate(date2);
  const t2 = fmt12(time2);
  const left = [d1, t1].filter(Boolean).join(' ');
  const right = [d2 && d2 !== d1 ? d2 : null, t2].filter(Boolean).join(' ');
  if (!left && !right) return null;
  if (!right) return left;
  if (!left) return right;
  return `${left} → ${right}`;
}

function legValue(flightNum: string | null, date1: string | null, time1: string | null, date2: string | null, time2: string | null): string | null {
  const range = whenRange(date1, time1, date2, time2);
  return [flightNum, range].filter(Boolean).join(' · ') || null;
}

function pointValue(date: string | null, time: string | null, suppressMidnight = false): string | null {
  const d = fmtShortDate(date);
  const t = suppressMidnight && time === '00:00' ? null : fmt12(time);
  return [d, t].filter(Boolean).join(' @ ') || null;
}

function addressValue(address: string | null | undefined): ReactNode | null {
  if (!address) return null;
  return (
    <span className="inline-flex items-center gap-1">
      {address}
      <a href={getMapsUrl(address)} target="_blank" rel="noopener noreferrer" className="shrink-0">
        <MapPin className="h-3.5 w-3.5 text-stone-400 hover:text-blue-500 transition-colors inline" />
      </a>
    </span>
  );
}

function linkValue(url: string | null | undefined, label: string): ReactNode | null {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
      {label}
    </a>
  );
}

function notesValue(notes: string | null): ReactNode | null {
  if (!notes) return null;
  return <span className="whitespace-pre-wrap">{notes}</span>;
}

function Rows({ rows }: { rows: Row[] }) {
  const visible = rows.filter((r) => r.value !== null && r.value !== undefined && r.value !== '');
  if (visible.length === 0) return null;
  return (
    <div className="border-t border-stone-100 px-4 py-3 space-y-1.5 first:border-t-0">
      {visible.map((r, i) => (
        <div key={i} className="flex items-baseline gap-2">
          <span className="text-xs text-stone-400 w-28 shrink-0">{r.label}</span>
          <span className="text-sm text-stone-700">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function BookingDetailSheet({
  tripId, selection, flights, hotels, parking, rentalCars, transit, events, days, onClose, onEdit, onDeleted,
}: BookingDetailSheetProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Reset the delete-confirm step whenever the selection changes, without an effect
  // (see https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  const selectionKey = selection ? `${selection.kind}:${selection.id}` : null;
  const [prevSelectionKey, setPrevSelectionKey] = useState(selectionKey);
  if (selectionKey !== prevSelectionKey) {
    setPrevSelectionKey(selectionKey);
    setConfirmDelete(false);
  }

  async function handleDelete() {
    if (!selection) return;
    setDeleting(true);
    try {
      const res = await fetch(apiUrl(deleteEndpoint[selection.kind](tripId, selection.id)), { method: 'DELETE' });
      if (!res.ok) throw new Error();
      onDeleted(selection);
    } catch {
      toast('Could not delete. Please try again.', 'error');
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  let itemFound = false;
  let icon: ReactNode = null;
  let title = '';
  let subtitle: ReactNode = null;
  let chip: ReactNode = null;
  let status: ReactNode = null;
  let sections: Row[][] = [];

  if (selection?.kind === 'flight') {
    const f = flights.find((x) => x.id === selection.id);
    if (f) {
      itemFound = true;
      icon = <BrandLogo name={f.airline} fallback="✈" heightClass="h-5" />;
      title = f.airline ?? 'Flight';
      const isRT = f.tripType === 'round-trip';
      const route = (f.departureAirport || f.arrivalAirport)
        ? `${f.departureAirport ?? ''} → ${f.arrivalAirport ?? ''}${isRT && f.departureAirport ? ` → ${f.departureAirport}` : ''}`
        : null;
      subtitle = route;
      chip = isRT ? <span className="text-[10px] font-semibold bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">Round Trip</span> : null;
      status = <BookingStatusBadge status={f.bookingStatus} />;
      sections = [
        [
          { label: 'Outbound', value: legValue(f.flightNumber, f.departureDate, f.departureTime, f.arrivalDate, f.arrivalTime) },
          ...(isRT ? [{ label: 'Return', value: legValue(f.returnFlightNumber, f.returnDepartureDate, f.returnDepartureTime, f.returnArrivalDate, f.returnArrivalTime) }] : []),
        ],
        [{ label: 'Route', value: route }],
        [
          { label: 'Confirmation #', value: f.confirmationNumber },
          { label: 'Seats', value: f.seats },
          ...(isRT ? [
            { label: 'Return Conf #', value: f.returnConfirmationNumber },
            { label: 'Return Seats', value: f.returnSeats },
          ] : []),
        ],
        [{ label: 'Cost', value: costValue(f.cost, f.currency) }],
        [{ label: 'Policy', value: f.cancellationPolicy }],
        [{ label: 'Notes', value: notesValue(f.notes) }],
      ];
    }
  } else if (selection?.kind === 'hotel') {
    const h = hotels.find((x) => x.id === selection.id);
    if (h) {
      itemFound = true;
      icon = <BrandLogo name={h.name} fallback="🏨" heightClass="h-5" />;
      title = h.name;
      subtitle = h.address;
      status = <BookingStatusBadge status={h.bookingStatus} />;
      sections = [
        [
          { label: 'Check-in', value: pointValue(h.checkInDate, h.checkInTime) },
          { label: 'Check-out', value: pointValue(h.checkOutDate, h.checkOutTime) },
        ],
        [
          { label: 'Address', value: addressValue(h.address) },
          { label: 'Website', value: linkValue(h.locationUrl, 'Website ↗') },
        ],
        [
          { label: 'Confirmation #', value: h.confirmationNumber },
          { label: 'Room type', value: h.roomType },
          { label: 'Amenities', value: h.amenities },
        ],
        [{ label: 'Cost', value: costValue(h.cost, h.currency) }],
        [
          { label: 'Policy', value: h.cancellationPolicy },
          { label: 'Deadline', value: fmtShortDate(h.cancellationDeadline) },
        ],
        [{ label: 'Notes', value: notesValue(h.notes) }],
      ];
    }
  } else if (selection?.kind === 'parking') {
    const p = parking.find((x) => x.id === selection.id);
    if (p) {
      itemFound = true;
      icon = <BrandLogo name={p.vendor} fallback="🅿️" heightClass="h-5" />;
      title = p.location;
      subtitle = p.address;
      status = <BookingStatusBadge status={p.bookingStatus} />;
      sections = [
        [
          { label: 'Drop-off', value: pointValue(p.startDate, p.startTime, true) },
          { label: 'Pick-up', value: pointValue(p.endDate, p.endTime, true) },
        ],
        [
          { label: 'Address', value: addressValue(p.address) },
          { label: 'Level', value: p.level },
        ],
        [
          { label: 'Confirmation #', value: p.confirmationNumber },
          { label: 'Order #', value: p.orderNumber },
          { label: 'Vendor', value: p.vendor },
        ],
        [{ label: 'Cost', value: costValue(p.cost, p.currency) }],
        [{ label: 'Notes', value: notesValue(p.notes) }],
      ];
    }
  } else if (selection?.kind === 'rentalCar') {
    const c = rentalCars.find((x) => x.id === selection.id);
    if (c) {
      itemFound = true;
      icon = <BrandLogo name={c.company} fallback="🚗" heightClass="h-5" />;
      title = c.company;
      subtitle = c.carClass;
      status = <BookingStatusBadge status={c.bookingStatus} />;
      sections = [
        [
          { label: 'Pick-up', value: pointValue(c.pickupDate, c.pickupTime) },
          { label: 'Drop-off', value: pointValue(c.dropoffDate, c.dropoffTime) },
        ],
        [
          { label: 'Pick-up location', value: c.pickupLocation },
          { label: 'Drop-off location', value: c.dropoffLocation },
        ],
        [
          { label: 'Confirmation #', value: c.confirmationNumber },
          { label: 'Driver', value: c.driverName },
        ],
        [{ label: 'Cost', value: costValue(c.cost, c.currency) }],
        [{ label: 'Policy', value: c.cancellationPolicy }],
        [{ label: 'Notes', value: notesValue(c.notes) }],
      ];
    }
  } else if (selection?.kind === 'transit') {
    const t = transit.find((x) => x.id === selection.id);
    if (t) {
      itemFound = true;
      const tIcon = t.transitType ? (transitTypeIcon[t.transitType] ?? '🚌') : '🚌';
      icon = <BrandLogo name={t.operator} fallback={tIcon} heightClass="h-5" />;
      title = t.operator;
      const route = (t.fromLocation || t.toLocation)
        ? `${t.fromLocation ?? ''}${t.fromLocation && t.toLocation ? ' → ' : ''}${t.toLocation ?? ''}`
        : null;
      subtitle = route;
      status = <BookingStatusBadge status={t.bookingStatus} />;
      sections = [
        [
          { label: 'Departs', value: pointValue(t.departureDate, t.departureTime) },
          { label: 'Arrives', value: pointValue(t.arrivalDate, t.arrivalTime) },
        ],
        [{ label: 'Route', value: route }],
        [
          { label: 'Confirmation #', value: t.confirmationNumber },
          { label: 'Seats', value: t.seatInfo },
          { label: 'Operator', value: [t.operator, t.routeNumber].filter(Boolean).join(' · ') || null },
        ],
        [{ label: 'Cost', value: costValue(t.cost, t.currency) }],
        [{ label: 'Notes', value: notesValue(t.notes) }],
      ];
    }
  } else if (selection?.kind === 'event') {
    const e = events.find((x) => x.id === selection.id);
    if (e) {
      itemFound = true;
      const isHike = e.category === 'hike';
      const isRestaurant = e.category === 'restaurant';
      const noBooking = skipsBooking(e);
      const hikeLocation = e.trailheadLocation ?? e.location;
      icon = <BrandLogo name={logoName(e.title)} fallbackNames={[hikeLocation, e.location, e.vendor]} fallback={categoryIcons[e.category] ?? '📌'} heightClass="h-5" />;
      title = e.title;
      subtitle = isHike ? hikeLocation : e.location;
      status = isHike ? null : noBooking ? <NoBookingBadge category={e.category} /> : <BookingStatusBadge status={e.bookingStatus} />;
      const day = days.find((d) => d.id === e.tripDayId);
      const dayCaption = day ? `Day ${day.dayNumber} · ${fmtShortDate(day.date)}` : null;
      const timeRange = [fmt12(e.startTime), fmt12(e.endTime)].filter(Boolean).join(' – ') || null;
      sections = isHike ? [
        [
          { label: 'Day', value: dayCaption },
          { label: 'Time', value: timeRange },
        ],
        [
          { label: 'Distance', value: e.hikeDistance },
          { label: 'Elevation', value: e.hikeElevation },
        ],
        [
          { label: 'Trailhead', value: addressValue(hikeLocation) },
          { label: 'AllTrails', value: linkValue(e.alltrailsUrl, 'Open AllTrails ↗') },
        ],
        [{ label: 'Notes', value: notesValue(e.notes) }],
      ] : isRestaurant ? [
        [
          { label: 'Day', value: dayCaption },
          { label: 'Time', value: timeRange },
        ],
        [
          { label: 'Location', value: addressValue(e.location) },
          { label: 'Website', value: linkValue(e.locationUrl, 'Website ↗') },
        ],
        [
          { label: 'Party size', value: e.partySize },
          ...(noBooking ? [] : [{ label: 'Reservation', value: e.confirmationNumber }]),
        ],
        [
          { label: 'Policy', value: e.cancellationPolicy },
          { label: 'Deadline', value: fmtShortDate(e.cancellationDeadline) },
        ],
        [{ label: 'Notes', value: notesValue(e.notes) }],
      ] : [
        [
          { label: 'Day', value: dayCaption },
          { label: 'Time', value: timeRange },
        ],
        [
          { label: 'Location', value: addressValue(e.location) },
          { label: 'Website', value: linkValue(e.locationUrl, 'Website ↗') },
        ],
        // A walk-up activity has no confirmation, vendor or cancellation terms to show.
        ...(noBooking ? [] : [[
          { label: 'Confirmation #', value: e.confirmationNumber },
          { label: 'Vendor', value: e.vendor },
          { label: 'Order #', value: e.orderNumber },
          { label: 'Seats', value: e.seatInfo },
          { label: 'Booking', value: linkValue(e.bookingUrl, 'View booking ↗') },
        ]]),
        [{ label: 'Cost', value: costValue(e.cost, e.currency) }],
        ...(noBooking ? [] : [[
          { label: 'Policy', value: e.cancellationPolicy },
          { label: 'Deadline', value: fmtShortDate(e.cancellationDeadline) },
        ]]),
        [{ label: 'Notes', value: notesValue(e.notes) }],
      ];
    }
  }

  return (
    <Sheet open={itemFound} onOpenChange={(open) => { if (!open) onClose(); }}>
      {itemFound && selection && (
        <SheetContent>
          <SheetHeader>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-3 min-w-0">
                {icon}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <SheetTitle>{title}</SheetTitle>
                    {chip}
                  </div>
                  {subtitle && <p className="text-sm text-stone-500 mt-0.5 break-words">{subtitle}</p>}
                </div>
              </div>
              {status}
            </div>
          </SheetHeader>

          {sections.map((rows, i) => <Rows key={i} rows={rows} />)}

          <SheetFooter>
            <Button variant="default" onClick={() => onEdit(selection)}>Edit</Button>
            {confirmDelete ? (
              <>
                <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                  {deleting ? 'Deleting…' : 'Confirm delete?'}
                </Button>
              </>
            ) : (
              <Button variant="destructive" onClick={() => setConfirmDelete(true)}>Delete</Button>
            )}
          </SheetFooter>
        </SheetContent>
      )}
    </Sheet>
  );
}
