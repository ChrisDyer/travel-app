import type { TripStatus } from '@/types/travel';

export const statusColors: Record<TripStatus, string> = {
  planning: 'bg-blue-100 text-blue-800',
  confirmed: 'bg-green-100 text-green-800',
  'in-progress': 'bg-amber-100 text-amber-800',
  completed: 'bg-stone-100 text-stone-600',
};

export function statusLabel(status: TripStatus): string {
  return status.replace('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** today: 'YYYY-MM-DD' in the user's local zone. Call with localToday() on the client. */
export function tripTiming(startDate: string, endDate: string, today: string): string {
  if (today < startDate) {
    const days = Math.round((Date.parse(startDate + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 86400000);
    return days === 1 ? 'Tomorrow' : `In ${days} days`;
  }
  if (today > endDate) {
    const d = new Date(endDate + 'T12:00:00Z');
    return `Ended ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
  }
  const dayNum = Math.round((Date.parse(today + 'T12:00:00Z') - Date.parse(startDate + 'T12:00:00Z')) / 86400000) + 1;
  const total = Math.round((Date.parse(endDate + 'T12:00:00Z') - Date.parse(startDate + 'T12:00:00Z')) / 86400000) + 1;
  return `Day ${dayNum} of ${total}`;
}

export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
