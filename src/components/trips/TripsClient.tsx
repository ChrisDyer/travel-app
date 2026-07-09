'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Trip, TripStatus } from '@/types/travel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TripEditForm } from './TripEditForm';
import { Pencil, Copy } from 'lucide-react';
import { statusColors, statusLabel, tripTiming, localToday } from '@/lib/trip-status';
import { toast } from '@/components/ui/toast';

function formatDateRange(start: string, end: string) {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

type SortKey = 'startDate-desc' | 'startDate-asc' | 'created-desc';

const statuses: TripStatus[] = ['planning', 'confirmed', 'in-progress', 'completed'];

interface TripsClientProps {
  initialTrips: Trip[];
}

export function TripsClient({ initialTrips }: TripsClientProps) {
  const [tripList, setTripList] = useState<Trip[]>(initialTrips);
  const [editing, setEditing] = useState<Trip | null>(null);
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const router = useRouter();

  const [statusFilter, setStatusFilter] = useState<TripStatus | 'all'>(() => {
    if (typeof window === 'undefined') return 'all';
    try {
      const saved = JSON.parse(localStorage.getItem('trips-list-prefs') ?? '{}');
      return saved.statusFilter ?? 'all';
    } catch { return 'all'; }
  });
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>(() => {
    if (typeof window === 'undefined') return 'startDate-desc';
    try {
      const saved = JSON.parse(localStorage.getItem('trips-list-prefs') ?? '{}');
      return saved.sort ?? 'startDate-desc';
    } catch { return 'startDate-desc'; }
  });

  useEffect(() => {
    localStorage.setItem('trips-list-prefs', JSON.stringify({ statusFilter, sort }));
  }, [statusFilter, sort]);

  const today = localToday();

  function handleSaved(updated: Trip) {
    setTripList((prev) => prev.map((t) => t.id === updated.id ? updated : t));
    setEditing(null);
    router.refresh();
    toast('Trip saved');
  }

  function handleUpdated(updated: Trip) {
    setTripList((prev) => prev.map((t) => t.id === updated.id ? updated : t));
    setEditing((prev) => (prev && prev.id === updated.id ? updated : prev)); // keep dialog open with fresh data
  }

  function handleDeleted(tripId: string) {
    setTripList((prev) => prev.filter((t) => t.id !== tripId));
    setEditing(null);
    router.refresh();
    toast('Trip deleted');
  }

  async function handleDuplicate(trip: Trip) {
    if (duplicating) return;
    setDuplicating(trip.id);
    try {
      const res = await fetch(`/api/trips/${trip.id}/duplicate`, { method: 'POST' });
      if (!res.ok) throw new Error();
      const copy = await res.json() as Trip;
      toast('Trip duplicated');
      router.push(`/trips/${copy.id}`);
    } catch {
      toast('Could not duplicate the trip. Please try again.', 'error');
    } finally {
      setDuplicating(null);
    }
  }

  if (tripList.length === 0) {
    return (
      <div className="text-center py-24 text-stone-400">
        <p className="text-lg">No trips yet.</p>
        <Link href="/trips/new">
          <Button variant="outline" className="mt-4">Plan your first trip</Button>
        </Link>
      </div>
    );
  }

  function clearFilters() {
    setStatusFilter('all');
    setQuery('');
    setSort('startDate-desc');
  }

  const visible = tripList
    .filter((t) => statusFilter === 'all' || t.status === statusFilter)
    .filter((t) => {
      const q = query.trim().toLowerCase();
      return !q || t.title.toLowerCase().includes(q) || t.destination.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (sort === 'startDate-asc') return a.startDate.localeCompare(b.startDate);
      if (sort === 'created-desc') return (b.createdAt as string ?? '').localeCompare(a.createdAt as string ?? '');
      return b.startDate.localeCompare(a.startDate);
    });

  return (
    <>
      <div className="no-print flex flex-wrap items-center gap-3 mb-4">
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setStatusFilter('all')}
            className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize transition-colors ${statusFilter === 'all' ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-500 hover:bg-stone-200'}`}
          >
            All
          </button>
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize transition-colors ${statusFilter === s ? statusColors[s] : 'bg-stone-100 text-stone-400 hover:bg-stone-200'}`}
            >
              {statusLabel(s)}
            </button>
          ))}
        </div>

        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search trips…"
          className="w-48"
        />

        <Select value={sort} onValueChange={(v) => { if (v) setSort(v as SortKey); }}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="startDate-desc">Newest trips first</SelectItem>
            <SelectItem value="startDate-asc">Oldest trips first</SelectItem>
            <SelectItem value="created-desc">Recently created</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {visible.length === 0 ? (
        <div className="text-center py-16 text-stone-400">
          <p>No trips match — try clearing your filters.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={clearFilters}>Clear filters</Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {visible.map((trip) => (
            <div key={trip.id} className="bg-white rounded-xl border border-stone-200 hover:border-stone-400 hover:shadow-sm transition-all overflow-hidden">
              <Link href={`/trips/${trip.id}`} className="flex items-stretch">
                {trip.coverImageUrl && (
                  <div className="w-32 shrink-0">
                    <img src={trip.coverImageUrl} alt={trip.title} className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="flex-1 p-6 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="text-xl font-serif font-semibold text-stone-900">{trip.title}</h2>
                      <p className="text-stone-500 mt-0.5">{trip.destination}</p>
                      <p className="text-sm text-stone-400 mt-1">
                        {formatDateRange(trip.startDate, trip.endDate)} <span className="text-xs text-stone-400">· {tripTiming(trip.startDate, trip.endDate, today)}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${statusColors[trip.status] ?? statusColors.planning}`}>
                        {trip.status.replace('-', ' ')}
                      </span>
                      <button
                        className="p-1.5 rounded-md text-stone-300 hover:text-stone-600 hover:bg-stone-100 transition-colors"
                        onClick={(e) => { e.preventDefault(); handleDuplicate(trip); }}
                        aria-label="Duplicate trip"
                        disabled={duplicating === trip.id}
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <button
                        className="p-1.5 rounded-md text-stone-300 hover:text-stone-600 hover:bg-stone-100 transition-colors"
                        onClick={(e) => { e.preventDefault(); setEditing(trip); }}
                        aria-label="Edit trip"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <TripEditForm
          trip={editing}
          onSaved={handleSaved}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
