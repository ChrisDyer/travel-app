'use client';

import { useState } from 'react';
import { TripTransit, BookingStatus, TransitType } from '@/types/travel';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { apiUrl } from '@/lib/api';

const bookingStatuses: BookingStatus[] = ['unbooked', 'pending', 'confirmed'];
const transitTypes: { value: TransitType; label: string }[] = [
  { value: 'train', label: 'Train' },
  { value: 'bus', label: 'Bus' },
  { value: 'ferry', label: 'Ferry' },
  { value: 'subway', label: 'Subway / Metro' },
  { value: 'shuttle', label: 'Shuttle' },
  { value: 'taxi', label: 'Taxi' },
  { value: 'rideshare', label: 'Rideshare' },
  { value: 'other', label: 'Other' },
];

interface TransitFormProps {
  tripId: string;
  transit: TripTransit | null;
  onSaved: (transit: TripTransit, isNew: boolean) => void;
  onDeleted: (transitId: string) => void;
  onClose: () => void;
}

export function TransitForm({ tripId, transit, onSaved, onDeleted, onClose }: TransitFormProps) {
  const isNew = !transit;
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  // Backed by trip_transit.takes_reservations. Off = a walk-up leg — a metro ride, a hailed
  // taxi — with no booking, confirmation or seat to track.
  const [needsBooking, setNeedsBooking] = useState<boolean>(Boolean(transit?.takesReservations ?? true));

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const form = new FormData(e.currentTarget);

    const departureDate = form.get('departureDate') as string;
    const arrivalDate = form.get('arrivalDate') as string;
    if (departureDate && arrivalDate && arrivalDate < departureDate) {
      setError("Arrival date can't be before the departure date.");
      return;
    }

    setLoading(true);
    const body = {
      transitType: form.get('transitType') || null,
      operator: form.get('operator'),
      routeNumber: form.get('routeNumber') || null,
      fromLocation: form.get('fromLocation') || null,
      toLocation: form.get('toLocation') || null,
      departureDate: form.get('departureDate') || null,
      departureTime: form.get('departureTime') || null,
      arrivalDate: form.get('arrivalDate') || null,
      arrivalTime: form.get('arrivalTime') || null,
      confirmationNumber: needsBooking ? form.get('confirmationNumber') || null : null,
      seatInfo: needsBooking ? form.get('seatInfo') || null : null,
      bookingStatus: needsBooking ? form.get('bookingStatus') : 'unbooked',
      takesReservations: needsBooking ? 1 : 0,
      cost: form.get('cost') ? Number(form.get('cost')) : null,
      currency: form.get('currency') || null,
      notes: form.get('notes') || null,
    };

    const url = isNew
      ? `/api/trips/${tripId}/transit`
      : `/api/trips/${tripId}/transit/${transit.id}`;
    const method = isNew ? 'POST' : 'PATCH';

    const res = await fetch(apiUrl(url), { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) {
      const saved = await res.json();
      onSaved(saved, isNew);
    } else {
      const data = await res.json().catch(() => ({})) as { error?: string };
      setError(data.error ?? 'Something went wrong. Please try again.');
    }
    setLoading(false);
  }

  async function handleDelete() {
    if (!transit) return;
    setDeleting(true);
    const res = await fetch(apiUrl(`/api/trips/${tripId}/transit/${transit.id}`), { method: 'DELETE' });
    if (res.ok) {
      onDeleted(transit.id);
    } else {
      const data = await res.json().catch(() => ({})) as { error?: string };
      setError(data.error ?? 'Failed to delete. Please try again.');
    }
    setDeleting(false);
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>🚆</span> {isNew ? 'Add Transit' : 'Edit Transit'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select name="transitType" defaultValue={transit?.transitType ?? ''}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type">
                    {(v: TransitType | '') => transitTypes.find((t) => t.value === v)?.label ?? 'Select type'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {transitTypes.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="operator">Operator <span className="text-red-400">*</span></Label>
              <Input id="operator" name="operator" defaultValue={transit?.operator ?? ''} required placeholder="e.g. Amtrak, SNCF" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="routeNumber">Route / Train #</Label>
              <Input id="routeNumber" name="routeNumber" defaultValue={transit?.routeNumber ?? ''} placeholder="e.g. NE Regional 95" />
            </div>
            <div className="space-y-1.5">
              <Label>Needs booking?</Label>
              <Select value={needsBooking ? 'yes' : 'no'} onValueChange={(v) => setNeedsBooking(v === 'yes')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="fromLocation">From</Label>
              <Input id="fromLocation" name="fromLocation" defaultValue={transit?.fromLocation ?? ''} placeholder="e.g. New York Penn" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="toLocation">To</Label>
              <Input id="toLocation" name="toLocation" defaultValue={transit?.toLocation ?? ''} placeholder="e.g. Washington Union" />
            </div>
          </div>

          <div className="border-t border-stone-100 pt-3">
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">Departure</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="departureDate">Date</Label>
                <Input id="departureDate" name="departureDate" type="date" defaultValue={transit?.departureDate ?? ''} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="departureTime">Time</Label>
                <Input id="departureTime" name="departureTime" type="time" defaultValue={transit?.departureTime ?? ''} />
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">Arrival</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="arrivalDate">Date</Label>
                <Input id="arrivalDate" name="arrivalDate" type="date" defaultValue={transit?.arrivalDate ?? ''} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="arrivalTime">Time</Label>
                <Input id="arrivalTime" name="arrivalTime" type="time" defaultValue={transit?.arrivalTime ?? ''} />
              </div>
            </div>
          </div>

          {/* A walk-up leg has no confirmation, seat or booking status to record. */}
          {needsBooking && (
            <div className="border-t border-stone-100 pt-3 grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="confirmationNumber">Confirmation #</Label>
                <Input id="confirmationNumber" name="confirmationNumber" defaultValue={transit?.confirmationNumber ?? ''} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="seatInfo">Seat / Coach</Label>
                <Input id="seatInfo" name="seatInfo" defaultValue={transit?.seatInfo ?? ''} placeholder="e.g. Car 4, Seat 22A" />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {needsBooking && (
              <div className="space-y-1.5">
                <Label>Booking Status</Label>
                <Select name="bookingStatus" defaultValue={transit?.bookingStatus ?? 'unbooked'}>
                  <SelectTrigger><SelectValue className="capitalize" /></SelectTrigger>
                  <SelectContent>
                    {bookingStatuses.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="cost">Cost</Label>
              <div className="flex gap-2">
                <Input id="cost" name="cost" type="number" step="0.01" defaultValue={transit?.cost ?? ''} placeholder="0.00" />
                <Input name="currency" aria-label="Currency" defaultValue={transit?.currency ?? 'USD'} className="w-20" />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" defaultValue={transit?.notes ?? ''} rows={2} placeholder="Any additional details…" />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-between pt-2">
            {!isNew ? (
              !confirmDelete ? (
                <Button type="button" variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>Delete</Button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-red-600">Delete this transit?</span>
                  <Button type="button" variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
                    {deleting ? 'Deleting…' : 'Yes, delete'}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                </div>
              )
            ) : <div />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={loading}>{loading ? 'Saving…' : 'Save Transit'}</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
