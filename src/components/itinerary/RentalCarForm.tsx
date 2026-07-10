'use client';

import { useState } from 'react';
import { TripRentalCar, BookingStatus } from '@/types/travel';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlacesInput } from './PlacesInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const bookingStatuses: BookingStatus[] = ['unbooked', 'pending', 'confirmed'];

interface RentalCarFormProps {
  tripId: string;
  rentalCar: TripRentalCar | null;
  onSaved: (rentalCar: TripRentalCar, isNew: boolean) => void;
  onDeleted: (rentalCarId: string) => void;
  onClose: () => void;
}

export function RentalCarForm({ tripId, rentalCar, onSaved, onDeleted, onClose }: RentalCarFormProps) {
  const isNew = !rentalCar;
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const form = new FormData(e.currentTarget);

    const pickupDate = form.get('pickupDate') as string;
    const dropoffDate = form.get('dropoffDate') as string;
    if (pickupDate && dropoffDate && dropoffDate < pickupDate) {
      setError("Drop-off date can't be before pick-up.");
      return;
    }

    setLoading(true);
    const body = {
      company: form.get('company'),
      carClass: form.get('carClass') || null,
      confirmationNumber: form.get('confirmationNumber') || null,
      pickupDate: form.get('pickupDate') || null,
      pickupTime: form.get('pickupTime') || null,
      pickupLocation: form.get('pickupLocation') || null,
      dropoffDate: form.get('dropoffDate') || null,
      dropoffTime: form.get('dropoffTime') || null,
      dropoffLocation: form.get('dropoffLocation') || null,
      driverName: form.get('driverName') || null,
      bookingStatus: form.get('bookingStatus'),
      cancellationPolicy: form.get('cancellationPolicy') || null,
      cost: form.get('cost') ? Number(form.get('cost')) : null,
      currency: form.get('currency') || null,
      notes: form.get('notes') || null,
    };

    const url = isNew
      ? `/api/trips/${tripId}/rental-cars`
      : `/api/trips/${tripId}/rental-cars/${rentalCar.id}`;
    const method = isNew ? 'POST' : 'PATCH';

    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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
    if (!rentalCar) return;
    setDeleting(true);
    const res = await fetch(`/api/trips/${tripId}/rental-cars/${rentalCar.id}`, { method: 'DELETE' });
    if (res.ok) {
      onDeleted(rentalCar.id);
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
          <DialogTitle className="font-serif flex items-center gap-2">
            <span>🚗</span> {isNew ? 'Add Rental Car' : 'Edit Rental Car'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="company">Company <span className="text-red-400">*</span></Label>
              <Input id="company" name="company" defaultValue={rentalCar?.company ?? ''} required placeholder="e.g. Hertz, Enterprise" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="carClass">Car Class</Label>
              <Input id="carClass" name="carClass" defaultValue={rentalCar?.carClass ?? ''} placeholder="e.g. Economy, SUV" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="confirmationNumber">Confirmation #</Label>
              <Input id="confirmationNumber" name="confirmationNumber" defaultValue={rentalCar?.confirmationNumber ?? ''} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="driverName">Driver Name</Label>
              <Input id="driverName" name="driverName" defaultValue={rentalCar?.driverName ?? ''} />
            </div>
          </div>

          <div className="border-t border-stone-100 pt-3">
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">Pick-up</p>
            <div className="space-y-1.5 mb-3">
              <Label htmlFor="pickupLocation">Location</Label>
              <PlacesInput id="pickupLocation" name="pickupLocation" defaultValue={rentalCar?.pickupLocation ?? ''} placeholder="e.g. O'Hare Airport Terminal 2" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="pickupDate">Date</Label>
                <Input id="pickupDate" name="pickupDate" type="date" defaultValue={rentalCar?.pickupDate ?? ''} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pickupTime">Time</Label>
                <Input id="pickupTime" name="pickupTime" type="time" defaultValue={rentalCar?.pickupTime ?? ''} />
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">Drop-off</p>
            <div className="space-y-1.5 mb-3">
              <Label htmlFor="dropoffLocation">Location</Label>
              <PlacesInput id="dropoffLocation" name="dropoffLocation" defaultValue={rentalCar?.dropoffLocation ?? ''} placeholder="e.g. Downtown Chicago" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="dropoffDate">Date</Label>
                <Input id="dropoffDate" name="dropoffDate" type="date" defaultValue={rentalCar?.dropoffDate ?? ''} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dropoffTime">Time</Label>
                <Input id="dropoffTime" name="dropoffTime" type="time" defaultValue={rentalCar?.dropoffTime ?? ''} />
              </div>
            </div>
          </div>

          <div className="border-t border-stone-100 pt-3 space-y-1.5">
            <Label htmlFor="cancellationPolicy">Cancellation Policy</Label>
            <Input id="cancellationPolicy" name="cancellationPolicy" defaultValue={rentalCar?.cancellationPolicy ?? ''} placeholder="e.g. Free cancellation before pickup" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Booking Status</Label>
              <Select name="bookingStatus" defaultValue={rentalCar?.bookingStatus ?? 'unbooked'}>
                <SelectTrigger><SelectValue className="capitalize" /></SelectTrigger>
                <SelectContent>
                  {bookingStatuses.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cost">Cost</Label>
              <div className="flex gap-2">
                <Input id="cost" name="cost" type="number" step="0.01" defaultValue={rentalCar?.cost ?? ''} placeholder="0.00" />
                <Input name="currency" aria-label="Currency" defaultValue={rentalCar?.currency ?? 'USD'} className="w-20" />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" defaultValue={rentalCar?.notes ?? ''} rows={2} placeholder="Any additional details…" />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-between pt-2">
            {!isNew ? (
              !confirmDelete ? (
                <Button type="button" variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>Delete</Button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-red-600">Delete this rental car?</span>
                  <Button type="button" variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
                    {deleting ? 'Deleting…' : 'Yes, delete'}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                </div>
              )
            ) : <div />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={loading}>{loading ? 'Saving…' : 'Save Rental Car'}</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
