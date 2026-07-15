'use client';

import { useEffect, useState } from 'react';
import { Trip, TripEvent, TripFlight, TripHotel, TripParking, TripRentalCar, TripTransit } from '@/types/travel';
import { apiUrl } from '@/lib/api';

interface TripCostSummaryProps {
  trip?: Trip;
  events: TripEvent[];
  flights: TripFlight[];
  hotels: TripHotel[];
  parking: TripParking[];
  rentalCars: TripRentalCar[];
  transit: TripTransit[];
}

const HOME_CURRENCY = (process.env.NEXT_PUBLIC_HOME_CURRENCY || 'USD').toUpperCase();

function fmt(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(0)}`;
  }
}

export function TripCostSummary({ trip, events, flights, hotels, parking, rentalCars, transit }: TripCostSummaryProps) {
  // Convert everything into the budget's currency if a budget is set, else the configured
  // home currency, so the grand total and the budget bar share one unit.
  const homeCurrency = (trip?.budgetCurrency || HOME_CURRENCY).toUpperCase();
  const [rates, setRates] = useState<Record<string, number> | null>(null);

  const totals = new Map<string, number>();
  const add = (cost: number | null | undefined, currency: string | null | undefined) => {
    if (!cost || cost <= 0) return;
    const key = (currency ?? 'USD').toUpperCase();
    totals.set(key, (totals.get(key) ?? 0) + cost);
  };
  for (const e of events) { if (e.category !== 'note') add(e.cost, e.currency); }
  for (const f of flights) add(f.cost, f.currency);
  for (const h of hotels) add(h.cost, h.currency);
  for (const p of parking) add(p.cost, p.currency);
  for (const c of rentalCars) add(c.cost, c.currency);
  for (const t of transit) add(t.cost, t.currency);

  const entries = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const needsConversion = entries.some(([c]) => c !== homeCurrency);

  useEffect(() => {
    if (!needsConversion && trip?.budget == null) return; // nothing to convert
    let active = true;
    fetch(apiUrl(`/api/rates?base=${homeCurrency}`))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (active && d?.rates) setRates(d.rates); })
      .catch(() => {});
    return () => { active = false; };
  }, [homeCurrency, needsConversion, trip?.budget]);

  // Convert a per-currency amount into the home currency. rates[X] = units of X per 1 home,
  // so home = amount / rates[X]. Returns null if a needed rate is missing.
  function toHome(amount: number, currency: string): number | null {
    if (currency === homeCurrency) return amount;
    const rate = rates?.[currency];
    return rate ? amount / rate : null;
  }

  let grandTotal: number | null = 0;
  for (const [currency, total] of entries) {
    const converted = toHome(total, currency);
    if (converted == null) { grandTotal = null; break; }
    grandTotal += converted;
  }

  if (entries.length === 0 && trip?.budget == null) return null;

  const budget = trip?.budget ?? null;
  const pct = budget && grandTotal != null && budget > 0 ? Math.min(100, Math.round((grandTotal / budget) * 100)) : null;
  const over = budget != null && grandTotal != null && grandTotal > budget;

  return (
    <div className="mt-6 bg-white rounded-xl border border-stone-200 p-4">
      <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">Trip Cost Summary</h3>

      <div className="space-y-1.5">
        {entries.map(([currency, total]) => (
          <div key={currency} className="flex items-center justify-between">
            <span className="text-sm text-stone-500">{currency}</span>
            <span className="text-sm font-semibold text-stone-800">{fmt(total, currency)}</span>
          </div>
        ))}
      </div>

      {grandTotal != null && (needsConversion || budget != null) && (
        <div className="mt-3 pt-3 border-t border-stone-100 flex items-center justify-between">
          <span className="text-sm text-stone-500">Total{needsConversion ? ` (≈ ${homeCurrency})` : ''}</span>
          <span className="text-sm font-bold text-stone-900">{fmt(grandTotal, homeCurrency)}</span>
        </div>
      )}
      {grandTotal == null && needsConversion && (
        <p className="mt-2 text-xs text-amber-600">
          Currency conversion is unavailable right now — totals above are shown per currency.
          {budget != null ? ' Budget comparison will return when rates are back.' : ''}
        </p>
      )}

      {budget != null && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-stone-500">Budget</span>
            <span className={over ? 'text-red-600 font-semibold' : 'text-stone-600'}>
              {grandTotal != null ? `${fmt(grandTotal, homeCurrency)} of ` : ''}{fmt(budget, homeCurrency)}
            </span>
          </div>
          {pct != null && (
            <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${over ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
            </div>
          )}
          {over && <p className="mt-1 text-xs text-red-600">Over budget by {fmt(grandTotal! - budget, homeCurrency)}</p>}
        </div>
      )}
    </div>
  );
}
