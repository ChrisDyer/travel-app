'use client';

import { useState, useRef } from 'react';
import { TripDay, TripEvent, TripFlight, TripHotel, TripParking, TripRentalCar, TripTransit } from '@/types/travel';
import { EventCard } from './EventCard';
import { BrandLogo } from './BrandLogo';
import { Button } from '@/components/ui/button';
import { getMapsUrl } from '@/lib/maps';
import { MapPin } from 'lucide-react';

interface DaySectionProps {
  day: TripDay;
  events: TripEvent[];
  dayFlights: { flight: TripFlight; role: 'departure' | 'arrival' | 'return-departure' | 'return-arrival' }[];
  dayHotels: { hotel: TripHotel; role: 'checkin' | 'checkout' }[];
  dayParking: { parking: TripParking; role: 'dropoff' | 'pickup' }[];
  dayRentalCars: { rentalCar: TripRentalCar; role: 'pickup' | 'dropoff' }[];
  dayTransit: TripTransit[];
  isSelected?: boolean;
  onSelectDay?: (day: TripDay) => void;
  onDayTitleChanged?: (dayId: string, title: string | null) => void;
  onDayNotesChanged?: (dayId: string, notes: string | null) => void;
  onAddEvent: (day: TripDay) => void;
  onEditEvent: (event: TripEvent) => void;
  onEditFlight: (flight: TripFlight) => void;
  onEditHotel: (hotel: TripHotel) => void;
  onEditParking: (parking: TripParking) => void;
  onEditRentalCar: (rentalCar: TripRentalCar) => void;
  onEditTransit: (transit: TripTransit) => void;
  onReorderEvent?: (eventId: string, direction: 'up' | 'down') => void;
}

function fmt12(time: string | null) {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return {
    weekday: d.toLocaleDateString('en-US', { weekday: 'long' }),
    date: d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }),
  };
}

const transitTypeIcon: Record<string, string> = {
  train: '🚆', bus: '🚌', ferry: '⛴️', subway: '🚇', shuttle: '🚐', taxi: '🚕', rideshare: '🚗', other: '🚌',
};

type TimelineItem =
  | { kind: 'event'; time: string | null; event: TripEvent }
  | { kind: 'flight'; time: string | null; flight: TripFlight; role: 'departure' | 'arrival' | 'return-departure' | 'return-arrival' }
  | { kind: 'hotel'; time: string | null; hotel: TripHotel; role: 'checkin' | 'checkout' }
  | { kind: 'parking'; time: string | null; parking: TripParking; role: 'dropoff' | 'pickup' }
  | { kind: 'rentalCar'; time: string | null; rentalCar: TripRentalCar; role: 'pickup' | 'dropoff' }
  | { kind: 'transit'; time: string | null; transit: TripTransit };

