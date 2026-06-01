'use client';

import { TripEvent } from '@/types/travel';
import { BookingStatusBadge } from './BookingStatusBadge';
import { BrandLogo } from './BrandLogo';
import { getLogoPath } from '@/lib/logos';
import { getMapsUrl } from '@/lib/maps';
import { MapPin } from 'lucide-react';

const categoryIcons: Record<string, string> = {
  flight: '✈',
  hotel: '🏨',
  restaurant: '🍽',
  activity: '🎯',
  transport: '🚗',
  parking: '🅿️',
  note: '📝',
};

interface EventCardProps {
  event: TripEvent;
  onEdit: (event: TripEvent) => void;
}

function fmt12(time: string) {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function logoName(title: string): string {
  const lower = title.toLowerCase();
  const atIdx = lower.indexOf(' at ');
  if (atIdx !== -1) return title.slice(atIdx + 4).trim();
  const atSymIdx = lower.indexOf(' @ ');
  if (atSymIdx !== -1) return title.slice(atSymIdx + 3).trim();
  return title;
}

export function EventCard({ event, onEdit }: EventCardProps) {
  return (
    <div
      className="relative pl-8 group cursor-pointer"
      onClick={() => onEdit(event)}
    >
      {/* Timeline dot */}
      <div className="absolute left-0 top-3 w-3 h-3 rounded-full bg-white border-2 border-stone-300 group-hover:border-stone-500 transition-colors" />

      <div className="bg-white rounded-lg border border-stone-200 p-4 hover:border-stone-300 hover:shadow-sm transition-all">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <BrandLogo
              name={logoName(event.title)}
              fallbackNames={[event.location, event.vendor]}
              fallback={categoryIcons[event.category] ?? '📌'}
              heightClass="h-5"
            />
            <div className="min-w-0">
              <p className="font-medium text-stone-900 truncate">{event.title}</p>
              {event.location && (
                <div className="flex items-center gap-1 mt-0.5 min-w-0">
                  <p className="text-sm text-stone-500 truncate">
                    {event.locationUrl ? (
                      <a href={event.locationUrl} target="_blank" rel="noopener noreferrer" className="hover:underline" onClick={(e) => e.stopPropagation()}>
                        {event.location}
                      </a>
                    ) : event.location}
                  </p>
                  <a href={getMapsUrl(event.location)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="shrink-0">
                    <MapPin className="h-3.5 w-3.5 text-stone-400 hover:text-blue-500 transition-colors" />
                  </a>
                </div>
              )}
              {event.confirmationNumber && (
                <p className="text-xs text-stone-400 mt-1">Conf: {event.confirmationNumber}</p>
              )}
              {(event.vendor || event.orderNumber) && (
                <p className="text-xs text-stone-400 mt-0.5">
                  {[
                    // Hide vendor name when its logo is shown as the card icon
                    !getLogoPath(event.vendor) ? event.vendor : null,
                    event.orderNumber ? `#${event.orderNumber}` : null,
                  ].filter(Boolean).join(' · ')}
                </p>
              )}
              {event.seatInfo && (
                <p className="text-xs text-stone-400 mt-0.5">Seats: {event.seatInfo}</p>
              )}
              {event.cancellationDeadline && (() => {
                const deadline = new Date(event.cancellationDeadline + 'T00:00:00');
                const label = deadline.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                return <p className="text-xs mt-0.5 text-stone-400">Cancel by {label}</p>;
              })()}
              {event.notes && (
                <p className="text-sm text-stone-500 mt-1 line-clamp-2">{event.notes}</p>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end self-stretch shrink-0">
            {event.startTime && (
              <span className="text-sm font-semibold text-stone-700">{fmt12(event.startTime)}</span>
            )}
            <div className="mt-auto">
              <BookingStatusBadge status={event.bookingStatus} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
