'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Trip } from '@/types/travel';
import { Button } from '@/components/ui/button';
import { TripEditForm } from './TripEditForm';
import { Pencil } from 'lucide-react';
import { statusColors } from '@/lib/trip-status';

function formatDateRange(start: string, end: string) {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

interface TripsClientProps {
  initialTrips: Trip[];
}

export function TripsClient({ initialTrips }: TripsClientProps) {
  const [tripList, setTripList] = useState<Trip[]>(initialTrips);
  const [editing, setEditing] = useState<Trip | null>(null);
  const router = useRouter();

  function handleSaved(updated: Trip) {
    setTripList((prev) => prev.map((t) => t.id === updated.id ? updated : t));
    setEditing(null);
  }

  function handleDeleted(tripId: string) {
    setTripList((prev) => prev.filter((t) => t.id !== tripId));
    setEditing(null);
    router.refresh();
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

  return (
    <>
      <div className="grid gap-4">
        {tripList.map((trip) => (
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
                    <p className="text-sm text-stone-400 mt-1">{formatDateRange(trip.startDate, trip.endDate)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${statusColors[trip.status] ?? statusColors.planning}`}>
                      {trip.status.replace('-', ' ')}
                    </span>
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

      {editing && (
        <TripEditForm
          trip={editing}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
