import { BookingStatus } from '@/types/travel';

const config: Record<BookingStatus, { label: string; className: string }> = {
  confirmed: { label: 'Confirmed', className: 'bg-green-100 text-green-800' },
  pending: { label: 'Pending', className: 'bg-amber-100 text-amber-800' },
  unbooked: { label: 'Needs Booking', className: 'bg-red-100 text-red-700' },
};

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const { label, className } = config[status] ?? config.unbooked;
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${className}`}>
      {label}
    </span>
  );
}
