'use client';

import { useRef, useState } from 'react';
import { Trip, TripStatus } from '@/types/travel';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlacesInput } from '@/components/itinerary/PlacesInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { CoverImageUpload } from './CoverImageUpload';
import { statusLabel } from '@/lib/trip-status';

/** Every zone this browser's ICU knows. Computed once at module load — the list is ~400 entries
 *  and never changes during a session. */
const timeZones: string[] = Intl.supportedValuesOf('timeZone');
import { apiUrl } from '@/lib/api';
import { useReadOnly } from '@/lib/read-only';

const statuses: TripStatus[] = ['planning', 'confirmed', 'in-progress', 'completed'];
const weekDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface TripEditFormProps {
  trip: Trip;
  onSaved: (trip: Trip) => void;
  /** Data changed outside the main form flow (e.g. cover photo) — update caches, do NOT close. */
  onUpdated?: (trip: Trip) => void;
  onDeleted: (tripId: string) => void;
  onClose: () => void;
}

export function TripEditForm({ trip, onSaved, onUpdated, onDeleted, onClose }: TripEditFormProps) {
  const readOnly = useReadOnly();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmShorten, setConfirmShorten] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState('');
  const [travelMode, setTravelMode] = useState<'fly' | 'drive'>(trip.travelMode ?? 'fly');
  const [rentalCarNeeded, setRentalCarNeeded] = useState(!!trip.rentalCarNeeded);
  const [digestEnabled, setDigestEnabled] = useState(!!trip.digestEnabled);

  let initialTravelers = '';
  try { initialTravelers = (JSON.parse((trip.travelers as string) ?? '[]') as string[]).join(', '); } catch { /* keep '' */ }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    submit(new FormData(e.currentTarget), false);
  }

  async function submit(form: FormData, shortenAcknowledged: boolean) {
    setError('');

    const startDate = form.get('startDate') as string;
    const endDate = form.get('endDate') as string;
    if (startDate && endDate && endDate < startDate) {
      setError('End date must be on or after start date.');
      return;
    }
    if (startDate && endDate && endDate < trip.endDate && !shortenAcknowledged) {
      setConfirmShorten(true);
      return;
    }
    setConfirmShorten(false);

    setLoading(true);
    const body = {
      title: form.get('title'),
      destination: form.get('destination'),
      // '' means "auto" — store NULL so the resolved_timezone cache is used instead.
      timezone: (form.get('timezone') as string) || null,
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
      const res = await fetch(apiUrl(`/api/trips/${trip.id}`), {
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
      const res = await fetch(apiUrl(`/api/trips/${trip.id}`), { method: 'DELETE' });
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

  // Shouldn't be reachable — every caller gates opening this form behind
  // useReadOnly() — but guard the render directly as defense in depth.
  if (readOnly) return null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Trip</DialogTitle>
        </DialogHeader>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="title">Trip Name <span className="text-red-400">*</span></Label>
            <Input id="title" name="title" defaultValue={trip.title} required placeholder="Summer in Italy" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="destination">Destination <span className="text-red-400">*</span></Label>
            <PlacesInput id="destination" name="destination" defaultValue={trip.destination} required placeholder="Rome, Florence, Venice" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="timezone">Timezone</Label>
            {/* Calendar feeds publish absolute instants, so a wall time needs a zone. Normally it
                comes from geocoding the destination — this is the override for when that guesses
                wrong (an ambiguous name like "Washington" resolves to DC, not Seattle) or fails. */}
            <select
              id="timezone"
              name="timezone"
              defaultValue={trip.timezone ?? ''}
              className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm"
            >
              <option value="">Auto (from destination)</option>
              {timeZones.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
            <p className="text-xs text-muted-foreground">
              {trip.timezone
                ? 'Calendar times for this trip use this zone.'
                : trip.resolvedTimezone
                  ? `Auto-detected as ${trip.resolvedTimezone}. Set it explicitly if that is wrong.`
                  : 'Not detected yet — timed items publish to calendars as all-day until it is.'}
            </p>
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
              <SelectTrigger>
                <SelectValue className="capitalize">{(v: TripStatus) => statusLabel(v)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {statuses.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">{statusLabel(s)}</SelectItem>
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
                <SelectTrigger>
                  <SelectValue>{(v: string) => weekDays[Number(v)]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {weekDays.map((d, i) => (
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

          {confirmShorten && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
              <p className="text-sm text-red-700">
                Shortening <span className="font-medium">{trip.title}</span> removes days from the end,
                and any events on those days will be permanently deleted.
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={loading}
                  onClick={() => formRef.current && submit(new FormData(formRef.current), true)}
                >
                  Shorten trip
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setConfirmShorten(false)}>
                  Keep current dates
                </Button>
              </div>
            </div>
          )}

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
