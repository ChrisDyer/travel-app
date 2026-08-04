/** The normalized calendar item shape, the feed's filter schema, and the one predicate that
 *  answers "does this item belong in this feed?".
 *
 *  The only import is type-only, and deliberately so: it is erased before Node sees the file,
 *  so `node --test` can load this module (which resolves neither `@/` nor extensionless
 *  relative imports), and the Phase 3 client component can import these types without dragging
 *  node:crypto into the browser bundle. Token generation lives in ./token.ts for that reason.
 */
import type { TripStatus, BookingStatus, EventCategory } from '@/types/travel';

export type CalendarItemKind =
  | 'tripSpan' | 'event' | 'flight' | 'flightReturn'
  | 'hotel' | 'car' | 'parking' | 'transit';

export interface CalendarItem {
  /** `${prefix}-${id}@travel.zo-bot.com`. Stable forever — ids are written once at insert. */
  uid: string;
  kind: CalendarItemKind;
  /** Source row id. The trip id for 'tripSpan'; the flight row id for BOTH flight legs. */
  id: string;
  tripId: string;
  tripTitle: string;
  tripStatus: TripStatus;
  /** null when the app deliberately shows no status: 'tripSpan' and hikes. */
  bookingStatus: BookingStatus | null;
  /** true only for trip_events where skipsBooking() holds. */
  noBookingNeeded: boolean;
  /** Only set when kind === 'event'. */
  eventCategory: EventCategory | null;
  /** The row's hide_from_calendar, OR'd with its trip's. */
  hidden: boolean;

  // --- structurally a superset of EventInput in ./ics.ts ---
  summary: string;
  /** `timeZone` and `utcStamp` mirror EventEndpoint in ./ics.ts — they are filled by items.ts,
   *  which resolves each endpoint's zone and converts the wall time to an absolute instant.
   *  This file only ever reads `.date` (for the window gate), so the filter semantics are
   *  unaffected by them. Kept structurally identical so a CalendarItem is still a valid
   *  EventInput without conversion. */
  start: { date: string; time?: string | null; timeZone?: string | null; utcStamp?: string | null };
  end?: { date: string; time?: string | null; timeZone?: string | null; utcStamp?: string | null } | null;
  location?: string | null;
  description?: string | null;

  /** The source row's updated_at (ISO). Drives DTSTAMP and LAST-MODIFIED. */
  updatedAt: string;
}

export interface CalendarFeedFilters {
  /** Trip-level gate. A trip whose status is not listed contributes nothing at all. */
  tripStatuses: TripStatus[];
  /** Item kinds to emit. 'tripSpan' is the all-day trip banner — just another kind. */
  kinds: CalendarItemKind[];
  /** Only consulted for kind 'event'. */
  eventCategories: EventCategory[];
  /** Only consulted for items that actually carry a booking status. */
  bookingStatuses: BookingStatus[];
  /** Events where skipsBooking() is true (walk-in restaurant, walk-up activity). */
  includeNoBookingNeeded: boolean;
  /** Publish each item's DESCRIPTION — confirmation numbers, room/seat details and free-text
   *  notes. **Defaults to false for a feed**, and it is a security control, not a preference:
   *  see DEFAULT_FILTERS. The per-trip download sets it true via EXPORT_PRESET. */
  includeBookingDetails: boolean;
  /** Days before today an item may end and still appear. null = unbounded. */
  windowPastDays: number | null;
  /** Days after today an item may start and still appear. null = unbounded. */
  windowFutureDays: number | null;
}

/** Frozen so a caller who mutates what it was handed fails loudly here, rather than
 *  silently redefining the defaults for the rest of the process. See DEFAULT_FILTERS. */
const ALL_TRIP_STATUSES = Object.freeze<TripStatus[]>(['planning', 'confirmed', 'in-progress', 'completed']);
const ALL_KINDS = Object.freeze<CalendarItemKind[]>([
  'tripSpan', 'event', 'flight', 'flightReturn', 'hotel', 'car', 'parking', 'transit',
]);
const ALL_EVENT_CATEGORIES = Object.freeze<EventCategory[]>([
  'flight', 'hotel', 'restaurant', 'activity', 'hike', 'transport', 'parking', 'note',
]);
const ALL_BOOKING_STATUSES = Object.freeze<BookingStatus[]>(['unbooked', 'pending', 'confirmed']);

/** Maximal on purpose. A subscribed calendar is replaced wholesale on every fetch, so a
 *  narrower default (say, "only the last 90 days") would silently erase last year's trips
 *  from every subscriber's calendar the moment the feed went live. Narrowing is always the
 *  user's deliberate act. See docs/calendar-feed/00-overview.md. */
