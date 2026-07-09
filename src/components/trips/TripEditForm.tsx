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
  /** Data changed outside the main form flow (e.g. cover photo) — update caches, do NOT close. */
  onUpdated?: (trip: Trip) => void;
  onDeleted: (tripId: string) => void;
  onClose: () => void;
}

export function TripEditForm({ trip, onSaved, onUpdated, onDeleted, onClose }: TripEditFormProps) {
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const [travelMode, setTravelMode] = useState<'fly' | 'drive'>(trip.travelMode ?? 'fly');
  const [rentalCarNeeded, setRentalCarNeeded] = useState(!!trip.rentalCarNeeded);
  const [digestEnabled, setDigestEnabled] = useState(!!trip.digestEnabled);

  let initialTravelers = '';
  try { initialTravelers = (JSON.parse((trip.travelers as string) ?? '[]') as string[]).join(', '); } catch { /* keep '' */ }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const form = new FormData(e.currentTarget);

    const startDate = form.get('startDate') as string;
    const endDate = form.get('endDate') as string;
    if (startDate && endDate && endDate < startDate) {
      setError('End date must be on or after start date.');
      return;
    }
    if (startDate && endDate && endDate < trip.endDate) {
      const proceed = window.confirm('Shortening the trip will remove days from the end. Any events on removed days will be PERMANENTLY DELETED. Continue?');
      if (!proceed) return;
    }

    setLoading(true);
    const body = {
      title: form.get('title'),
      destination: form.get('destination'),
      startDate,
      endDate,
      status: form.get('status'),
      travelMode,
      rentalCarNeeded,
      budget: form.get('budget') ? Number(form.get('budget')) : null,
      budgetCurrency: (form.get('budgetCurrency') as string)?.trim().toUpperCase() || null,
      notes: form.get('notes') || null,
      travelers: JSON.stringify(
        ((form.get('travelers') as string) ?? '').split(',').map((t) => t.trim()).filter(Boolean)
      ),
      digestEnabled,
      digestDayOfWeek: Number(form.get('digestDayOfWeek') ?? trip.digestDayOfWeek ?? 1),
    };
    try {
      const res = await fetch(`/api/trips/${trip.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const saved = await res.json();
        onSaved(saved);
      } else {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? 'Something went wrong. Please try again.');
      }
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    setError('');
    setDeleting(true);
    try {
      const res = await fetch(`/api/trips/${trip.id}`, { method: 'DELETE' });
      if (res.ok || res.status === 404) {
        onDeleted(trip.id);
      } else {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? 'Failed to delete trip. Please try again.');
      }
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setDeleting(false);
    }
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

          <div className="space-y-1.5">
            <Label htmlFor="travelers">Travelers</Label>
            <Input id="travelers" name="travelers" defaultValue={initialTravelers} placeholder="Chris, Sam (comma-separated)" />
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

          <div className="grid grid-cols-[1fr_120px] gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="budget">Budget (optional)</Label>
              <Input id="budget" name="budget" type="number" min="0" step="1" defaultValue={trip.budget ?? ''} placeholder="3000" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="budgetCurrency">Currency</Label>
              <Input id="budgetCurrency" name="budgetCurrency" maxLength={3} defaultValue={trip.budgetCurrency ?? 'USD'} placeholder="USD" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" defaultValue={trip.notes ?? ''} rows={3} placeholder="Any trip notes…" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="digestEnabled"
                checked={digestEnabled}
                onChange={(e) => setDigestEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-stone-300 accent-blue-600"
              />
              <Label htmlFor="digestEnabled" className="cursor-pointer">Weekly email digest</Label>
            </div>
            {digestEnabled && (
              <Select name="digestDayOfWeek" defaultValue={String(trip.digestDayOfWeek ?? 1)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((d, i) => (
                    <SelectItem key={d} value={String(i)}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <CoverImageUpload
            tripId={trip.id}
            currentUrl={trip.coverImageUrl}
            onChanged={(url) => onUpdated?.({ ...trip, coverImageUrl: url })}
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

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