export function DaySection({ day, events, dayFlights, dayHotels, dayParking, dayRentalCars, dayTransit, isSelected, onSelectDay, onDayTitleChanged, onDayNotesChanged, onAddEvent, onEditEvent, onEditFlight, onEditHotel, onEditParking, onEditRentalCar, onEditTransit, onReorderEvent }: DaySectionProps) {
  const { weekday, date } = formatDate(day.date);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(day.title ?? '');
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(day.notes ?? '');

  async function saveTitle() {
    setEditingTitle(false);
    const newTitle = titleDraft.trim() || null;
    if (newTitle === (day.title ?? null)) return;
    try {
      const res = await fetch(`/api/trips/${day.tripId}/days/${day.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });
      if (!res.ok) throw new Error();
      onDayTitleChanged?.(day.id, newTitle);
    } catch {
      setTitleDraft(day.title ?? '');
      window.alert('Could not save the day title. Please try again.');
    }
  }

  async function saveNotes() {
    setEditingNotes(false);
    const newNotes = notesDraft.trim() || null;
    if (newNotes === (day.notes ?? null)) return;
    try {
      const res = await fetch(`/api/trips/${day.tripId}/days/${day.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: newNotes }),
      });
      if (!res.ok) throw new Error();
      onDayNotesChanged?.(day.id, newNotes);
    } catch {
      setNotesDraft(day.notes ?? '');
      window.alert('Could not save the day notes. Please try again.');
    }
  }

  const untimedIds = events.filter((e) => !e.startTime).sort((a, b) => a.sortOrder - b.sortOrder).map((e) => e.id);

  // Build a unified timeline sorted by time
  const items: TimelineItem[] = [
    ...events.map((e) => ({ kind: 'event' as const, time: e.startTime, event: e })),
    ...dayFlights.map(({ flight, role }) => {
      let time: string | null = null;
      if (role === 'departure') time = flight.departureTime;
      else if (role === 'arrival') time = flight.arrivalTime;
      else if (role === 'return-departure') time = flight.returnDepartureTime;
      else if (role === 'return-arrival') time = flight.returnArrivalTime;
      return { kind: 'flight' as const, time, flight, role };
    }),
    ...dayHotels.map(({ hotel, role }) => ({
      kind: 'hotel' as const,
      time: role === 'checkin' ? hotel.checkInTime : hotel.checkOutTime,
      hotel,
      role,
    })),
    ...dayParking.map(({ parking, role }) => {
      const raw = role === 'dropoff' ? parking.startTime : parking.endTime;
      return { kind: 'parking' as const, time: raw === '00:00' ? null : raw, parking, role };
    }),
    ...dayRentalCars.map(({ rentalCar, role }) => ({
      kind: 'rentalCar' as const,
      time: role === 'pickup' ? rentalCar.pickupTime : rentalCar.dropoffTime,
      rentalCar,
      role,
    })),
    ...dayTransit.map((t) => ({ kind: 'transit' as const, time: t.departureTime ?? null, transit: t })),
  ].sort((a, b) => {
    if (a.time && b.time) return a.time.localeCompare(b.time);
    if (a.time) return -1;
    if (b.time) return 1;
    return 0;
  });

  return (
    <div className="day-section">
      <div className="flex items-baseline gap-3 mb-4">
        <div
          onClick={() => onSelectDay?.(day)}
          className={`text-left transition-all rounded-lg px-3 py-1.5 -mx-3 -my-1.5 hover:bg-stone-100 cursor-pointer ${isSelected ? 'border-l-4 border-blue-500 pl-2' : ''}`}
        >
          <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Day {day.dayNumber}</span>
          <h2 className="text-2xl font-serif font-bold text-stone-900">{weekday}</h2>
          <p className="text-stone-500 text-sm">{date}</p>
          {editingTitle ? (
            <input
              ref={titleInputRef}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => { if (editingTitle) saveTitle(); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
                if (e.key === 'Escape') { setTitleDraft(day.title ?? ''); setEditingTitle(false); }
              }}
              className="mt-0.5 text-stone-600 font-medium text-sm bg-transparent border-b border-stone-400 focus:outline-none w-full max-w-xs"
              placeholder="Add a day title…"
              autoFocus
            />
          ) : (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setEditingTitle(true); setTimeout(() => titleInputRef.current?.focus(), 0); }}
              className="no-print mt-0.5 text-left text-sm text-stone-500 hover:text-stone-700 transition-colors"
            >
              {day.title ? <span className="font-medium text-stone-600">{day.title}</span> : <span className="text-stone-400 italic">+ Add day title</span>}
            </button>
          )}
          {editingNotes ? (
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              onBlur={() => { if (editingNotes) saveNotes(); }}
              onKeyDown={(e) => { if (e.key === 'Escape') { setNotesDraft(day.notes ?? ''); setEditingNotes(false); } }}
              className="mt-1 w-full max-w-md text-sm text-stone-600 bg-transparent border border-stone-300 rounded-md p-2 focus:outline-none focus:border-stone-500"
              rows={2}
              placeholder="Notes for this day…"
              autoFocus
            />
          ) : (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setEditingNotes(true); }}
              className="no-print mt-0.5 block text-left text-xs text-stone-400 hover:text-stone-600 transition-colors"
            >
              {day.notes
                ? <span className="text-stone-500 whitespace-pre-wrap">{day.notes}</span>
                : <span className="italic">+ Add day notes</span>}
            </button>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="relative ml-1.5 pl-4 border-l-2 border-stone-200 space-y-3">
        {items.map((item, i) => {
          if (item.kind === 'event') {
            const pos = untimedIds.indexOf(item.event.id); // -1 for timed events
            return (
              <EventCard
                key={item.event.id}
                event={item.event}
                onEdit={onEditEvent}
                onMoveUp={pos > 0 ? () => onReorderEvent?.(item.event.id, 'up') : undefined}
                onMoveDown={pos !== -1 && pos < untimedIds.length - 1 ? () => onReorderEvent?.(item.event.id, 'down') : undefined}
              />
            );
          }

          if (item.kind === 'flight') {
            const f = item.flight;
            const role = item.role;
            const isReturn = role === 'return-departure' || role === 'return-arrival';
            const isDep = role === 'departure' || role === 'return-departure';
            const time = item.time;
            const label = isDep ? (isReturn ? 'Return departs' : 'Departs') : (isReturn ? 'Return arrives' : 'Arrives');
            const flightNum = isReturn ? f.returnFlightNumber : f.flightNumber;
            const route = isDep
              ? `${isReturn ? f.arrivalAirport : f.departureAirport} → ${isReturn ? f.departureAirport : f.arrivalAirport}`
              : `${f.departureAirport} → ${f.arrivalAirport}`;
            return (
              <div key={`flight-${f.id}-${role}-${i}`} className="relative pl-8 group cursor-pointer" onClick={() => onEditFlight(f)}>
                <div className="absolute left-0 top-3 w-3 h-3 rounded-full bg-white border-2 border-blue-300 group-hover:border-blue-500 transition-colors" />
                <div className="bg-blue-50 rounded-lg border border-blue-200 p-3 hover:border-blue-300 hover:shadow-sm transition-all">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <BrandLogo name={f.airline} fallback="✈" heightClass="h-4" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-stone-900">
                          {[f.airline, flightNum].filter(Boolean).join(' ')}
                          {route.trim() && <span className="text-stone-500 font-normal ml-1.5 text-xs">{route}</span>}
                        </p>
                        <p className="text-xs text-blue-600">{label}</p>
                      </div>
                    </div>
                    {time && <span className="text-sm font-semibold text-stone-700 shrink-0">{fmt12(time)}</span>}
                  </div>
                </div>
              </div>
            );
          }

          if (item.kind === 'parking') {
            const p = item.parking;
            const isDropoff = item.role === 'dropoff';
            return (
              <div key={`parking-${p.id}-${item.role}-${i}`} className="relative pl-8 group cursor-pointer" onClick={() => onEditParking(p)}>
                <div className="absolute left-0 top-3 w-3 h-3 rounded-full bg-white border-2 border-slate-300 group-hover:border-slate-500 transition-colors" />
                <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 hover:border-slate-300 hover:shadow-sm transition-all">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm shrink-0">🅿️</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-stone-900 truncate">
                          {p.location}
                          {p.level && <span className="text-stone-400 font-normal ml-1.5 text-xs">{p.level}</span>}
                        </p>
                        <div className="flex items-center gap-1">
                          <p className="text-xs text-slate-600">{isDropoff ? 'Drop-off' : 'Pick-up'}</p>
                          {p.address && (
                            <a href={getMapsUrl(p.address)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                              <MapPin className="h-3.5 w-3.5 text-stone-400 hover:text-blue-500 transition-colors" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                    {item.time && <span className="text-sm font-semibold text-stone-700 shrink-0">{fmt12(item.time)}</span>}
                  </div>
                </div>
              </div>
            );
          }

          if (item.kind === 'rentalCar') {
            const c = item.rentalCar;
            const isPickup = item.role === 'pickup';
            return (
              <div key={`rentalcar-${c.id}-${item.role}-${i}`} className="relative pl-8 group cursor-pointer" onClick={() => onEditRentalCar(c)}>
                <div className="absolute left-0 top-3 w-3 h-3 rounded-full bg-white border-2 border-slate-300 group-hover:border-slate-500 transition-colors" />
                <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 hover:border-slate-300 hover:shadow-sm transition-all">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <BrandLogo name={c.company} fallback="🚗" heightClass="h-4" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-stone-900 truncate">{c.company}</p>
                        <p className="text-xs text-slate-600">{isPickup ? 'Pick-up' : 'Drop-off'}{isPickup && c.pickupLocation ? ` · ${c.pickupLocation}` : !isPickup && c.dropoffLocation ? ` · ${c.dropoffLocation}` : ''}</p>
                      </div>
                    </div>
                    {item.time && <span className="text-sm font-semibold text-stone-700 shrink-0">{fmt12(item.time)}</span>}
                  </div>
                </div>
              </div>
            );
          }

          if (item.kind === 'transit') {
            const t = item.transit;
            return (
              <div key={`transit-${t.id}-${i}`} className="relative pl-8 group cursor-pointer" onClick={() => onEditTransit(t)}>
                <div className="absolute left-0 top-3 w-3 h-3 rounded-full bg-white border-2 border-slate-300 group-hover:border-slate-500 transition-colors" />
                <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 hover:border-slate-300 hover:shadow-sm transition-all">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm shrink-0">{t.transitType ? (transitTypeIcon[t.transitType] ?? '🚌') : '🚌'}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-stone-900 truncate">
                          {t.operator}
                          {t.routeNumber && <span className="text-stone-400 font-normal ml-1.5 text-xs">{t.routeNumber}</span>}
                        </p>
                        <p className="text-xs text-slate-600">
                          {t.fromLocation}{t.fromLocation && t.toLocation ? ' → ' : ''}{t.toLocation}
                        </p>
                      </div>
                    </div>
                    {item.time && <span className="text-sm font-semibold text-stone-700 shrink-0">{fmt12(item.time)}</span>}
                  </div>
                </div>
              </div>
            );
          }

          if (item.kind === 'hotel') {
            const h = item.hotel;
            const isIn = item.role === 'checkin';
            const time = isIn ? h.checkInTime : h.checkOutTime;
            return (
              <div key={`hotel-${h.id}-${item.role}-${i}`} className="relative pl-8 group cursor-pointer" onClick={() => onEditHotel(h)}>
                <div className="absolute left-0 top-3 w-3 h-3 rounded-full bg-white border-2 border-amber-300 group-hover:border-amber-500 transition-colors" />
                <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 hover:border-amber-300 hover:shadow-sm transition-all">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <BrandLogo name={h.name} fallback="🏨" heightClass="h-4" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-stone-900 truncate">{h.name}</p>
                        <div className="flex items-center gap-1">
                          <p className="text-xs text-amber-700">{isIn ? 'Check-in' : 'Check-out'}</p>
                          {h.address && (
                            <a href={getMapsUrl(h.address)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                              <MapPin className="h-3.5 w-3.5 text-amber-400 hover:text-blue-500 transition-colors" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                    {time && <span className="text-sm font-semibold text-stone-700 shrink-0">{fmt12(time)}</span>}
                  </div>
                </div>
              </div>
            );
          }
          return null;
        })}

        <div className="relative pl-8">
          <div className="absolute left-0 top-2.5 w-3 h-3 rounded-full bg-stone-200 border-2 border-stone-200" />
          <Button
            variant="ghost"
            size="sm"
            className="text-stone-400 hover:text-stone-700 -ml-1 no-print"
            onClick={() => onAddEvent(day)}
          >
            + Add event
          </Button>
        </div>
      </div>
    </div>
  );
}
