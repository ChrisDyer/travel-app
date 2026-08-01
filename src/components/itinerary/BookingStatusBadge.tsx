import { BookingStatus, EventCategory } from '@/types/travel';
import { noBookingLabel } from '@/lib/bookings';

export const bookingStatusLabel: Record<BookingStatus, string> = {
  confirmed: 'Confirmed',
  pending: 'Pending',
  unbooked: 'Needs Booking',
};

const config: Record<BookingStatus, { label: string; className: string }> = {
  confirmed: { label: bookingStatusLabel.confirmed, className: 'bg-green-100 text-green-800' },
  pending: { label: bookingStatusLabel.pending, className: 'bg-amber-100 text-amber-800' },
  unbooked: { label: bookingStatusLabel.unbooked, className: 'bg-red-100 text-red-700' },
};

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const { label, className } = config[status] ?? config.unbooked;
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${className}`}>
      {label}
    </span>
  );
}

// Shown in place of a booking status for plans that need none: restaurants that don't
// take reservations, activities you can just turn up to.
export function NoBookingBadge({ category }: { category: EventCategory }) {
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-stone-100 text-stone-500 whitespace-nowrap">
      {noBookingLabel(category)}
    </span>
  );
}
