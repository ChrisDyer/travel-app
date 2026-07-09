import type { TripStatus } from '@/types/travel';

export const statusColors: Record<TripStatus, string> = {
  planning: 'bg-blue-100 text-blue-800',
  confirmed: 'bg-green-100 text-green-800',
  'in-progress': 'bg-amber-100 text-amber-800',
  completed: 'bg-stone-100 text-stone-600',
};

export function statusLabel(status: TripStatus): string {
  return status.replace('-', ' ');
}
