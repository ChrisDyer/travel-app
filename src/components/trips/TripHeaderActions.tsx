'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trip } from '@/types/travel';
import { Button } from '@/components/ui/button';
import { TripEditForm } from './TripEditForm';
import { TripMoreMenu } from './TripMoreMenu';
import { Pencil } from 'lucide-react';
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
      <span className="max-sm:hidden text-xs text-stone-400">{tripTiming(trip.startDate, trip.endDate, localToday())}</span>

      <Button variant="ghost" size="sm" onClick={() => setEditing(true)} className="text-stone-500 hover:text-stone-800">
        <Pencil className="h-4 w-4 mr-1" />
        Edit
      </Button>

      <TripMoreMenu trip={trip} />

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
