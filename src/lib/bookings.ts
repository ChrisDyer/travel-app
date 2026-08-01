import type { EventCategory, TripEvent } from '@/types/travel';

/**
 * Categories where booking is optional: a restaurant may not take reservations, and an
 * activity may be a walk-up — a stroll round a neighbourhood, a self-guided walking tour.
 * Both are stored in the same `trip_events.takes_reservations` column (1 = needs booking),
 * so a plan that needs nothing booked never shows a red "Needs Booking" badge.
 *
 * Hikes are handled separately: they never carry a booking status at all.
 */
const BOOKING_OPTIONAL_CATEGORIES: EventCategory[] = ['restaurant', 'activity'];

/** True for categories that offer the "needs booking?" toggle in the event form. */
export function bookingIsOptional(category: EventCategory): boolean {
  return BOOKING_OPTIONAL_CATEGORIES.includes(category);
}

/** True when this is a plan you simply turn up to — show no booking status for it. */
export function skipsBooking(event: Pick<TripEvent, 'category' | 'takesReservations'>): boolean {
  return bookingIsOptional(event.category) && !event.takesReservations;
}

/** Badge/label text shown in place of a booking status. */
export function noBookingLabel(category: EventCategory): string {
  return category === 'restaurant' ? 'No reservations' : 'No booking needed';
}
