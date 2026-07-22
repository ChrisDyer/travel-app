'use client';

import { useState } from 'react';
import { TripDay, TripEvent, EventCategory, BookingStatus } from '@/types/travel';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlacesInput } from './PlacesInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { apiUrl } from '@/lib/api';

interface EventFormProps {
  tripId: string;
  day: TripDay;
  days: TripDay[];
  event: TripEvent | null;
  defaultCategory?: EventCategory;
  onSaved: (event: TripEvent, isNew: boolean) => void;
  onDeleted: (eventId: string) => void;
  onClose: () => void;
}

const categories: EventCategory[] = ['restaurant', 'activity', 'hike', 'note'];
const bookingStatuses: BookingStatus[] = ['unbooked', 'pending', 'confirmed'];

function categoryLabel(category: EventCategory): string {
  if (category === 'hike') return 'Hike';
  return category.charAt(0).toUpperCase() + category.slice(1);
}

export function EventForm({ tripId, day, days, event, defaultCategory = 'activity', onSaved, onDeleted, onClose }: EventFormProps) {
  const isNew = !event;
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const [selectedDayId, setSelectedDayId] = useState(day.id);
  const [selectedCategory, setSelectedCategory] = useState<EventCategory>(event?.category ?? defaultCategory);
  const isHike = selectedCategory === 'hike';

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const trailheadLocation = form.get('trailheadLocation') || null;
    const body = {
      tripDayId: selectedDayId,
      category: selectedCategory,
      title: form.get('title'),
      startTime: form.get('startTime') || null,
      endTime: form.get('endTime') || null,
      location: isHike ? trailheadLocation : form.get('location') || null,
      locationUrl: isHike ? null : form.get('locationUrl') || null,
      bookingStatus: isHike ? 'unbooked' : form.get('bookingStatus'),
      confirmationNumber: isHike ? null : form.get('confirmationNumber') || null,
      bookingUrl: isHike ? null : form.get('bookingUrl') || null,
      cost: isHike ? null : form.get('cost') ? Number(form.get('cost')) : null,
      currency: isHike ? null : form.get('currency') || null,
      seatInfo: isHike ? null : form.get('seatInfo') || null,
      vendor: isHike ? null : form.get('vendor') || null,
      orderNumber: isHike ? null : form.get('orderNumber') || null,
      cancellationPolicy: isHike ? null : form.get('cancellationPolicy') || null,
      cancellationDeadline: isHike ? null : form.get('cancellationDeadline') || null,
      hikeDistance: isHike ? form.get('hikeDistance') || null : null,
      hikeElevation: isHike ? form.get('hikeElevation') || null : null,
      trailheadLocation: isHike ? trailheadLocation : null,
      alltrailsUrl: isHike ? form.get('alltrailsUrl') || null : null,
      notes: form.get('notes') || null,
      sortOrder: event?.sortOrder ?? 0,
    };

    const url = isNew
      ? `/api/trips/${tripId}/events`
      : `/api/trips/${tripId}/events/${event.id}`;
    const method = isNew ? 'POST' : 'PATCH';

    const res = await fetch(apiUrl(url), {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const saved = await res.json();
      onSaved(saved, isNew);
    } else {
      const data = await res.json().catch(() => ({})) as { error?: string };
      setError(data.error ?? 'Something went wrong. Please try again.');
    }
    setLoading(false);
  }

  async function handleDelete() {
    if (!event) return;
    setDeleting(true);
    const res = await fetch(apiUrl(`/api/trips/${tripId}/events/${event.id}`), { method: 'DELETE' });
    if (res.ok) {
      onDeleted(event.id);
    } else {
      const data = await res.json().catch(() => ({})) as { error?: string };
      setError(data.error ?? 'Failed to delete. Please try again.');
    }
    setDeleting(false);
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? `Add ${isHike ? 'Hike' : 'Event'}` : `Edit ${isHike ? 'Hike' : 'Event'}`}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className={isHike ? 'space-y-1.5' : 'grid grid-cols-2 gap-4'}>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select name="category" value={selectedCategory} onValueChange={(value) => setSelectedCategory(value as EventCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>{categoryLabel(c)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!isHike && (
              <div className="space-y-1.5">
                <Label>Booking Status</Label>
                <Select name="bookingStatus" defaultValue={event?.bookingStatus ?? 'unbooked'}>
                  <SelectTrigger><SelectValue className="capitalize" /></SelectTrigger>
                  <SelectContent>
                    {bookingStatuses.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {days.length > 1 && (
            <div className="space-y-1.5">
              <Label>Day</Label>
              <Select value={selectedDayId} onValueChange={(v) => { if (v) setSelectedDayId(v); }}>
                <SelectTrigger>
                  <span className="text-sm">
                    {(() => {
                      const d = days.find((x) => x.id === selectedDayId);
                      if (!d) return 'Select day';
                      const label = new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                      return `Day ${d.dayNumber} - ${label}${d.title ? ` - ${d.title}` : ''}`;
                    })()}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {days.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      Day {d.dayNumber} - {new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      {d.title ? ` - ${d.title}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" defaultValue={event?.title} required placeholder={isHike ? 'e.g. Angels Landing' : 'e.g. Dinner at Trattoria Roma'} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="startTime">Start Time</Label>
              <Input id="startTime" name="startTime" type="time" defaultValue={event?.startTime ?? ''} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="endTime">End Time</Label>
              <Input id="endTime" name="endTime" type="time" defaultValue={event?.endTime ?? ''} />
            </div>
          </div>

          {isHike ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="hikeDistance">Distance</Label>
                  <Input id="hikeDistance" name="hikeDistance" defaultValue={event?.hikeDistance ?? ''} placeholder="e.g. 5.2 mi" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="hikeElevation">Elevation</Label>
                  <Input id="hikeElevation" name="hikeElevation" defaultValue={event?.hikeElevation ?? ''} placeholder="e.g. 1,200 ft" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="trailheadLocation">Trailhead Location</Label>
                <PlacesInput id="trailheadLocation" name="trailheadLocation" defaultValue={event?.trailheadLocation ?? event?.location ?? ''} placeholder="Trailhead or parking area" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="alltrailsUrl">AllTrails Link</Label>
                <Input id="alltrailsUrl" name="alltrailsUrl" type="url" defaultValue={event?.alltrailsUrl ?? ''} placeholder="https://www.alltrails.com/" />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="location">Location</Label>
                <PlacesInput id="location" name="location" defaultValue={event?.location ?? ''} placeholder="Address or venue name" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="locationUrl">Maps / Website URL</Label>
                <Input id="locationUrl" name="locationUrl" type="url" defaultValue={event?.locationUrl ?? ''} placeholder="https://" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="confirmationNumber">Confirmation #</Label>
                  <Input id="confirmationNumber" name="confirmationNumber" defaultValue={event?.confirmationNumber ?? ''} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bookingUrl">Booking URL</Label>
                  <Input id="bookingUrl" name="bookingUrl" type="url" defaultValue={event?.bookingUrl ?? ''} placeholder="https://" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="cost">Cost</Label>
                  <Input id="cost" name="cost" type="number" step="0.01" defaultValue={event?.cost ?? ''} placeholder="0.00" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="currency">Currency</Label>
                  <Input id="currency" name="currency" defaultValue={event?.currency ?? 'USD'} placeholder="USD" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="seatInfo">Seat / Section Info</Label>
                <Input id="seatInfo" name="seatInfo" defaultValue={event?.seatInfo ?? ''} placeholder="e.g. Seats 24A & 24B or Section 317, Row 5" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="vendor">Vendor</Label>
                  <Input id="vendor" name="vendor" defaultValue={event?.vendor ?? ''} placeholder="e.g. StubHub, Delta, Enterprise" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="orderNumber">Order #</Label>
                  <Input id="orderNumber" name="orderNumber" defaultValue={event?.orderNumber ?? ''} placeholder="e.g. 636899297" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="cancellationPolicy">Cancellation Policy</Label>
                  <Input id="cancellationPolicy" name="cancellationPolicy" defaultValue={event?.cancellationPolicy ?? ''} placeholder="e.g. Non-refundable, Cancel anytime" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cancellationDeadline">Cancel By</Label>
                  <Input id="cancellationDeadline" name="cancellationDeadline" type="date" defaultValue={event?.cancellationDeadline ?? ''} />
                </div>
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" defaultValue={event?.notes ?? ''} rows={3} placeholder="Any additional details..." />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-between pt-2">
            {!isNew ? (
              !confirmDelete ? (
                <Button type="button" variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>Delete</Button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-red-600">Delete this {isHike ? 'hike' : 'event'}?</span>
                  <Button type="button" variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
                    {deleting ? 'Deleting...' : 'Yes, delete'}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                </div>
              )
            ) : <div />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={loading}>{loading ? 'Saving...' : `Save ${isHike ? 'Hike' : 'Event'}`}</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
