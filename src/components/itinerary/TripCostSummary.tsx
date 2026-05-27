import { TripEvent, TripFlight, TripHotel, TripParking, TripRentalCar, TripTransit } from '@/types/travel';

interface TripCostSummaryProps {
  events: TripEvent[];
  flights: TripFlight[];
  hotels: TripHotel[];
  parking: TripParking[];
  rentalCars: TripRentalCar[];
  transit: TripTransit[];
}

export function TripCostSummary({ events, flights, hotels, parking, rentalCars, transit }: TripCostSummaryProps) {
  const totals = new Map<string, number>();

  function add(cost: number | null | undefined, currency: string | null | undefined) {
    if (!cost || cost <= 0) return;
    const key = (currency ?? 'USD').toUpperCase();
    totals.set(key, (totals.get(key) ?? 0) + cost);
  }

  for (const e of events) add(e.cost, e.currency);
  for (const f of flights) add(f.cost, f.currency);
  for (const h of hotels) add(h.cost, h.currency);
  for (const p of parking) add(p.cost, p.currency);
  for (const c of rentalCars) add(c.cost, c.currency);
  for (const t of transit) add(t.cost, t.currency);

  if (totals.size === 0) return null;

  const entries = [...totals.entries()].sort((a, b) => b[1] - a[1]);

  function fmt(amount: number, currency: string) {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
    } catch {
      return `${currency} ${amount.toFixed(0)}`;
    }
  }

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
      {entries.length > 1 && (
        <p className="mt-2 text-xs text-stone-400">Multiple currencies — totals are not combined.</p>
      )}
    </div>
  );
}
