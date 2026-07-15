'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlacesInput } from '@/components/itinerary/PlacesInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ImagePlus, Home } from 'lucide-react';
import { toast } from '@/components/ui/toast';
import { statusLabel } from '@/lib/trip-status';
import { apiUrl } from '@/lib/api';
import type { TripStatus } from '@/types/travel';

export default function NewTripPage() {
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

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="bg-white border-b border-stone-200 px-6 py-4 pt-[max(1rem,env(safe-area-inset-top))] flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- leaves the Next app for the homepage launcher; must be a real navigation, not client-side routing */}
        <a href="/" className="hidden [@media(display-mode:standalone)]:block text-stone-400 hover:text-stone-700 transition-colors" title="Zo-Bot Home">
          <Home size={18} />
        </a>
        <Link href="/trips" className="text-stone-400 hover:text-stone-700 text-sm">← Back</Link>
        <h1 className="text-2xl font-serif font-bold text-stone-900">New Trip</h1>
      </header>

      <main className="max-w-lg mx-auto px-6 py-10">
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-stone-200 p-8 space-y-5">
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

          <div className="grid grid-cols-2 gap-4">
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
            <span className="text-sm font-medium text-stone-700">Cover Photo</span>
            {coverPreview ? (
              <div className="relative w-full h-32 rounded-lg overflow-hidden border border-stone-200">
                <img src={coverPreview} alt="Cover preview" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => { setCoverFile(null); setCoverPreview(null); }}
                  className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1 hover:bg-black/70"
                >
                  <span className="text-xs px-1">✕</span>
                </button>
              </div>
            ) : (
              <label className="w-full h-24 rounded-lg border-2 border-dashed border-stone-200 hover:border-stone-400 flex flex-col items-center justify-center gap-1.5 text-stone-400 hover:text-stone-600 transition-colors cursor-pointer">
                <ImagePlus className="h-5 w-5" />
                <span className="text-xs">Add cover photo</span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) { setCoverFile(f); setCoverPreview(URL.createObjectURL(f)); }
                }} />
              </label>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Creating…' : 'Create Trip'}
          </Button>
        </form>
      </main>
    </div>
  );
}
