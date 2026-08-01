'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Edit2, Plus, Trash2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { PlacesInput } from '@/components/itinerary/PlacesInput';
import type { Trip, TripHotel, TripLeg } from '@/types/travel';
import { apiUrl } from '@/lib/api';
import { fmtShortDate, nextDay, previousDay } from '@/lib/dates';
import { legWarnings } from '@/lib/legs';
import { useReadOnly } from '@/lib/read-only';

interface TripLegsProps {
  trip: Trip;
  initialLegs: TripLeg[];
  hotels: TripHotel[];
}

interface LegDraft {
  id?: string;
  place: string;
  startDate: string;
  endDate: string;
  sortOrder: number;
}

function sortedLegs(legs: TripLeg[]): TripLeg[] {
  return [...legs].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

function dateRange(startDate: string, endDate: string): string {
  const start = fmtShortDate(startDate) ?? startDate;
  const end = fmtShortDate(endDate) ?? endDate;
  return startDate === endDate ? start : `${start} - ${end}`;
}

function defaultDraft(trip: Trip, legs: TripLeg[]): LegDraft {
  const ordered = sortedLegs(legs);
  const last = ordered.at(-1);
  const startDate = last ? (nextDay(last.endDate) > trip.endDate ? trip.endDate : nextDay(last.endDate)) : trip.startDate;
  return { place: '', startDate, endDate: startDate > trip.endDate ? startDate : trip.endDate, sortOrder: 0 };
}

function cityish(address: string): string {
  const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 3) return parts[parts.length - 3];
  if (parts.length >= 2) return parts[parts.length - 2];
  return address.trim();
}

function proposalsFromHotels(hotels: TripHotel[]): LegDraft[] {
  const proposals = hotels
    .filter((hotel) => hotel.address && hotel.checkInDate)
    .sort((a, b) => (a.checkInDate ?? '').localeCompare(b.checkInDate ?? ''))
    .map((hotel) => {
      const startDate = hotel.checkInDate!;
      const checkoutMinusOne = hotel.checkOutDate ? previousDay(hotel.checkOutDate) : startDate;
      const endDate = checkoutMinusOne < startDate ? startDate : checkoutMinusOne;
      return { place: cityish(hotel.address!), startDate, endDate, sortOrder: 0 };
    });

  return proposals.reduce<LegDraft[]>((acc, current) => {
    const previous = acc.at(-1);
    if (previous && previous.place.toLowerCase() === current.place.toLowerCase() && nextDay(previous.endDate) >= current.startDate) {
      previous.endDate = current.endDate > previous.endDate ? current.endDate : previous.endDate;
    } else {
      acc.push({ ...current });
    }
    return acc;
  }, []);
}

function validateDraft(draft: LegDraft): string | null {
  if (!draft.place.trim()) return 'Place is required.';
  if (draft.endDate < draft.startDate) return 'End date must be on or after start date.';
  return null;
}

