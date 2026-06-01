'use client';

import { useEffect, useState } from 'react';

interface WeatherDay {
  date: string;
  tMax: number;
  tMin: number;
  precip: number | null;
  code: number;
}
interface WeatherResponse {
  available: boolean;
  reason?: string;
  location?: string;
  unit?: string;
  days?: WeatherDay[];
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

export function TripWeather({ tripId }: { tripId: string }) {
  const [data, setData] = useState<WeatherResponse | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/trips/${tripId}/weather`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (active) setData(d); })
      .catch(() => {});
    return () => { active = false; };
  }, [tripId]);

  if (!data) return null;
  if (!data.available) {
    if (data.reason === 'too_far_out') {
      return (
        <div className="mb-8 text-sm text-stone-400 no-print">
          🌤️ Weather forecast will appear closer to your trip{data.location ? ` to ${data.location}` : ''}.
        </div>
      );
    }
    return null;
  }

  return (
    <div className="mb-8 bg-white rounded-xl border border-stone-200 p-4 no-print">
      <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">
        Weather{data.location ? ` · ${data.location}` : ''}
      </h3>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {data.days!.map((day) => {
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
    </div>
  );
}
