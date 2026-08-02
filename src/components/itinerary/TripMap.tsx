'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useJsApiLoader, GoogleMap, Marker, InfoWindow } from '@react-google-maps/api';
import { X } from 'lucide-react';
import { googleMapsLibraries } from '@/lib/google-maps';

export interface MapLocation {
  title: string;
  address: string;
  type: 'hotel' | 'parking' | 'event' | 'rental';
}

interface TripMapProps {
  locations: MapLocation[];
  activeLocations?: MapLocation[];
  selectedDate?: string;
  onClear?: () => void;
}

const typeIcon: Record<MapLocation['type'], string> = {
  hotel: '🏨',
  parking: '🅿️',
  event: '🎯',
  rental: '🚗',
};

const mapContainerStyle = { width: '100%', height: '500px' };
const defaultCenter = { lat: 39.8283, lng: -98.5795 };

type GeocodedLocation = MapLocation & { lat: number; lng: number };

function getWeekday(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' });
}

export function TripMap({ locations, activeLocations, selectedDate, onClear }: TripMapProps) {
  const [pins, setPins] = useState<GeocodedLocation[]>([]);
  const [activePin, setActivePin] = useState<GeocodedLocation | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const geocodedRef = useRef(false);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey,
    libraries: googleMapsLibraries,
  });

  const fitPins = useCallback((newPins: GeocodedLocation[]) => {
    if (!mapRef.current || newPins.length === 0) return;
    if (newPins.length === 1) {
      mapRef.current.setCenter({ lat: newPins[0].lat, lng: newPins[0].lng });
      mapRef.current.setZoom(14);
    } else {
      const bounds = new window.google.maps.LatLngBounds();
      newPins.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
      mapRef.current.fitBounds(bounds, 60);
    }
  }, []);

  const geocodeAll = useCallback(async (locs: MapLocation[]) => {
    if (!window.google) return;
    const geocoder = new window.google.maps.Geocoder();
    const results: GeocodedLocation[] = [];
    for (const loc of locs) {
      await new Promise<void>((resolve) => {
        geocoder.geocode({ address: loc.address }, (res, status) => {
          if (status === 'OK' && res?.[0]) {
            results.push({
              ...loc,
              lat: res[0].geometry.location.lat(),
              lng: res[0].geometry.location.lng(),
            });
          }
          resolve();
        });
      });
    }
    setPins(results);
    fitPins(results);
  }, [fitPins]);

  useEffect(() => {
    if (isLoaded && !geocodedRef.current) {
      geocodedRef.current = true;
      geocodeAll(locations.filter((l) => l.address));
    }
  }, [isLoaded, geocodeAll, locations]);

  const activeAddresses = activeLocations
    ? new Set(activeLocations.map((l) => l.address))
    : null;

  const displayPins = activeAddresses
    ? pins.filter((p) => activeAddresses.has(p.address))
    : pins;
  const visibleActivePin = activePin && displayPins.some((p) => p === activePin)
    ? activePin
    : null;

  useEffect(() => {
    if (activeLocations !== undefined) {
      fitPins(displayPins);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLocations]);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    fitPins(displayPins);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitPins]);

  if (!apiKey) return null;

  const isFiltered = activeLocations !== undefined;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-stone-600">
          Trip Map{isFiltered && selectedDate ? ` · ${getWeekday(selectedDate)}` : ''}
        </h2>
        {isFiltered && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-700 transition-colors"
          >
            <X className="h-3 w-3" />
            Show all
          </button>
        )}
      </div>
      <div className="rounded-lg border border-stone-200 overflow-hidden">
        {loadError && (
          <div className="h-16 flex items-center justify-center text-sm text-stone-400">Map unavailable</div>
        )}
        {!isLoaded && !loadError && (
          <div className="h-16 flex items-center justify-center text-sm text-stone-400">Loading map…</div>
        )}
        {isLoaded && !loadError && (
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={displayPins[0] ? { lat: displayPins[0].lat, lng: displayPins[0].lng } : defaultCenter}
            zoom={displayPins.length === 0 ? 4 : 12}
            onLoad={onMapLoad}
            options={{ mapTypeControl: false, streetViewControl: false, fullscreenControl: false }}
          >
            {displayPins.map((pin, i) => (
              <Marker
                key={i}
                position={{ lat: pin.lat, lng: pin.lng }}
                title={pin.title}
                onClick={() => setActivePin(pin)}
              />
            ))}
            {visibleActivePin && (
              <InfoWindow
                position={{ lat: visibleActivePin.lat, lng: visibleActivePin.lng }}
                onCloseClick={() => setActivePin(null)}
              >
                <div className="text-sm font-medium text-stone-900">
                  <span className="mr-1">{typeIcon[visibleActivePin.type]}</span>
                  {visibleActivePin.title}
                </div>
              </InfoWindow>
            )}
          </GoogleMap>
        )}
      </div>
    </div>
  );
}
