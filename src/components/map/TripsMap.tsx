'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { GoogleMap, InfoWindow, Marker, useJsApiLoader } from '@react-google-maps/api';
import { AlertTriangle, CalendarDays, MapPin } from 'lucide-react';
import { apiUrl } from '@/lib/api';
import { formatDateRange } from '@/lib/dates';
import { googleMapsLibraries } from '@/lib/google-maps';
import { localToday, tripTiming } from '@/lib/trip-status';
import type { TripStatus } from '@/types/travel';

type MapLeg = { id: string; place: string; latitude: number | null; longitude: number | null; resolvedName: string | null };
type MapTrip = {
  id: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  status: TripStatus;
  latitude: number | null;
  longitude: number | null;
  resolvedName: string | null;
  legs: MapLeg[];
};

type MapResponse = { trips: MapTrip[] };
type Filter = 'all' | 'upcoming' | 'past';
type Pin = { id: string; tripId: string; title: string; label: string; lat: number; lng: number; trip: MapTrip; kind: 'trip' | 'leg' };

const mapContainerStyle = { width: '100%', height: '100%' };
const defaultCenter = { lat: 39.8283, lng: -98.5795 };

function timingGroup(trip: MapTrip, today: string): 'past' | 'upcoming' {
  return trip.endDate < today ? 'past' : 'upcoming';
}

function markerIcon(color: string): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: color,
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeWeight: 2,
    scale: 8,
  };
}

