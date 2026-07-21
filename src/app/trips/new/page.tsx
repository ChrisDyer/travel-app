'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlacesInput } from '@/components/itinerary/PlacesInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ImagePlus, Plane, Car } from 'lucide-react';
import { toast } from '@/components/ui/toast';
import { statusLabel } from '@/lib/trip-status';
import { apiUrl } from '@/lib/api';
import { TravelShell } from '@/appShell/TravelShell';
import type { TripStatus } from '@/types/travel';
import { useReadOnly } from '@/lib/read-only';

export default function NewTripPage() {
  const readOnly = useReadOnly();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [travelMode, setTravelMode] = useState<'fly' | 'drive'>('fly');
  const [rentalCarNeeded, setRentalCarNeeded] = useState(false);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

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

    setLoading(true);
    const body = {
      title: form.get('title'),
      destination: form.get('destination'),
      startDate: form.get('startDate'),
      endDate: form.get('endDate'),
      status: form.get('status'),
      travelMode,
      rentalCarNeeded,
      travelers: JSON.stringify(
        ((form.get('travelers') as string) ?? '').split(',').map((t) => t.trim()).filter(Boolean)
      ),
    };

    const res = await fetch(apiUrl('/api/trips'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const trip = await res.json();
      if (coverFile) {
        try {
          const fd = new FormData();
          fd.append('file', coverFile);
          const imgRes = await fetch(apiUrl(`/api/trips/${trip.id}/cover-image`), { method: 'POST', body: fd });
          if (!imgRes.ok) {
            toast('Trip created, but the cover photo failed to upload. Add it from Edit Trip.', 'error');
          }
        } catch {
          toast('Trip created, but the cover photo failed to upload. Add it from Edit Trip.', 'error');
        }
      }
      router.push(`/trips/${trip.id}`);
    } else {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  // Shouldn't be reachable — NewTripAction is hidden for read-only users — but guard a
  // direct /trips/new visit as defense in depth (records-app Phase 3 precedent).
  if (readOnly) {
    return (
      <TravelShell
        title="New Trip"
        backHref="/trips"
        backLabel="Trips"
        activeLocalNav="new"
        contentClassName="max-w-lg"
      >
        <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
          New trip unavailable — this account is read-only.
        </p>
      </TravelShell>
    );
  }

  return (
    <TravelShell
      title="New Trip"
      subtitle="Create the itinerary shell before adding bookings"
      backHref="/trips"
      backLabel="Trips"
      activeLocalNav="new"
      contentClassName="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="space-y-1.5">
          <Label htmlFor="title">Trip Name</Label>
          <Input id="title" name="title" placeholder="Summer in Italy" required />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="destination">Destination</Label>
          <PlacesInput id="destination" name="destination" placeholder="Rome, Florence, Venice" required />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="travelers">Travelers</Label>
          <Input id="travelers" name="travelers" placeholder="Chris, Sam (comma-separated)" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="startDate">Start Date</Label>
            <Input id="startDate" name="startDate" type="date" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="endDate">End Date</Label>
            <Input id="endDate" name="endDate" type="date" required />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="status">Status</Label>
          <Select name="status" defaultValue="planning">
            <SelectTrigger id="status">
              <SelectValue className="capitalize">{(v: TripStatus) => statusLabel(v)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="planning">Planning</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="in-progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>How are you getting there?</Label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTravelMode('fly')}
              className={`inline-flex min-h-10 items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 ${travelMode === 'fly' ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'}`}
            >
              <Plane className="h-4 w-4" aria-hidden="true" />
              Flying
            </button>
            <button
              type="button"
              onClick={() => setTravelMode('drive')}
              className={`inline-flex min-h-10 items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 ${travelMode === 'drive' ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'}`}
            >
              <Car className="h-4 w-4" aria-hidden="true" />
              Driving
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="rentalCarNeeded"
            checked={rentalCarNeeded}
            onChange={(e) => setRentalCarNeeded(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 accent-blue-600"
          />
          <Label htmlFor="rentalCarNeeded" className="cursor-pointer">Rental car needed</Label>
        </div>

        <div className="space-y-1.5">
          <span className="text-sm font-medium text-slate-700">Cover Photo</span>
          {coverPreview ? (
            <div className="relative h-32 w-full overflow-hidden rounded-lg border border-slate-200">
              <img src={coverPreview} alt="Cover preview" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => { setCoverFile(null); setCoverPreview(null); }}
                className="absolute right-2 top-2 rounded-full bg-slate-950/60 p-1 text-white hover:bg-slate-950/80"
                aria-label="Remove cover photo"
              >
                <span className="px-1 text-xs">x</span>
              </button>
            </div>
          ) : (
            <label className="flex h-24 w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-slate-200 text-slate-400 transition-colors hover:border-slate-400 hover:text-slate-600">
              <ImagePlus className="h-5 w-5" />
              <span className="text-xs">Add cover photo</span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) { setCoverFile(f); setCoverPreview(URL.createObjectURL(f)); }
              }} />
            </label>
          )}
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Creating...' : 'Create Trip'}
        </Button>
      </form>
    </TravelShell>
  );
}
