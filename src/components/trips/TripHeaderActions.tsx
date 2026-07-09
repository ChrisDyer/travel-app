'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trip } from '@/types/travel';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TripEditForm } from './TripEditForm';
import { Pencil, CalendarPlus } from 'lucide-react';
import { toast } from '@/components/ui/toast';
import { tripTiming, localToday } from '@/lib/trip-status';

interface TripHeaderActionsProps {
  trip: Trip;
}

export function TripHeaderActions({ trip }: TripHeaderActionsProps) {
  const [editing, setEditing] = useState(false);
  const router = useRouter();

  return (
    <>
      <span className="text-xs text-stone-400">{tripTiming(trip.startDate, trip.endDate, localToday())}</span>

      <a
        href={`/api/trips/${trip.id}/export`}
        title="Download itinerary as a calendar (.ics) file"
        className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'text-stone-500 hover:text-stone-800')}
      >
        <CalendarPlus className="h-4 w-4 mr-1" />
        Export
      </a>

      <Button variant="ghost" size="sm" onClick={() => setEditing(true)} className="text-stone-500 hover:text-stone-800">
        <Pencil className="h-4 w-4 mr-1" />
        Edit
      </Button>

      {editing && (
        <TripEditForm
          trip={trip}
          onSaved={() => { setEditing(false); router.refresh(); toast('Trip saved'); }}
          onUpdated={() => router.refresh()}
          onDeleted={() => router.push('/trips')}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}