export function TripsMap() {
  const [data, setData] = useState<MapResponse | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [activePinId, setActivePinId] = useState<string | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
  const today = localToday();

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey,
    libraries: googleMapsLibraries,
  });

  useEffect(() => {
    let active = true;
    fetch(apiUrl('/api/map'))
      .then((res) => (res.ok ? res.json() : { trips: [] }))
      .then((json) => { if (active) setData(json); })
      .catch(() => { if (active) setData({ trips: [] }); });
    return () => { active = false; };
  }, []);

  const trips = useMemo(() => data?.trips ?? [], [data]);
  const visibleTrips = useMemo(() => trips.filter((trip) => {
    if (filter === 'all') return true;
    return timingGroup(trip, today) === filter;
  }), [filter, today, trips]);

  const pins = useMemo<Pin[]>(() => visibleTrips.flatMap((trip) => {
    const out: Pin[] = [];
    if (trip.latitude != null && trip.longitude != null) {
      out.push({ id: `trip:${trip.id}`, tripId: trip.id, title: trip.title, label: trip.resolvedName ?? trip.destination, lat: trip.latitude, lng: trip.longitude, trip, kind: 'trip' });
    }
    for (const leg of trip.legs) {
      if (leg.latitude != null && leg.longitude != null) {
        out.push({ id: `leg:${leg.id}`, tripId: trip.id, title: trip.title, label: leg.resolvedName ?? leg.place, lat: leg.latitude, lng: leg.longitude, trip, kind: 'leg' });
      }
    }
    return out;
  }), [visibleTrips]);

  const activePin = pins.find((pin) => pin.id === activePinId) ?? null;

  const fitPins = useCallback((nextPins: Pin[]) => {
    if (!mapRef.current || nextPins.length === 0 || !window.google) return;
    if (nextPins.length === 1) {
      mapRef.current.setCenter({ lat: nextPins[0].lat, lng: nextPins[0].lng });
      mapRef.current.setZoom(14);
      return;
    }
    const bounds = new window.google.maps.LatLngBounds();
    nextPins.forEach((pin) => bounds.extend({ lat: pin.lat, lng: pin.lng }));
    mapRef.current.fitBounds(bounds, 60);
  }, []);

  useEffect(() => {
    if (isLoaded) fitPins(pins);
  }, [filter, fitPins, isLoaded, pins]);

  function selectTrip(trip: MapTrip) {
    const pin = pins.find((candidate) => candidate.tripId === trip.id);
    if (!pin) return;
    setActivePinId(pin.id);
    mapRef.current?.panTo({ lat: pin.lat, lng: pin.lng });
    mapRef.current?.setZoom(10);
  }

  // Two different failures with two different fixes: no key configured vs. the Google
  // loader itself erroring. Reporting the second as the first sends you looking for an
  // env var that is already set.
  const unavailableReason = !apiKey
    ? 'Map unavailable: NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set'
    : loadError
      ? 'Map unavailable: the Google Maps loader failed. Check the key’s referrer and API restrictions.'
      : null;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="min-h-[24rem] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm xl:h-[70vh] xl:min-h-[36rem]">
        {unavailableReason ? (
          <div className="flex h-full min-h-[24rem] items-center justify-center bg-slate-50 p-6 text-center text-sm text-slate-500">
            <div>
              <AlertTriangle className="mx-auto mb-3 h-6 w-6 text-amber-600" aria-hidden="true" />
              {unavailableReason}
            </div>
          </div>
        ) : !data || !isLoaded ? (
          <div className="flex h-full min-h-[24rem] items-center justify-center text-sm text-slate-500">Loading map...</div>
        ) : (
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={pins[0] ? { lat: pins[0].lat, lng: pins[0].lng } : defaultCenter}
            zoom={pins.length === 0 ? 4 : 8}
            onLoad={(map) => { mapRef.current = map; fitPins(pins); }}
            options={{ mapTypeControl: false, streetViewControl: false, fullscreenControl: false }}
          >
            {pins.map((pin) => (
              <Marker
                key={pin.id}
                position={{ lat: pin.lat, lng: pin.lng }}
                title={pin.label}
                icon={markerIcon(timingGroup(pin.trip, today) === 'past' ? '#64748b' : '#2563eb')}
                onClick={() => setActivePinId(pin.id)}
              />
            ))}
            {activePin && (
              <InfoWindow position={{ lat: activePin.lat, lng: activePin.lng }} onCloseClick={() => setActivePinId(null)}>
                <div className="max-w-56 text-sm text-slate-900">
                  <p className="font-semibold">{activePin.title}</p>
                  <p className="mt-1 text-slate-600">{activePin.label}</p>
                  <p className="mt-1 text-slate-500">{formatDateRange(activePin.trip.startDate, activePin.trip.endDate)}</p>
                  <Link href={`/trips/${activePin.trip.id}`} className="mt-2 inline-flex font-medium text-blue-700 hover:text-blue-900">Open trip</Link>
                </div>
              </InfoWindow>
            )}
          </GoogleMap>
        )}
      </section>

      <aside className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-950">Trips</h2>
          <div className="flex rounded-md border border-slate-200 p-0.5 text-xs">
            {(['all', 'upcoming', 'past'] as Filter[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`rounded px-2.5 py-1 font-medium capitalize ${filter === value ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-2">
          {visibleTrips.map((trip) => {
            const hasPin = pins.some((pin) => pin.tripId === trip.id);
            return (
              <button
                key={trip.id}
                type="button"
                onClick={() => selectTrip(trip)}
                // A trip with no cached coordinate has nothing to pan to. Keep it listed
                // (that is the point of the side list) but do not offer a click that
                // silently does nothing.
                disabled={!hasPin}
                title={hasPin ? undefined : 'No map location resolved for this destination yet'}
                className="rounded-md border border-slate-200 px-3 py-3 text-left hover:border-slate-300 hover:bg-slate-50 disabled:cursor-default disabled:hover:border-slate-200 disabled:hover:bg-white"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-900">{trip.title}</span>
                    <span className="mt-1 block truncate text-xs text-slate-500">{trip.destination}</span>
                  </span>
                  <MapPin className={`h-4 w-4 shrink-0 ${hasPin ? 'text-blue-600' : 'text-slate-300'}`} aria-hidden="true" />
                </span>
                <span className="mt-2 flex items-center gap-1 text-xs text-slate-400">
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                  {tripTiming(trip.startDate, trip.endDate, today)}
                </span>
              </button>
            );
          })}
          {data && visibleTrips.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No trips in this view.</p>}
          {!data && <p className="py-8 text-center text-sm text-slate-500">Loading trips...</p>}
        </div>
      </aside>
    </div>
  );
}
