'use client';

import { useState } from 'react';
import { TripParking, BookingStatus } from '@/types/travel';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlacesInput } from './PlacesInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const bookingStatuses: BookingStatus[] = ['unbooked', 'pending', 'confirmed'];

interface ParkingFormProps {
  tripId: string;
  parking: TripParking | null;
  onSaved: (parking: TripParking, isNew: boolean) => void;
  onDeleted: (parkingId: string) => void;
  onClose: () => void;
}

export function ParkingForm({ tripId, parking, onSaved, onDeleted, onClose }: ParkingFormProps) {
  const isNew = !parking;
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);

    const body = {
      location: form.get('location'),
      address: form.get('address') || null,
      level: form.get('level') || null,
      startDate: form.get('startDate') || null,
      startTime: form.get('startTime') || null,
      endDate: form.get('endDate') || null,
      endTime: form.get('endTime') || null,
      confirmationNumber: form.get('confirmationNumber') || null,
      orderNumber: form.get('orderNumber') || null,
      vendor: form.get('vendor') || null,
      bookingStatus: form.get('bookingStatus'),
      cost: form.get('cost') ? Number(form.get('cost')) : null,
      currency: form.get('currency') || null,
      notes: form.get('notes') || null,
    };

    const url = isNew
      ? `/api/trips/${tripId}/parking-bookings`
      : `/api/trips/${tripId}/parking-bookings/${parking.id}`;
    const method = isNew ? 'POST' : 'PATCH';

    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) {
      const saved = await res.json();
      onSaved(saved, isNew);
    }
    setLoading(false);
  }

  async function handleDelete() {
    if (!parking) return;
    setDeleting(true);
    await fetch(`/api/trips/${tripId}/parking-bookings/${parking.id}`, { method: 'DELETE' });
    onDeleted(parking.id);
    setDeleting(false);
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif flex items-center gap-2">
            <span>🅿️</span> {isNew ? 'Add Parking' : 'Edit Parking'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="location">Location / Facility <span className="text-red-400">*</span></Label>
            <PlacesInput id="location" name="location" defaultValue={parking?.location ?? ''} required placeholder="e.g. O'Hare Rooftop Parking" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="address">Address</Label>
              <PlacesInput id="address" name="address" defaultValue={parking?.address ?? ''} placeholder="Street address" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="level">Level / Spot</Label>
              <Input id="level" name="level" defaultValue={parking?.level ?? ''} placeholder="e.g. 4th Floor, Spot B42" />
            </div>
          </div>

          <div className="border-t border-stone-100 pt-3">
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">Drop-off</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="startDate">Date</Label>
                <Input id="startDate" name="startDate" type="date" defaultValue={parking?.startDate ?? ''} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="startTime">Time</Label>
                <Input id="startTime" name="startTime" type="time" defaultValue={parking?.startTime ?? ''} />
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">Pick-up</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="endDate">Date</Label>
                <Input id="endDate" name="endDate" type="date" defaultValue={parking?.endDate ?? ''} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="endTime">Time</Label>
                <Input id="endTime" name="endTime" type="time" defaultValue={parking?.endTime ?? ''} />
              </div>
            </div>
          </div>

          <div className="border-t border-stone-100 pt-3 grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="confirmationNumber">Confirmation #</Label>
              <Input id="confirmationNumber" name="confirmationNumber" defaultValue={parking?.confirmationNumber ?? ''} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="orderNumber">Order #</Label>
              <Input id="orderNumber" name="orderNumber" defaultValue={parking?.orderNumber ?? ''} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vendor">Vendor / Booked Through</Label>
            <Input id="vendor" name="vendor" defaultValue={parking?.vendor ?? ''} placeholder="e.g. Ticketmaster, SpotHero" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Booking Status</Label>
              <Select name="bookingStatus" defaultValue={parking?.bookingStatus ?? 'unbooked'}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
                <Input id="cost" name="cost" type="number" step="0.01" defaultValue={parking?.cost ?? ''} placeholder="0.00" />
                <Input name="currency" defaultValue={parking?.currency ?? 'USD'} className="w-20" />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" defaultValue={parking?.notes ?? ''} rows={2} placeholder="Any additional details…" />
          </div>

          <div className="flex justify-between pt-2">
            {!isNew ? (
              <Button type="button" variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </Button>
            ) : <div />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={loading}>{loading ? 'Saving…' : 'Save Parking'}</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
