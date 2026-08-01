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
  if (code === 0) return { icon: '☀️', label: 'Clear' };
  if (code <= 3) return { icon: '⛅', label: 'Partly cloudy' };
  if (code === 45 || code === 48) return { icon: '🌫️', label: 'Fog' };
  if (code >= 51 && code <= 67) return { icon: '🌧️', label: 'Rain' };
  if (code >= 71 && code <= 77) return { icon: '🌨️', label: 'Snow' };
  if (code >= 80 && code <= 82) return { icon: '🌦️', label: 'Showers' };
  if (code >= 85 && code <= 86) return { icon: '🌨️', label: 'Snow showers' };
  if (code >= 95) return { icon: '⛈️', label: 'Thunderstorm' };
  return { icon: '☁️', label: 'Cloudy' };
}

function WeatherDays({ days }: { days: WeatherDay[] }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {days.map((day) => {
        const w = describe(day.code);
        const d = new Date(day.date + 'T00:00:00');
        return (
          <div key={day.date} className="shrink-0 w-20 text-center">
            <div className="text-xs text-stone-400">{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
            <div className="text-2xl my-1" title={w.label}>{w.icon}</div>
            <div className="text-sm text-stone-800 font-medium">{day.tMax}°<span className="text-stone-400 font-normal"> / {day.tMin}°</span></div>
            {day.precip != null && day.precip > 0 && (
              <div className="text-[11px] text-blue-500">💧{day.precip}%</div>
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
          🌤️ Weather forecast will appear closer to your trip.
        </div>
      );
    }
    return null;
  }

  const segments = data.segments ?? [];
  const first = segments[0];
  if (!first) return null;

  if (segments.length === 1) {
    return (
      <div className="mb-8 bg-white rounded-xl border border-stone-200 p-4 no-print">
        <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">
          Weather{first.location ? ` · ${first.location}` : ''}
        </h3>
        {first.days.length > 0 ? (
          <WeatherDays days={first.days} />
        ) : (
          <p className="text-sm text-stone-400">{unavailableLabel(first.reason)}</p>
        )}
      </div>
    );
  }

  return (
    <div className="mb-8 bg-white rounded-xl border border-stone-200 p-4 no-print">
      <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-4">Weather</h3>
      <div className="space-y-5">
        {segments.map((segment) => (
          <div key={`${segment.startDate}-${segment.endDate}-${segment.place}`}>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-stone-700">{segment.location ?? segment.place}</p>
              <p className="text-xs text-stone-400">{rangeLabel(segment.startDate, segment.endDate)}</p>
            </div>
            {segment.days.length > 0 ? (
              <WeatherDays days={segment.days} />
            ) : (
              <p className="text-sm text-stone-400">{unavailableLabel(segment.reason)}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
