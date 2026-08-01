'use client';

import { useEffect, useState } from 'react';
import { apiUrl } from '@/lib/api';
import { fmtShortDate } from '@/lib/dates';

interface WeatherDay {
  date: string;
  tMax: number;
  tMin: number;
  precip: number | null;
  code: number;
}
interface WeatherSegment {
  place: string;
  location: string | null;
  startDate: string;
  endDate: string;
  reason?: string;
  days: WeatherDay[];
}
interface WeatherResponse {
  available: boolean;
  reason?: string;
  unit?: string;
  segments?: WeatherSegment[];
}

// Map WMO weather codes to a compact emoji + label.
function describe(code: number): { icon: string; label: string } {
  if (code === 0) return { icon: '\u2600\uFE0F', label: 'Clear' };
  if (code <= 3) return { icon: '\u26C5', label: 'Partly cloudy' };
  if (code === 45 || code === 48) return { icon: '\u{1F32B}\uFE0F', label: 'Fog' };
  if (code >= 51 && code <= 67) return { icon: '\u{1F327}\uFE0F', label: 'Rain' };
  if (code >= 71 && code <= 77) return { icon: '\u{1F328}\uFE0F', label: 'Snow' };
  if (code >= 80 && code <= 82) return { icon: '\u{1F326}\uFE0F', label: 'Showers' };
  if (code >= 85 && code <= 86) return { icon: '\u{1F328}\uFE0F', label: 'Snow showers' };
  if (code >= 95) return { icon: '\u26C8\uFE0F', label: 'Thunderstorm' };
  return { icon: '\u2601\uFE0F', label: 'Cloudy' };
}

function WeatherDays({ days }: { days: WeatherDay[] }) {
  return (
    <div className="flex max-w-full gap-3 overflow-x-auto pb-1">
      {days.map((day) => {
        const w = describe(day.code);
        const d = new Date(day.date + 'T00:00:00');
        return (
          <div key={day.date} className="w-16 shrink-0 text-center">
            <div className="text-xs text-stone-400">{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
            <div className="my-1 text-2xl" title={w.label}>{w.icon}</div>
            <div className="text-sm font-medium text-stone-800">{day.tMax}&deg;<span className="font-normal text-stone-400"> / {day.tMin}&deg;</span></div>
            {day.precip != null && day.precip > 0 && (
              <div className="text-[11px] text-blue-500">{'\u{1F4A7}'}{day.precip}%</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function rangeLabel(startDate: string, endDate: string): string {
  const start = fmtShortDate(startDate) ?? startDate;
  const end = fmtShortDate(endDate) ?? endDate;
  return startDate === endDate ? start : `${start} - ${end}`;
}

function unavailableLabel(reason: string | undefined): string {
  if (reason === 'too_many_locations') return 'Too many locations to forecast';
  return 'Forecast unavailable';
}

function WeatherCard({ segment }: { segment: WeatherSegment }) {
  const location = segment.location ?? segment.place;

  return (
    <section className="w-fit max-w-full rounded-xl border border-stone-200 bg-white p-4 no-print">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400">
            Weather
          </h3>
          <p className="mt-3 text-sm font-medium text-stone-800">{location}</p>
        </div>
        <p className="shrink-0 text-xs text-stone-400">{rangeLabel(segment.startDate, segment.endDate)}</p>
      </div>
      {segment.days.length > 0 ? (
        <WeatherDays days={segment.days} />
      ) : (
        <p className="text-sm text-stone-400">{unavailableLabel(segment.reason)}</p>
      )}
    </section>
  );
}

export function TripWeather({ tripId, legsVersion }: { tripId: string; legsVersion: string }) {
  const [data, setData] = useState<WeatherResponse | null>(null);

  useEffect(() => {
    let active = true;
    fetch(apiUrl(`/api/trips/${tripId}/weather`))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (active) setData(d); })
      .catch(() => {});
    return () => { active = false; };
  }, [tripId, legsVersion]);

  if (!data) return null;
  if (!data.available) {
    if (data.reason === 'too_far_out') {
      return (
        <div className="mb-8 text-sm text-stone-400 no-print">
          {'\u{1F324}\uFE0F'} Weather forecast will appear closer to your trip.
        </div>
      );
    }
    return null;
  }

  const segments = data.segments ?? [];
  if (segments.length === 0) return null;

  return (
    <div className="mb-8 flex flex-wrap items-start gap-4 no-print">
      {segments.map((segment) => (
        <WeatherCard
          key={`${segment.startDate}-${segment.endDate}-${segment.place}`}
          segment={segment}
        />
      ))}
    </div>
  );
}
