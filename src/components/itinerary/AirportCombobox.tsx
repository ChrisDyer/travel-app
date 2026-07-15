'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { apiUrl } from '@/lib/api';

interface Airport {
  iata: string;
  name: string;
  city: string;
  country: string;
}

interface AirportComboboxProps {
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  id?: string;
}

let cachedAirports: Airport[] | null = null;

async function loadAirports(): Promise<Airport[]> {
  if (cachedAirports) return cachedAirports;
  const res = await fetch(apiUrl('/airports.json'));
  cachedAirports = await res.json();
  return cachedAirports!;
}

function score(airport: Airport, q: string): number {
  const iata = airport.iata.toLowerCase();
  const city = airport.city.toLowerCase();
  const name = airport.name.toLowerCase();
  if (iata === q) return 0;
  if (iata.startsWith(q)) return 1;
  if (city.startsWith(q)) return 2;
  if (city.includes(q)) return 3;
  if (name.includes(q)) return 4;
  return 99;
}

function search(airports: Airport[], query: string): Airport[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return airports
    .map((a) => ({ a, s: score(a, q) }))
    .filter(({ s }) => s < 99)
    .sort((x, y) => x.s - y.s || x.a.iata.localeCompare(y.a.iata))
    .slice(0, 8)
    .map(({ a }) => a);
}

export function AirportCombobox({ name, defaultValue, placeholder = 'City or code', id }: AirportComboboxProps) {
  const [text, setText] = useState(defaultValue ?? '');
  const [results, setResults] = useState<Airport[]>([]);
  const [open, setOpen] = useState(false);
  const [airports, setAirports] = useState<Airport[] | null>(cachedAirports);
  const [activeIdx, setActiveIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const runSearch = useCallback(
    (q: string, list: Airport[]) => {
      const res = search(list, q);
      setResults(res);
      setOpen(res.length > 0);
      setActiveIdx(-1);
    },
    []
  );

  async function handleFocus() {
    const list = airports ?? (await loadAirports());
    if (!airports) setAirports(list);
    if (text) runSearch(text, list);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setText(val);
    if (airports) runSearch(val, airports);
  }

  function select(airport: Airport) {
    const value = `${airport.city} (${airport.iata})`;
    setText(value);
    setOpen(false);
    setResults([]);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      select(results[activeIdx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        value={text}
        autoComplete="off"
        placeholder={placeholder}
        onFocus={handleFocus}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      {open && (
        <ul className="absolute z-50 mt-1 w-full rounded-md border border-stone-200 bg-white shadow-lg overflow-hidden">
          {results.map((airport, i) => (
            <li
              key={airport.iata}
              onMouseDown={() => select(airport)}
              className={`flex items-baseline gap-2 px-3 py-2 cursor-pointer text-sm ${
                i === activeIdx ? 'bg-stone-100' : 'hover:bg-stone-50'
              }`}
            >
              <span className="font-mono font-semibold text-stone-800 w-8 shrink-0">{airport.iata}</span>
              <span className="text-stone-600 truncate">
                {airport.city}
                <span className="text-stone-400 ml-1 text-xs">{airport.name}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
