'use client';

import { useState } from 'react';
import { TripHotel, BookingStatus } from '@/types/travel';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlacesInput } from './PlacesInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { apiUrl } from '@/lib/api';

const bookingStatuses: BookingStatus[] = ['unbooked', 'pending', 'confirmed'];

interface HotelFormProps {
  tripId: string;
  hotel: TripHotel | null;
  onSaved: (hotel: TripHotel, isNew: boolean) => void;
  onDeleted: (hotelId: string) => void;
  onClose: () => void;
}

export function HotelForm({ tripId, hotel, onSaved, onDeleted, onClose }: HotelFormProps) {
  const isNew = !hotel;
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const form = new FormData(e.currentTarget);

    const checkIn = form.get('checkInDate') as string;
    const checkOut = form.get('checkOutDate') as string;
    if (checkIn && checkOut && checkOut < checkIn) {
      setError('Check-out date must be on or after check-in date.');
      return;
    }

    setLoading(true);
    const body = {
      name: form.get('name'),
      address: form.get('address') || null,
      locationUrl: form.get('locationUrl') || null,
      checkInDate: form.get('checkInDate') || null,
      checkInTime: form.get('checkInTime') || null,
      checkOutDate: form.get('checkOutDate') || null,
      checkOutTime: form.get('checkOutTime') || null,
      confirmationNumber: form.get('confirmationNumber') || null,
      roomType: form.get('roomType') || null,
      amenities: form.get('amenities') || null,
      bookingStatus: form.get('bookingStatus'),
      cancellationPolicy: form.get('cancellationPolicy') || null,
      cancellationDeadline: form.get('cancellationDeadline') || null,
      cost: form.get('cost') ? Number(form.get('cost')) : null,
      currency: form.get('currency') || null,
      notes: form.get('notes') || null,
    };

    const url = isNew ? `/api/trips/${tripId}/hotels` : `/api/trips/${tripId}/hotels/${hotel.id}`;
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
    if (!hotel) return;
    setDeleting(true);
    const res = await fetch(apiUrl(`/api/trips/${tripId}/hotels/${hotel.id}`), { method: 'DELETE' });
    if (res.ok) {
      onDeleted(hotel.id);
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
            <span>🏨</span> {isNew ? 'Add Hotel' : 'Edit Hotel'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">Hotel Name <span className="text-red-400">*</span></Label>
            <Input id="name" name="name" defaultValue={hotel?.name ?? ''} required placeholder="e.g. Hyatt House Atlanta/Downtown" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="address">Address</Label>
            <PlacesInput id="address" name="address" defaultValue={hotel?.address ?? ''} placeholder="e.g. 431 Marietta St NW, Atlanta, GA" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="locationUrl">Website / Maps URL</Label>
            <Input id="locationUrl" name="locationUrl" type="url" defaultValue={hotel?.locationUrl ?? ''} placeholder="https://" />
          </div>

          <div className="border-t border-stone-100 pt-3">
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">Check-in</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="checkInDate">Date</Label>
                <Input id="checkInDate" name="checkInDate" type="date" defaultValue={hotel?.checkInDate ?? ''} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="checkInTime">Time</Label>
                <Input id="checkInTime" name="checkInTime" type="time" defaultValue={hotel?.checkInTime ?? ''} />
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">Check-out</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="checkOutDate">Date</Label>
                <Input id="checkOutDate" name="checkOutDate" type="date" defaultValue={hotel?.checkOutDate ?? ''} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="checkOutTime">Time</Label>
                <Input id="checkOutTime" name="checkOutTime" type="time" defaultValue={hotel?.checkOutTime ?? ''} />
              </div>
            </div>
          </div>

          <div className="border-t border-stone-100 pt-3 grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="confirmationNumber">Confirmation #</Label>
              <Input id="confirmationNumber" name="confirmationNumber" defaultValue={hotel?.confirmationNumber ?? ''} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="roomType">Room Type</Label>
              <Input id="roomType" name="roomType" defaultValue={hotel?.roomType ?? ''} placeholder="e.g. King + Cozy Corner" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="amenities">Amenities</Label>
            <Input id="amenities" name="amenities" defaultValue={hotel?.amenities ?? ''} placeholder="e.g. Free hot breakfast, Valet only" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Booking Status</Label>
              <Select name="bookingStatus" defaultValue={hotel?.bookingStatus ?? 'unbooked'}>
                <SelectTrigger><SelectValue className="capitalize" /></SelectTrigger>
                <SelectContent>
                  {bookingStatuses.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cancellationPolicy">Cancellation</Label>
              <Input id="cancellationPolicy" name="cancellationPolicy" defaultValue={hotel?.cancellationPolicy ?? ''} placeholder="e.g. 30 days prior" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="cancellationDeadline">Cancel By</Label>
              <Input id="cancellationDeadline" name="cancellationDeadline" type="date" defaultValue={hotel?.cancellationDeadline ?? ''} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cost">Cost</Label>
              <div className="flex gap-2">
                <Input id="cost" name="cost" type="number" step="0.01" defaultValue={hotel?.cost ?? ''} placeholder="0.00" />
                <Input name="currency" aria-label="Currency" defaultValue={hotel?.currency ?? 'USD'} className="w-20" />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" defaultValue={hotel?.notes ?? ''} rows={2} placeholder="Any additional details…" />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-between pt-2">
            {!isNew ? (
              !confirmDelete ? (
                <Button type="button" variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>Delete</Button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-red-600">Delete this hotel?</span>
                  <Button type="button" variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
                    {deleting ? 'Deleting…' : 'Yes, delete'}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                </div>
              )
            ) : <div />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={loading}>{loading ? 'Saving…' : 'Save Hotel'}</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