export function TripLegs({ trip, initialLegs, hotels }: TripLegsProps) {
  const router = useRouter();
  const readOnly = useReadOnly();
  const [legs, setLegs] = useState<TripLeg[]>(initialLegs);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<LegDraft>(() => defaultDraft(trip, initialLegs));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const suggestions = useMemo(() => proposalsFromHotels(hotels), [hotels]);
  const orderedLegs = sortedLegs(legs);
  const warnings = legWarnings(orderedLegs, trip.startDate, trip.endDate);

  function startAdd() {
    setDraft(defaultDraft(trip, legs));
    setEditingId('new');
    setError(null);
    setSuggesting(false);
  }

  function startEdit(leg: TripLeg) {
    setDraft({ id: leg.id, place: leg.place, startDate: leg.startDate, endDate: leg.endDate, sortOrder: leg.sortOrder });
    setEditingId(leg.id);
    setError(null);
    setSuggesting(false);
  }

  function cancelEdit() {
    setEditingId(null);
    setError(null);
    setDraft(defaultDraft(trip, legs));
  }

  async function saveDraft() {
    const validation = validateDraft(draft);
    if (validation) {
      setError(validation);
      return;
    }

    const previous = legs;
    setSaving(true);
    setError(null);
    try {
      if (editingId === 'new') {
        const optimistic: TripLeg = {
          id: `pending-${Date.now()}`,
          tripId: trip.id,
          place: draft.place.trim(),
          startDate: draft.startDate,
          endDate: draft.endDate,
          latitude: null,
          longitude: null,
          resolvedName: null,
          sortOrder: draft.sortOrder,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setLegs((prev) => sortedLegs([...prev, optimistic]));
        const res = await fetch(apiUrl(`/api/trips/${trip.id}/legs`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ place: draft.place.trim(), startDate: draft.startDate, endDate: draft.endDate, sortOrder: draft.sortOrder }),
        });
        if (!res.ok) throw new Error();
        const created = await res.json() as TripLeg;
        setLegs((prev) => sortedLegs(prev.map((leg) => leg.id === optimistic.id ? created : leg)));
        toast('Place added');
      } else if (editingId) {
        const nextLeg = { place: draft.place.trim(), startDate: draft.startDate, endDate: draft.endDate, sortOrder: draft.sortOrder };
        setLegs((prev) => sortedLegs(prev.map((leg) => leg.id === editingId ? { ...leg, ...nextLeg, updatedAt: new Date().toISOString() } : leg)));
        const res = await fetch(apiUrl(`/api/trips/${trip.id}/legs/${editingId}`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nextLeg),
        });
        if (!res.ok) throw new Error();
        const saved = await res.json() as TripLeg;
        setLegs((prev) => sortedLegs(prev.map((leg) => leg.id === saved.id ? saved : leg)));
        toast('Place saved');
      }
      setEditingId(null);
      router.refresh();
    } catch {
      setLegs(previous);
      setError('Could not save this place. Please try again.');
      toast('Could not save this place. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function deleteLeg(legId: string) {
    const previous = legs;
    setLegs((prev) => prev.filter((leg) => leg.id !== legId));
    setConfirmDeleteId(null);
    try {
      const res = await fetch(apiUrl(`/api/trips/${trip.id}/legs/${legId}`), { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast('Place deleted');
      router.refresh();
    } catch {
      setLegs(previous);
      setError('Could not delete this place. Please try again.');
      toast('Could not delete this place. Please try again.', 'error');
    }
  }

  async function applySuggestions() {
    const previous = legs;
    setSaving(true);
    setError(null);
    try {
      const created: TripLeg[] = [];
      for (const proposal of suggestions) {
        const res = await fetch(apiUrl(`/api/trips/${trip.id}/legs`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(proposal),
        });
        if (!res.ok) throw new Error();
        created.push(await res.json() as TripLeg);
        setLegs((prev) => sortedLegs([...prev, created.at(-1)!]));
      }
      setSuggesting(false);
      toast(created.length === 1 ? 'Place added' : 'Places added');
      router.refresh();
    } catch {
      setLegs(previous);
      setError('Could not apply hotel suggestions. Please try again.');
      toast('Could not apply hotel suggestions. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="no-print mb-8">
      <div className="mb-2 flex min-h-10 items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-stone-600">Where you&apos;ll be</h2>
        {!readOnly && editingId !== 'new' && (
          <button type="button" onClick={startAdd} className="inline-flex min-h-10 items-center gap-1 rounded-md px-2 text-xs font-medium text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800">
            <Plus className="h-4 w-4" aria-hidden="true" /> Add place
          </button>
        )}
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <div className="space-y-3">
          {orderedLegs.length === 0 && editingId !== 'new' && !suggesting && (
            <div className="space-y-3">
              <p className="text-sm text-stone-500">Weather is showing for <span className="font-medium text-stone-700">{trip.destination}</span>.</p>
              {!readOnly && suggestions.length > 0 && (
                <button type="button" onClick={() => setSuggesting(true)} className="min-h-10 rounded-md px-3 text-sm font-medium text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800">
                  Use my hotels
                </button>
              )}
            </div>
          )}

          {suggesting && (
            <div className="space-y-3 rounded-lg border border-stone-200 bg-stone-50 p-3">
              <div className="space-y-2">
                {suggestions.map((proposal) => (
                  <div key={`${proposal.place}-${proposal.startDate}`} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-stone-700">{proposal.place}</span>
                    <span className="text-stone-400">{dateRange(proposal.startDate, proposal.endDate)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setSuggesting(false)} disabled={saving} className="min-h-10 rounded-md px-3 text-sm font-medium text-stone-500 hover:bg-stone-100 disabled:opacity-50">Cancel</button>
                <button type="button" onClick={applySuggestions} disabled={saving} className="min-h-10 rounded-md bg-stone-800 px-3 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50">Apply</button>
              </div>
            </div>
          )}

          {orderedLegs.map((leg) => editingId === leg.id ? (
            <LegEditor key={leg.id} draft={draft} saving={saving} error={error} onDraft={setDraft} onSave={saveDraft} onCancel={cancelEdit} />
          ) : (
            <div key={leg.id} className="flex min-h-12 items-center justify-between gap-3 border-b border-stone-100 pb-3 last:border-b-0 last:pb-0">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-stone-800">{leg.place}</p>
                <p className="text-xs text-stone-400">{dateRange(leg.startDate, leg.endDate)}</p>
              </div>
              {!readOnly && (
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => startEdit(leg)} title="Edit place" className="rounded-md p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-800">
                    <Edit2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                  {confirmDeleteId === leg.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-red-600">Delete this place?</span>
                      <button type="button" onClick={() => deleteLeg(leg.id)} className="min-h-9 rounded-md bg-red-600 px-2 text-xs font-medium text-white hover:bg-red-700">Yes, delete</button>
                      <button type="button" onClick={() => setConfirmDeleteId(null)} className="min-h-9 rounded-md px-2 text-xs font-medium text-stone-500 hover:bg-stone-100">Cancel</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setConfirmDeleteId(leg.id)} title="Delete place" className="rounded-md p-2 text-stone-400 hover:bg-red-50 hover:text-red-700">
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}

          {editingId === 'new' && (
            <LegEditor draft={draft} saving={saving} error={error} onDraft={setDraft} onSave={saveDraft} onCancel={cancelEdit} />
          )}

          {warnings.length > 0 && (
            <div className="space-y-1 border-t border-stone-100 pt-3">
              {warnings.map((warning, index) => (
                <p key={`${warning.kind}-${warning.legId ?? 'gap'}-${index}`} className="text-xs text-amber-700">{warning.message}</p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LegEditor({ draft, saving, error, onDraft, onSave, onCancel }: {
  draft: LegDraft;
  saving: boolean;
  error: string | null;
  onDraft: (draft: LegDraft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50 p-3" onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9.5rem_9.5rem]">
        <PlacesInput value={draft.place} onChange={(place) => onDraft({ ...draft, place })} placeholder="Place" className="bg-white" />
        <Input type="date" value={draft.startDate} onChange={(e) => onDraft({ ...draft, startDate: e.target.value })} className="bg-white" />
        <Input type="date" value={draft.endDate} onChange={(e) => onDraft({ ...draft, endDate: e.target.value })} className="bg-white" />
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={saving} className="inline-flex min-h-10 items-center gap-1 rounded-md px-3 text-sm font-medium text-stone-500 hover:bg-stone-100 disabled:opacity-50">
          <X className="h-4 w-4" aria-hidden="true" /> Cancel
        </button>
        <button type="button" onClick={onSave} disabled={saving} className="min-h-10 rounded-md bg-stone-800 px-3 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50">
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}
