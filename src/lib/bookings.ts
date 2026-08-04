import type { EventCategory } from '@/types/travel';

/**
 * Categories where booking is optional: a restaurant may not take reservations, an activity
 * may be a walk-up — a stroll round a neighbourhood, a self-guided walking tour — and a note
 * is rarely something you book at all. All are stored in the same `trip_events.takes_reservations`
 * column (1 = needs booking), so a plan that needs nothing booked never shows a red
 * "Needs Booking" badge.
 *
 * Hikes are handled separately: they never carry a booking status at all.
 *
 * Parking and transit rows carry the same column (migration `012`) but have no category gate —
 * any of them may be a walk-up, so the flag alone decides. See skipsBooking().
 */
const BOOKING_OPTIONAL_CATEGORIES: EventCategory[] = ['restaurant', 'activity', 'note'];

/** True for event categories that offer the "needs booking?" toggle in the event form. */
export function bookingIsOptional(category: EventCategory): boolean {
  return BOOKING_OPTIONAL_CATEGORIES.includes(category);
}

/**
 * True when this is a plan you simply turn up to — show no booking status for it.
 *
 * Takes either shape: a `trip_events` row, which must also pass the category gate above, or a
 * `trip_parking` / `trip_transit` row, which has no `category` and is decided by the flag alone.
 * One predicate rather than two so no call site re-tests the column inline.
 */
export function skipsBooking(item: { category?: EventCategory; takesReservations: boolean }): boolean {
  if (item.category !== undefined && !bookingIsOptional(item.category)) return false;
  return !item.takesReservations;
}

/** Badge/label text shown in place of a booking status. */
export function noBookingLabel(category?: EventCategory | null): string {
  return category === 'restaurant' ? 'No reservations' : 'No booking needed';
}
