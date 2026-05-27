'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trip } from '@/types/travel';
import { Button } from '@/components/ui/button';
import { TripEditForm } from './TripEditForm';
import { Pencil } from 'lucide-react';

interface TripHeaderActionsProps {
  trip: Trip;
}

export function TripHeaderActions({ trip }: TripHeaderActionsProps) {
  const [editing, setEditing] = useState(false);
  const router = useRouter();

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setEditing(true)} className="text-stone-500 hover:text-stone-800">
        <Pencil className="h-4 w-4 mr-1" />
        Edit
      </Button>

      {editing && (
        <TripEditForm
          trip={trip}
          onSaved={(_updated) => { setEditing(false); router.refresh(); }}
          onDeleted={() => router.push('/trips')}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}
