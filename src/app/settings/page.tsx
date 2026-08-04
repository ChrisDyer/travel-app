import { headers } from 'next/headers';
import { AlertCircle, CalendarDays, CheckCircle2, Cloud, Database, KeyRound, Mail, ShieldCheck } from 'lucide-react';
import { db } from '@/db';
import { TravelShell } from '@/appShell/TravelShell';
import { GmailActions } from '@/components/settings/GmailActions';
import { CalendarFeedActions } from '@/components/settings/CalendarFeedActions';
import { ensureFeed } from '@/lib/calendar/feeds';
import { parseFeedFilters, filterItems } from '@/lib/calendar/filters';
import { buildCalendarItems } from '@/lib/calendar/items';
import { localToday } from '@/lib/trip-status';
import { apiUrl } from '@/lib/api';
import { getAccessInfo, getServerUserId } from '@/lib/auth';
import type { Trip } from '@/types/travel';

type GmailTokenStatus = {
  scope: string;
  expires_at: string;
  created_at: string;
  has_refresh_token: number;
  is_expired: number;
} | undefined;

type SettingsPageProps = {
  searchParams: Promise<{ gmailError?: string }>;
};

function Card({ title, icon, children, className = '' }: { title: string; icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6 ${className}`}>
      <div className="mb-4 flex items-center gap-2">
        {icon}
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${ok ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}`}>
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />}
      {label}
    </span>
  );
}

function fmtDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function gmailErrorMessage(reason: string | undefined): string | null {
  if (!reason) return null;
  if (reason === 'state_mismatch') return 'Gmail connect failed because the OAuth state did not match. Start the connection again.';
  if (reason === 'no_code') return 'Gmail connect failed because Google did not return an authorization code.';
  if (reason === 'token_exchange_failed') return 'Gmail connect failed during token exchange.';
  return 'Gmail connect failed.';
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const params = await searchParams;
  const userId = await getServerUserId();
  const access = await getAccessInfo();
  const gmail = db.prepare(`
    SELECT scope, expires_at, created_at, CASE WHEN refresh_token IS NULL OR refresh_token = '' THEN 0 ELSE 1 END AS has_refresh_token, CASE WHEN expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now') THEN 1 ELSE 0 END AS is_expired
    FROM gmail_tokens
    WHERE user_id = ?
  `).get(userId) as GmailTokenStatus;
  const gmailConnected = Boolean(gmail);
  const gmailExpired = Boolean(gmail?.is_expired);
  const error = gmailErrorMessage(params.gmailError);

  const counts = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM trips WHERE user_id = ?) AS trips,
      (SELECT COUNT(*) FROM trip_events JOIN trips ON trips.id = trip_events.trip_id WHERE trips.user_id = ?) AS events,
      (SELECT COUNT(*) FROM trip_flights JOIN trips ON trips.id = trip_flights.trip_id WHERE trips.user_id = ?) AS flights,
      (SELECT COUNT(*) FROM trip_hotels JOIN trips ON trips.id = trip_hotels.trip_id WHERE trips.user_id = ?) AS hotels
  `).get(userId, userId, userId, userId) as { trips: number; events: number; flights: number; hotels: number };
  const trips = db.prepare('SELECT id, title, destination, start_date AS startDate, end_date AS endDate FROM trips WHERE user_id = ? ORDER BY start_date ASC').all(userId) as Pick<Trip, 'id' | 'title' | 'destination' | 'startDate' | 'endDate'>[];

  // Calendar feed. ensureFeed is lazy — this page is its first caller in normal use.
  const feed = ensureFeed(userId);
  const feedFilters = parseFeedFilters(feed.filters);
  const feedItems = buildCalendarItems({ userId });
  const feedIncluded = filterItems(feedItems, feedFilters, localToday());

  // Built from the forwarded headers nginx sets, which is reliable where request.url is not
  // (behind nginx that resolves to the internal bind address). Deliberately NOT
  // NEXT_PUBLIC_APP_URL: that is pinned to the legacy travel.zo-bot.com, which 301s
  // cross-hostname into a DIFFERENT Cloudflare Access application. Server-side construction
  // also avoids a hydration flash of the wrong origin.
  const hdrs = await headers();
  const proto = hdrs.get('x-forwarded-proto') ?? 'http';
  const origin = `${proto}://${hdrs.get('host') ?? 'localhost:3000'}`;
  const feedUrl = `${origin}${apiUrl(`/api/calendar/feed/${feed.token}.ics`)}`;

  const integrations = [
    { name: 'Google Maps', ok: Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY), detail: 'Trip Map page, Places autocomplete' },
    { name: 'Claude', ok: Boolean(process.env.ANTHROPIC_API_KEY), detail: 'Trip assistant and packing suggestions' },
    { name: 'Gmail OAuth', ok: Boolean(process.env.GOOGLE_GMAIL_CLIENT_ID && process.env.GOOGLE_GMAIL_CLIENT_SECRET), detail: 'Booking email import' },
    { name: 'Weather & geocoding', ok: true, detail: 'Open-Meteo, no key required' },
    { name: 'Currency rates', ok: true, detail: 'open.er-api.com, no key required' },
  ];

  return (
    <TravelShell title="Settings" subtitle="Connections, access, and exports" contentClassName="max-w-5xl">
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Gmail" icon={<Mail className="h-5 w-5 text-blue-600" aria-hidden="true" />}>
          {error && <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2 text-sm text-slate-600">
              <StatusPill ok={gmailConnected && !gmailExpired} label={!gmailConnected ? 'Not connected' : gmailExpired ? 'Expired' : 'Connected'} />
              <p>Scanned label: <span className="font-medium text-slate-900">Trip Bookings</span></p>
              {gmail && (
                <dl className="grid gap-1 pt-2 text-sm">
                  <div><dt className="inline text-slate-500">Scope: </dt><dd className="inline break-words text-slate-900">{gmail.scope}</dd></div>
                  <div><dt className="inline text-slate-500">Connected: </dt><dd className="inline text-slate-900">{fmtDate(gmail.created_at)}</dd></div>
                  <div><dt className="inline text-slate-500">Expires: </dt><dd className="inline text-slate-900">{fmtDate(gmail.expires_at)}</dd></div>
                  <div><dt className="inline text-slate-500">Refresh token stored: </dt><dd className="inline text-slate-900">{gmail.has_refresh_token ? 'Yes' : 'No'}</dd></div>
                </dl>
              )}
            </div>
            <GmailActions connected={gmailConnected} />
          </div>
        </Card>

        <Card title="Calendar feed" icon={<CalendarDays className="h-5 w-5 text-blue-600" aria-hidden="true" />} className="lg:col-span-2">
          <div className="space-y-2 text-sm text-slate-600">
            <StatusPill ok={feedIncluded.length > 0} label={`${feedIncluded.length} of ${feedItems.length} items included`} />
            <p>
              Last fetched:{' '}
              <span className="font-medium text-slate-900">
                {feed.lastFetchedAt ? fmtDate(feed.lastFetchedAt) : 'never fetched yet'}
              </span>
            </p>
            {!feedFilters.includeBookingDetails && (
              <p className="text-xs text-slate-500">
                Confirmation numbers and notes are not published to the feed.
              </p>
            )}
          </div>
          {/* The feed URL is a bearer credential, so it is passed only inside this branch —
              hiding the controls client-side would still leave the token in the markup. */}
          {!access.readOnly && (
            <CalendarFeedActions feedUrl={feedUrl} name={feed.name} filters={feedFilters} />
          )}
        </Card>

        <Card title="Access" icon={<ShieldCheck className="h-5 w-5 text-blue-600" aria-hidden="true" />}>
          <div className="space-y-3 text-sm text-slate-600">
            <StatusPill ok={!access.readOnly} label={access.readOnly ? 'Read-only' : 'Admin'} />
            <p>Email: <span className="font-medium text-slate-900">{access.email ?? 'not signed in via Cloudflare Access'}</span></p>
            <p>Writes are gated by ADMIN_EMAILS. Unset or empty means everyone is an admin.</p>
          </div>
        </Card>

        <Card title="Integrations" icon={<KeyRound className="h-5 w-5 text-blue-600" aria-hidden="true" />}>
          <div className="grid gap-3">
            {integrations.map((row) => (
              <div key={row.name} className="flex items-start justify-between gap-4 rounded-md border border-slate-200 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-slate-900">{row.name}</p>
                  <p className="text-xs text-slate-500">{row.detail}</p>
                </div>
                <StatusPill ok={row.ok} label={row.ok ? 'Configured' : 'Missing'} />
              </div>
            ))}
          </div>
        </Card>

        <Card title="Data" icon={<Database className="h-5 w-5 text-blue-600" aria-hidden="true" />}>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {Object.entries(counts).map(([label, value]) => (
              <div key={label} className="rounded-md bg-slate-50 px-3 py-2">
                <p className="text-xs capitalize text-slate-500">{label}</p>
                <p className="text-lg font-semibold text-slate-950">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-5">
            <h3 className="text-sm font-semibold text-slate-900">Calendar exports</h3>
            <div className="mt-3 grid gap-2">
              {trips.map((trip) => (
                <a key={trip.id} href={apiUrl(`/api/trips/${trip.id}/export`)} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm hover:border-slate-300 hover:bg-slate-50">
                  <span className="min-w-0 truncate text-slate-900">{trip.title}</span>
                  <Cloud className="h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
                </a>
              ))}
              {trips.length === 0 && <p className="text-sm text-slate-500">No trip exports available.</p>}
            </div>
          </div>
        </Card>
      </div>
    </TravelShell>
  );
}
