import { NextResponse } from 'next/server';

// Daily-cached FX rates from open.er-api.com (free, no key). `rates[X]` is the number of
// units of currency X per 1 unit of `base`.
const cache: Record<string, { at: number; data: unknown }> = {};
const TTL = 12 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const base = (new URL(request.url).searchParams.get('base') || 'USD').toUpperCase();
  if (!/^[A-Z]{3}$/.test(base)) return NextResponse.json({ error: 'invalid base' }, { status: 400 });

  const hit = cache[base];
  if (hit && Date.now() - hit.at < TTL) return NextResponse.json(hit.data);

  try {
    const r = await fetch(`https://open.er-api.com/v6/latest/${base}`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error('rates fetch failed');
    const j = await r.json() as { result?: string; rates?: Record<string, number>; time_last_update_utc?: string };
    if (j.result !== 'success' || !j.rates) throw new Error('rates unavailable');
    const data = { base, rates: j.rates, date: j.time_last_update_utc ?? null };
    cache[base] = { at: Date.now(), data };
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'rates error' }, { status: 502 });
  }
}