export const DEFAULT_FILTERS: CalendarFeedFilters = Object.freeze({
  tripStatuses: ALL_TRIP_STATUSES,
  kinds: ALL_KINDS,
  eventCategories: ALL_EVENT_CATEGORIES,
  bookingStatuses: ALL_BOOKING_STATUSES,
  includeNoBookingNeeded: true,
  // The ONE default that is deliberately not maximal. A feed URL is a bearer credential that
  // travels through a chat message to reach each subscriber, never expires, and is stored by
  // Google; a leak is undetectable and revoking it breaks every subscription. Publishing
  // confirmation numbers, loyalty numbers and free-text notes into that is a much larger blast
  // radius than publishing where-and-when. A calendar's job is when and where; opt in for the
  // rest. See docs/calendar-feed/PROGRESS.md, Phase 3.
  includeBookingDetails: false,
  windowPastDays: null,
  windowFutureDays: null,
}) as CalendarFeedFilters;

/** The per-trip .ics download filters nothing — it keeps showing everything, as it always has,
 *  INCLUDING descriptions: it is an authenticated download of one trip to your own machine, not
 *  a public URL, so the reasoning behind the feed default does not apply. It still runs the
 *  predicate so `hidden` is honoured there too.
 *
 *  A distinct frozen object rather than an alias of DEFAULT_FILTERS, because the two now
 *  disagree on exactly one field. */
export const EXPORT_PRESET: CalendarFeedFilters = Object.freeze({
  ...DEFAULT_FILTERS,
  includeBookingDetails: true,
}) as CalendarFeedFilters;

/** Noon-UTC anchored, per src/lib/dates.ts. Copied rather than imported to keep this file
 *  loadable by `node --test`. */
