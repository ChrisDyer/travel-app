'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, RotateCw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { apiUrl } from '@/lib/api';
import { useReadOnly } from '@/lib/read-only';
import type {
  CalendarFeedFilters, CalendarItemKind,
} from '@/lib/calendar/filters';
import type { TripStatus, BookingStatus, EventCategory } from '@/types/travel';

/** Types only — importing the runtime module would be harmless here, but the labels below are
 *  UI copy rather than domain data, so they live with the component that renders them. */
const TRIP_STATUSES: { value: TripStatus; label: string }[] = [
  { value: 'planning', label: 'Planning' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
];

const KINDS: { value: CalendarItemKind; label: string }[] = [
  { value: 'tripSpan', label: 'Trip banner' },
  { value: 'event', label: 'Day plans' },
  { value: 'flight', label: 'Flights out' },
  { value: 'flightReturn', label: 'Flights back' },
  { value: 'hotel', label: 'Hotels' },
  { value: 'car', label: 'Rental cars' },
  { value: 'parking', label: 'Parking' },
  { value: 'transit', label: 'Transit' },
];

const EVENT_CATEGORIES: { value: EventCategory; label: string }[] = [
  { value: 'restaurant', label: 'Restaurants' },
  { value: 'activity', label: 'Activities' },
  { value: 'hike', label: 'Hikes' },
  { value: 'transport', label: 'Transport' },
  { value: 'flight', label: 'Flight notes' },
  { value: 'hotel', label: 'Hotel notes' },
  { value: 'parking', label: 'Parking notes' },
  { value: 'note', label: 'Notes' },
];

const BOOKING_STATUSES: { value: BookingStatus; label: string }[] = [
  { value: 'unbooked', label: 'Unbooked' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
];

const KIND_LABEL: Record<CalendarItemKind, string> = Object.fromEntries(
  KINDS.map((k) => [k.value, k.label])
) as Record<CalendarItemKind, string>;

/** The repo has no Checkbox primitive; this is the raw markup used in TripEditForm, with
 *  slate-* swapped in to match the Settings page palette. */
function Check({
  checked, onChange, label, hint,
}: { checked: boolean; onChange: (next: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-blue-600"
      />
      <span>
        {label}
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

function Fieldset({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-md border border-slate-200 p-3">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

/** Toggle one member of a closed-enum array filter. */
function toggle<T>(list: T[], value: T, on: boolean): T[] {
  return on ? [...list, value] : list.filter((v) => v !== value);
}

/** '' in the input means unlimited (null). A blank box reading "unlimited" is clearer than
 *  a magic number, and parseFeedFilters already treats anything invalid as unbounded. */
function windowToInput(v: number | null): string {
  return v === null ? '' : String(v);
}
function inputToWindow(raw: string): number | null {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

type Counts = {
  total: number;
  byKind: Record<CalendarItemKind, number>;
  /** Timed items with no resolvable timezone — published as all-day with the time in the title. */
  unresolvedTimezones?: number;
};

export function CalendarFeedActions({
  feedUrl, name, filters: initialFilters,
}: { feedUrl: string; name: string; filters: CalendarFeedFilters }) {
  const readOnly = useReadOnly();
  const router = useRouter();

  const [filters, setFilters] = useState<CalendarFeedFilters>(initialFilters);
  const [saving, setSaving] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [counts, setCounts] = useState<Counts | null>(null);
  const urlRef = useRef<HTMLInputElement>(null);

  /** Guards against out-of-order preview responses: only the newest request may set state. */
  const previewSeq = useRef(0);

  const patch = useCallback((next: Partial<CalendarFeedFilters>) => {
    setFilters((prev) => ({ ...prev, ...next }));
  }, []);

  // Live count for the UNSAVED working set. Debounced; the authoritative number comes from
  // the server after Save + router.refresh().
  useEffect(() => {
    const seq = ++previewSeq.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(apiUrl('/api/calendar/config/preview'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filters }),
        });
        if (!res.ok) return;
        const data = await res.json() as Counts;
        if (seq === previewSeq.current) setCounts(data);
      } catch {
        /* a failed preview is not worth a toast — the saved count is still on screen */
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [filters]);

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(feedUrl);
      toast('Feed URL copied');
    } catch {
      // navigator.clipboard needs a secure context. Degrade rather than silently no-op.
      const el = urlRef.current;
      if (el) {
        el.select();
        try {
          document.execCommand('copy');
          toast('Feed URL copied');
          return;
        } catch { /* fall through */ }
      }
      toast('Could not copy. Select the URL and copy manually.', 'error');
    }
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(apiUrl('/api/calendar/config'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, filters }),
      });
      if (!res.ok) throw new Error();
      toast('Calendar filters saved');
      router.refresh();
    } catch {
      toast('Could not save calendar filters.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function rotate() {
    setRotating(true);
    try {
      const res = await fetch(apiUrl('/api/calendar/config/rotate'), { method: 'POST' });
      if (!res.ok) throw new Error();
      toast('Feed URL rotated. Everyone must re-subscribe.');
      setConfirmRotate(false);
      router.refresh();
    } catch {
      toast('Could not rotate the feed URL.', 'error');
    } finally {
      setRotating(false);
    }
  }

  // Belt and braces on top of the server-side gate: a read-only user is never sent feedUrl
  // in the markup at all (see settings/page.tsx), so this component should not even mount.
  if (readOnly) return null;

  return (
    <div className="mt-4 space-y-5">
      {/* --- the URL ------------------------------------------------------------- */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            ref={urlRef}
            readOnly
            value={feedUrl}
            aria-label="Calendar feed URL"
            onFocus={(e) => e.currentTarget.select()}
            className="h-9 min-w-0 flex-1 font-mono text-xs"
          />
          <Button variant="outline" onClick={copyUrl} className="shrink-0">
            <Copy className="h-4 w-4" aria-hidden="true" />
            Copy
          </Button>
        </div>
        <ul className="space-y-1 text-xs text-slate-500">
          <li><strong className="font-medium text-slate-700">Anyone with this URL can see every trip in the feed.</strong> Treat it like a password.</li>
          <li>One feed, shared. Everyone subscribed sees the same view.</li>
          <li>
            Google refreshes subscribed calendars on its own schedule — often 8 to 24 hours. Each
            subscriber refreshes independently, so two calendars can disagree for a while. There is
            no way to force it except removing and re-adding the calendar.
          </li>
          <li>Renaming the feed does not rename a calendar someone already subscribed to.</li>
        </ul>
      </div>

      {/* --- live count --------------------------------------------------------- */}
      <div className="space-y-1" aria-live="polite">
        <p className="text-sm text-slate-600">
          {counts
            ? <>
                <span className="font-semibold text-slate-900">{counts.total} items</span>
                {' · '}
                {KINDS.filter((k) => counts.byKind[k.value] > 0)
                  .map((k) => `${counts.byKind[k.value]} ${KIND_LABEL[k.value].toLowerCase()}`)
                  .join(' · ') || 'nothing matches these filters'}
              </>
            : 'Counting…'}
        </p>
        {counts && counts.unresolvedTimezones ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <strong className="font-medium">
              {counts.unresolvedTimezones} timed {counts.unresolvedTimezones === 1 ? 'item has' : 'items have'} no timezone
            </strong>{' '}
            and {counts.unresolvedTimezones === 1 ? 'is' : 'are'} published as all-day with the time in
            the title. Open the trip and set its timezone, or give the destination a name that
            geocodes.
          </p>
        ) : null}
      </div>

      {/* --- filters ------------------------------------------------------------ */}
      <div className="grid gap-3">
        <Fieldset legend="Trips">
          {TRIP_STATUSES.map((s) => (
            <Check
              key={s.value}
              label={s.label}
              checked={filters.tripStatuses.includes(s.value)}
              onChange={(on) => patch({ tripStatuses: toggle(filters.tripStatuses, s.value, on) })}
            />
          ))}
        </Fieldset>

        <Fieldset legend="What to include">
          {KINDS.map((k) => (
            <Check
              key={k.value}
              label={k.label}
              checked={filters.kinds.includes(k.value)}
              onChange={(on) => patch({ kinds: toggle(filters.kinds, k.value, on) })}
            />
          ))}
        </Fieldset>

        <Fieldset legend="Day plans">
          {EVENT_CATEGORIES.map((c) => (
            <Check
              key={c.value}
              label={c.label}
              checked={filters.eventCategories.includes(c.value)}
              onChange={(on) => patch({ eventCategories: toggle(filters.eventCategories, c.value, on) })}
            />
          ))}
          <Check
            label="Things with no booking needed"
            hint="Walk-in restaurants and walk-up activities"
            checked={filters.includeNoBookingNeeded}
            onChange={(on) => patch({ includeNoBookingNeeded: on })}
          />
        </Fieldset>

        <Fieldset legend="Bookings">
          {BOOKING_STATUSES.map((b) => (
            <Check
              key={b.value}
              label={b.label}
              checked={filters.bookingStatuses.includes(b.value)}
              onChange={(on) => patch({ bookingStatuses: toggle(filters.bookingStatuses, b.value, on) })}
            />
          ))}
        </Fieldset>

        {/* Off by default and deliberately last: this is the one control that changes how much
            a leaked URL is worth, so it is labelled as a risk rather than a preference. */}
        <Fieldset legend="Booking details">
          <div className="sm:col-span-2">
            <Check
              label="Publish confirmation numbers and notes"
              hint="Off by default. When on, the feed also carries confirmation numbers, room and seat details, and your free-text notes — so anyone with the URL gets them too. Your per-trip .ics downloads always include them."
              checked={filters.includeBookingDetails}
              onChange={(on) => patch({ includeBookingDetails: on })}
            />
          </div>
        </Fieldset>

        <Fieldset legend="Date window">
          <label className="text-sm text-slate-700">
            Days in the past
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="unlimited"
              value={windowToInput(filters.windowPastDays)}
              onChange={(e) => patch({ windowPastDays: inputToWindow(e.target.value) })}
              className="mt-1 h-9"
            />
            <span className="mt-1 block text-xs text-slate-500">Blank means unlimited.</span>
          </label>
          <label className="text-sm text-slate-700">
            Days ahead
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="unlimited"
              value={windowToInput(filters.windowFutureDays)}
              onChange={(e) => patch({ windowFutureDays: inputToWindow(e.target.value) })}
              className="mt-1 h-9"
            />
            <span className="mt-1 block text-xs text-slate-500">Blank means unlimited.</span>
          </label>
        </Fieldset>
      </div>

      {/* --- save --------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={saving}>
          <Save className="h-4 w-4" aria-hidden="true" />
          {saving ? 'Saving…' : 'Save filters'}
        </Button>
        <p className="text-xs text-slate-500">
          Turning something off removes those events from every subscribed calendar. Google
          replaces the whole calendar each time it refreshes.
        </p>
      </div>

      {/* --- rotate ------------------------------------------------------------- */}
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
        {!confirmRotate ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={() => setConfirmRotate(true)}>
              <RotateCw className="h-4 w-4" aria-hidden="true" />
              Rotate feed URL
            </Button>
            <p className="text-xs text-slate-500">Use this if the URL has leaked.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-700">
              Rotating breaks every current subscription. Everyone subscribed must delete the
              calendar in Google and add the new URL. Their existing events stop updating but are
              not removed.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="destructive" onClick={rotate} disabled={rotating}>
                {rotating ? 'Rotating…' : 'Yes, rotate the URL'}
              </Button>
              <Button variant="outline" onClick={() => setConfirmRotate(false)} disabled={rotating}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
