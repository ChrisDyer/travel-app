'use client';

import { useState } from 'react';
import { TripFlight, BookingStatus, FlightTripType } from '@/types/travel';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { AirportCombobox } from './AirportCombobox';

const bookingStatuses: BookingStatus[] = ['unbooked', 'pending', 'confirmed'];

interface FlightFormProps {
  tripId: string;
  flight: TripFlight | null;
  onSaved: (flight: TripFlight, isNew: boolean) => void;
  onDeleted: (flightId: string) => void;
  onClose: () => void;
}

export function FlightForm({ tripId, flight, onSaved, onDeleted, onClose }: FlightFormProps) {
  const isNew = !flight;
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [tripType, setTripType] = useState<FlightTripType>(flight?.tripType ?? 'one-way');
  const [depDate, setDepDate] = useState(flight?.departureDate ?? '');

  const isRoundTrip = tripType === 'round-trip';

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);

    const arrDate = (form.get('arrivalDate') as string) || depDate || null;

    const body: Record<string, unknown> = {
      tripType,
      airline: form.get('airline') || null,
      flightNumber: form.get('flightNumber') || null,
      departureAirport: form.get('departureAirport') || null,
      arrivalAirport: form.get('arrivalAirport') || null,
      departureDate: depDate || null,
      departureTime: form.get('departureTime') || null,
      arrivalDate: arrDate,
      arrivalTime: form.get('arrivalTime') || null,
      confirmationNumber: form.get('confirmationNumber') || null,
      seats: form.get('seats') || null,
      bookingStatus: form.get('bookingStatus'),
      cancellationPolicy: form.get('cancellationPolicy') || null,
      cost: form.get('cost') ? Number(form.get('cost')) : null,
      currency: form.get('currency') || null,
      notes: form.get('notes') || null,
      // Return leg — always write these; null them out for one-way
      returnFlightNumber: isRoundTrip ? (form.get('returnFlightNumber') || null) : null,
      returnDepartureDate: isRoundTrip ? (form.get('returnDepartureDate') || null) : null,
      returnDepartureTime: isRoundTrip ? (form.get('returnDepartureTime') || null) : null,
      returnArrivalDate: isRoundTrip ? (form.get('returnArrivalDate') || null) : null,
      returnArrivalTime: isRoundTrip ? (form.get('returnArrivalTime') || null) : null,
      returnConfirmationNumber: isRoundTrip ? (form.get('returnConfirmationNumber') || null) : null,
      returnSeats: isRoundTrip ? (form.get('returnSeats') || null) : null,
    };

    const url = isNew ? `/api/trips/${tripId}/flights` : `/api/trips/${tripId}/flights/${flight.id}`;
    const method = isNew ? 'POST' : 'PATCH';

    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) {
      const saved = await res.json();
      onSaved(saved, isNew);
    }
    setLoading(false);
  }

  async function handleDelete() {
    if (!flight) return;
    setDeleting(true);
    await fetch(`/api/trips/${tripId}/flights/${flight.id}`, { method: 'DELETE' });
    onDeleted(flight.id);
    setDeleting(false);
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif flex items-center gap-2">
            <span>✈</span> {isNew ? 'Add Flight' : 'Edit Flight'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">

          {/* Trip type toggle */}
          <div className="flex rounded-lg border border-stone-200 overflow-hidden text-sm">
            {(['one-way', 'round-trip'] as FlightTripType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTripType(t)}
                className={`flex-1 py-1.5 font-medium transition-colors capitalize ${
                  tripType === t
                    ? 'bg-stone-900 text-white'
                    : 'bg-white text-stone-500 hover:bg-stone-50'
                }`}
              >
                {t.replace('-', ' ')}
              </button>
            ))}
          </div>

          {/* Airline + Flight # */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="airline">Airline</Label>
              <Input id="airline" name="airline" defaultValue={flight?.airline ?? ''} placeholder="e.g. Delta" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="flightNumber">{isRoundTrip ? 'Outbound Flight #' : 'Flight #'}</Label>
              <Input id="flightNumber" name="flightNumber" defaultValue={flight?.flightNumber ?? ''} placeholder="e.g. DL 1178" />
            </div>
          </div>

          {/* Route */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="departureAirport">From</Label>
              <AirportCombobox id="departureAirport" name="departureAirport" defaultValue={flight?.departureAirport ?? ''} placeholder="City or code" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="arrivalAirport">To</Label>
              <AirportCombobox id="arrivalAirport" name="arrivalAirport" defaultValue={flight?.arrivalAirport ?? ''} placeholder="City or code" />
            </div>
          </div>

          {/* Outbound date + times */}
          <div>
            {isRoundTrip && (
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2">Outbound</p>
            )}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5 col-span-1">
                <Label htmlFor="departureDate">Date</Label>
                <Input id="departureDate" name="departureDate" type="date" value={depDate} onChange={(e) => setDepDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="departureTime">Departs</Label>
                <Input id="departureTime" name="departureTime" type="time" defaultValue={flight?.departureTime ?? ''} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="arrivalTime">Arrives</Label>
                <Input id="arrivalTime" name="arrivalTime" type="time" defaultValue={flight?.arrivalTime ?? ''} />
              </div>
            </div>
            <div className="mt-2 space-y-1.5">
              <Label htmlFor="arrivalDate" className="text-stone-400 font-normal text-xs">Arrival date if different (overnight)</Label>
              <Input id="arrivalDate" name="arrivalDate" type="date" defaultValue={flight?.arrivalDate !== flight?.departureDate ? (flight?.arrivalDate ?? '') : ''} />
            </div>
          </div>

          {/* Outbound conf + seats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="confirmationNumber">{isRoundTrip ? 'Outbound Conf #' : 'Confirmation #'}</Label>
              <Input id="confirmationNumber" name="confirmationNumber" defaultValue={flight?.confirmationNumber ?? ''} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="seats">{isRoundTrip ? 'Outbound Seats' : 'Seats'}</Label>
              <Input id="seats" name="seats" defaultValue={flight?.seats ?? ''} placeholder="e.g. 24A & 24B" />
            </div>
          </div>

          {/* Return leg — only for round-trip */}
          {isRoundTrip && (
            <div className="border-t border-stone-200 pt-4 space-y-4">
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Return</p>

              <div className="space-y-1.5">
                <Label htmlFor="returnFlightNumber">Return Flight #</Label>
                <Input id="returnFlightNumber" name="returnFlightNumber" defaultValue={flight?.returnFlightNumber ?? ''} placeholder="e.g. DL 2486" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5 col-span-1">
                  <Label htmlFor="returnDepartureDate">Date</Label>
                  <Input id="returnDepartureDate" name="returnDepartureDate" type="date" defaultValue={flight?.returnDepartureDate ?? ''} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="returnDepartureTime">Departs</Label>
                  <Input id="returnDepartureTime" name="returnDepartureTime" type="time" defaultValue={flight?.returnDepartureTime ?? ''} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="returnArrivalTime">Arrives</Label>
                  <Input id="returnArrivalTime" name="returnArrivalTime" type="time" defaultValue={flight?.returnArrivalTime ?? ''} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="returnArrivalDate" className="text-stone-400 font-normal text-xs">Return arrival date if different (overnight)</Label>
                <Input id="returnArrivalDate" name="returnArrivalDate" type="date" defaultValue={flight?.returnArrivalDate ?? ''} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="returnConfirmationNumber">Return Conf #</Label>
                  <Input id="returnConfirmationNumber" name="returnConfirmationNumber" defaultValue={flight?.returnConfirmationNumber ?? ''} placeholder="If different from outbound" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="returnSeats">Return Seats</Label>
                  <Input id="returnSeats" name="returnSeats" defaultValue={flight?.returnSeats ?? ''} placeholder="e.g. 24A & 24B" />
                </div>
              </div>
            </div>
          )}

          {/* Booking details */}
          <div className="border-t border-stone-100 pt-3 grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Booking Status</Label>
              <Select name="bookingStatus" defaultValue={flight?.bookingStatus ?? 'unbooked'}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {bookingStatuses.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cancellationPolicy">Cancellation</Label>
              <Input id="cancellationPolicy" name="cancellationPolicy" defaultValue={flight?.cancellationPolicy ?? ''} placeholder="e.g. Non-refundable" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="cost">Cost</Label>
              <Input id="cost" name="cost" type="number" step="0.01" defaultValue={flight?.cost ?? ''} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="currency">Currency</Label>
              <Input id="currency" name="currency" defaultValue={flight?.currency ?? 'USD'} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" defaultValue={flight?.notes ?? ''} rows={2} placeholder="Any additional details…" />
          </div>

          <div className="flex justify-between pt-2">
            {!isNew ? (
              <Button type="button" variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </Button>
            ) : <div />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={loading}>{loading ? 'Saving…' : 'Save Flight'}</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