function addDays(ymd: string, delta: number): string {
  const dt = new Date(ymd + 'T12:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

/** The single answer to "does this item belong in this feed?". Both the feed route and the
 *  per-trip download call it; do not re-test these columns inline anywhere else.
 *  `today` is 'YYYY-MM-DD', injected so this stays pure and testable. */
export function includeItem(item: CalendarItem, f: CalendarFeedFilters, today: string): boolean {
  // 1. Global per-item / per-trip hide. Wins over every filter.
  if (item.hidden) return false;

  // 2. Trip status.
  if (!f.tripStatuses.includes(item.tripStatus)) return false;

  // 3. Item kind (the only gate the trip-span banner answers to).
  if (!f.kinds.includes(item.kind)) return false;

  // 4. Event category — only meaningful for kind 'event', and only for a category the UI can
  //    actually represent. An event whose category is outside EventCategory (there is a real
  //    'sports' row in production, written before/around the enum) FAILS OPEN and is included.
  //    The settings UI renders one checkbox per known category, so an unknown one has no
  //    checkbox and could never be switched back on — dropping it would mean a confirmed,
  //    booked event silently missing from someone's calendar forever, with no way to diagnose
  //    it. An unexpected event on a calendar is a far cheaper mistake than a missing one.
  if (item.kind === 'event') {
    const known = item.eventCategory !== null
      && (ALL_EVENT_CATEGORIES as readonly string[]).includes(item.eventCategory);
    if (known && !f.eventCategories.includes(item.eventCategory!)) return false;
  }

  // 5. Booking gate. Three disjoint cases, no overlap:
  //    - noBookingNeeded        -> its own toggle, never the status list.
  //    - bookingStatus === null -> carries no status by design (trip span, hikes). Pass.
  //    - otherwise              -> must be in the chosen statuses.
  if (item.noBookingNeeded) {
    if (!f.includeNoBookingNeeded) return false;
  } else if (item.bookingStatus !== null) {
    if (!f.bookingStatuses.includes(item.bookingStatus)) return false;
  }

  // 6. Date window, on overlap (an item spanning today is always in).
  const lastDay = item.end?.date ?? item.start.date;
  if (f.windowPastDays !== null && lastDay < addDays(today, -f.windowPastDays)) return false;
  if (f.windowFutureDays !== null && item.start.date > addDays(today, f.windowFutureDays)) return false;

  return true;
}

export function filterItems(items: CalendarItem[], f: CalendarFeedFilters, today: string): CalendarItem[] {
  return items.filter((item) => includeItem(item, f, today));
}

/** Drops each item's DESCRIPTION unless the filters opt into booking details.
 *
 *  The whole description goes, not just the `Conf:` line. Confirmation and order numbers are
 *  structured and could be stripped individually, but card fragments ('VISA ****8479'),
 *  loyalty numbers and anything else sensitive live in free-text `notes` written by hand —
 *  there is no reliable pattern for those, and a redactor that is 90% right on secrets is
 *  worse than useless. Dropping the field entirely is the only rule that cannot leak.
 *
 *  SUMMARY, LOCATION and the times are untouched: where and when is the point of a calendar. */
export function redactItems(items: CalendarItem[], f: CalendarFeedFilters): CalendarItem[] {
  if (f.includeBookingDetails) return items;
  return items.map((item) => (item.description == null ? item : { ...item, description: null }));
}

/** Filter, then redact — the single entry point both the feed route and the per-trip download
 *  use. Deliberately one call rather than two: redaction is a security control, and a caller
 *  that remembered filterItems but forgot redactItems would silently publish confirmation
 *  numbers to a public URL. Do not bypass this by calling filterItems directly in a route. */
export function prepareItems(items: CalendarItem[], f: CalendarFeedFilters, today: string): CalendarItem[] {
  return redactItems(filterItems(items, f, today), f);
}

/** How many of each kind survived — the "included" counts shown in Settings. */
export function countByKind(items: CalendarItem[]): Record<CalendarItemKind, number> {
  const counts = Object.fromEntries(ALL_KINDS.map((k) => [k, 0])) as Record<CalendarItemKind, number>;
  for (const item of items) counts[item.kind] += 1;
  return counts;
}

// --- Persistence --------------------------------------------------------------------

/** Members not in the closed enum are dropped, not rejected. An EMPTY ARRAY IS MEANINGFUL
 *  and is preserved: "no event categories" is a legitimate choice meaning no day events.
 *  Substituting the default for `[]` would make a whole class impossible to turn off. */
function parseEnumArray<T extends string>(raw: unknown, allowed: readonly T[], fallback: readonly T[]): T[] {
  // A COPY of the fallback, never the shared frozen default itself: the settings UI and the
  // management API both parse-then-modify, and handing back the module's own array would let
  // one edit silently redefine the defaults for every later parse in the process.
  if (!Array.isArray(raw)) return [...fallback];
  return raw.filter((v): v is T => typeof v === 'string' && (allowed as readonly string[]).includes(v));
}

/** A non-negative finite integer, or null for unbounded. Anything else — a negative number,
 *  a float, NaN, a string, a boolean — degrades to null. Never a negative window. */
function parseWindow(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  if (!Number.isInteger(raw) || raw < 0) return null;
  return raw;
}

/** Never throws. Malformed JSON, wrong types and unknown keys all degrade to defaults.
 *  This is THE validator for the feed's filters — the management API uses no other. */
export function parseFeedFilters(raw: string | null | undefined): CalendarFeedFilters {
  let parsed: unknown;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    return { ...DEFAULT_FILTERS };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...DEFAULT_FILTERS };
  const o = parsed as Record<string, unknown>;

  return {
    tripStatuses: parseEnumArray(o.tripStatuses, ALL_TRIP_STATUSES, DEFAULT_FILTERS.tripStatuses),
    kinds: parseEnumArray(o.kinds, ALL_KINDS, DEFAULT_FILTERS.kinds),
    eventCategories: parseEnumArray(o.eventCategories, ALL_EVENT_CATEGORIES, DEFAULT_FILTERS.eventCategories),
    bookingStatuses: parseEnumArray(o.bookingStatuses, ALL_BOOKING_STATUSES, DEFAULT_FILTERS.bookingStatuses),
    includeNoBookingNeeded:
      'includeNoBookingNeeded' in o ? Boolean(o.includeNoBookingNeeded) : DEFAULT_FILTERS.includeNoBookingNeeded,
    includeBookingDetails:
      'includeBookingDetails' in o ? Boolean(o.includeBookingDetails) : DEFAULT_FILTERS.includeBookingDetails,
    windowPastDays: parseWindow(o.windowPastDays),
    windowFutureDays: parseWindow(o.windowFutureDays),
  };
}

/** Keys are written in the interface's own order so a round-trip is byte-stable. */
export function serializeFeedFilters(f: CalendarFeedFilters): string {
  return JSON.stringify({
    tripStatuses: f.tripStatuses,
    kinds: f.kinds,
    eventCategories: f.eventCategories,
    bookingStatuses: f.bookingStatuses,
    includeNoBookingNeeded: f.includeNoBookingNeeded,
    includeBookingDetails: f.includeBookingDetails,
    windowPastDays: f.windowPastDays,
    windowFutureDays: f.windowFutureDays,
  });
}
