'use client';

import { useState } from 'react';
import { Trip, TripStatus } from '@/types/travel';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlacesInput } from '@/components/itinerary/PlacesInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { CoverImageUpload } from './CoverImageUpload';

const statuses: TripStatus[] = ['planning', 'confirmed', 'in-progress', 'completed'];

interface TripEditFormProps {
  trip: Trip;
  onSaved: (trip: Trip) => void;
  onDeleted: (tripId: string) => void;
  onClose: () => void;
}

export function TripEditForm({ trip, onSaved, onDeleted, onClose }: TripEditFormProps) {
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [travelMode, setTravelMode] = useState<'fly' | 'drive'>(trip.travelMode ?? 'fly');
  const [rentalCarNeeded, setRentalCarNeeded] = useState(trip.rentalCarNeeded ?? false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const body = {
      title: form.get('title'),
      destination: form.get('destination'),
      startDate: form.get('startDate'),
      endDate: form.get('endDate'),
      status: form.get('status'),
      travelMode,
      rentalCarNeeded,
      notes: form.get('notes') || null,
    };
    const res = await fetch(`/api/trips/${trip.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const saved = await res.json();
      onSaved(saved);
    }
    setLoading(false);
  }

  async function handleDelete() {
    setDeleting(true);
    await fetch(`/api/trips/${trip.id}`, { method: 'DELETE' });
    onDeleted(trip.id);
    setDeleting(false);
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif">Edit Trip</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="title">Trip Name <span className="text-red-400">*</span></Label>
            <Input id="title" name="title" defaultValue={trip.title} required placeholder="Summer in Italy" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="destination">Destination <span className="text-red-400">*</span></Label>
            <PlacesInput id="destination" name="destination" defaultValue={trip.destination} required placeholder="Rome, Florence, Venice" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="startDate">Start Date</Label>
              <Input id="startDate" name="startDate" type="date" defaultValue={trip.startDate} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="endDate">End Date</Label>
              <Input id="endDate" name="endDate" type="date" defaultValue={trip.endDate} required />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select name="status" defaultValue={trip.status}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {statuses.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">{s.replace('-', ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>How are you getting there?</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTravelMode('fly')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${travelMode === 'fly' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-stone-200 text-stone-500 hover:border-stone-300'}`}
              >
                ✈ Flying
              </button>
              <button
                type="button"
                onClick={() => setTravelMode('drive')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${travelMode === 'drive' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-stone-200 text-stone-500 hover:border-stone-300'}`}
              >
                🚗 Driving
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="rentalCarNeeded"
              checked={rentalCarNeeded}
              onChange={(e) => setRentalCarNeeded(e.target.checked)}
              className="h-4 w-4 rounded border-stone-300 accent-blue-600"
            />
            <Label htmlFor="rentalCarNeeded" className="cursor-pointer">Rental car needed</Label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" defaultValue={trip.notes ?? ''} rows={3} placeholder="Any trip notes…" />
          </div>

          <CoverImageUpload
            tripId={trip.id}
            currentUrl={trip.coverImageUrl}
            onChanged={(url) => onSaved({ ...trip, coverImageUrl: url })}
          />

          <div className="flex justify-between pt-2">
            {!confirmDelete ? (
              <Button type="button" variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
                Delete Trip
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-600">Delete this trip?</span>
                <Button type="button" variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
                  {deleting ? 'Deleting…' : 'Yes, delete'}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
              </div>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={loading}>{loading ? 'Saving…' : 'Save'}</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
