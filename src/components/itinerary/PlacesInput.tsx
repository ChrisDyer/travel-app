'use client';

import { useRef } from 'react';
import { useJsApiLoader, Autocomplete } from '@react-google-maps/api';
import { Input } from '@/components/ui/input';

interface PlacesInputProps {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
}

const libraries: ('places')[] = ['places'];

export function PlacesInput({ id, name, defaultValue, onChange, placeholder, className, required }: PlacesInputProps) {
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '',
    libraries,
  });

  function onPlaceChanged() {
    const place = autocompleteRef.current?.getPlace();
    const address = place?.formatted_address ?? place?.name ?? '';
    if (address && inputRef.current) {
      inputRef.current.value = address;
      onChange?.(address);
    }
  }

  if (!isLoaded) {
    return (
      <Input
        id={id}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className={className}
        required={required}
      />
    );
  }

  return (
    <Autocomplete
      onLoad={(ac) => { autocompleteRef.current = ac; }}
      onPlaceChanged={onPlaceChanged}
      options={{ types: ['establishment', 'geocode'] }}
    >
      <Input
        ref={inputRef}
        id={id}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className={className}
        required={required}
      />
    </Autocomplete>
  );
}
