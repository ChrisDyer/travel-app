'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trip, TripStatus } from '@/types/travel';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { localToday } from '@/lib/trip-status';

export function TripStatusNudge({ trip }: { trip: Trip }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [dismissed, setDismissed] = useState(
    () => typeof window !== 'undefined' && sessionStorage.getItem(`nudge-${trip.id}`) === '1'
  );

  const today = localToday();
  let suggestion: { status: TripStatus; text: string; cta: string } | null = null;
  if (trip.endDate < today && trip.status !== 'completed') {
    suggestion = { status: 'completed', text: 'This trip has ended.', cta: 'Mark completed' };
  } else if (trip.startDate <= today && today <= trip.endDate && (trip.status === 'confirmed' || trip.status === 'planning')) {
    suggestion = { status: 'in-progress', text: 'This trip is underway.', cta: 'Mark in progress' };
  }
  if (!suggestion || dismissed) return null;

  async function apply() {
    setSaving(true);
    try {
      const res = await fetch(`/api/trips/${trip.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: suggestion!.status }),
      });
      if (!res.ok) throw new Error();
      toast(`Status updated to ${suggestion!.status.replace('-', ' ')}`);
      router.refresh();
    } catch {
      toast('Could not update status. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  }

  function dismiss() {
    sessionStorage.setItem(`nudge-${trip.id}`, '1');
    setDismissed(true);
  }

  return (
    <div className="no-print mb-6 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5">
      <p className="text-sm text-stone-700">{suggestion.text}</p>
      <div className="flex items-center gap-2 shrink-0">
        <Button size="sm" onClick={apply} disabled={saving}>{saving ? 'Saving…' : suggestion.cta}</Button>
        <button onClick={dismiss} className="text-stone-400 hover:text-stone-600 text-sm" aria-label="Dismiss">✕</button>
      </div>
    </div>
  );
}
