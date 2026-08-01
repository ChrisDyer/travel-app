import type { TripLeg } from '@/types/travel';

export type LegWarning = {
  legId: string | null;
  kind: 'overlap' | 'gap' | 'outside-trip' | 'reversed';
  message: string;
};

function isReversed(leg: TripLeg): boolean {
  return leg.endDate < leg.startDate;
}

function displayPlace(leg: TripLeg): string {
  return leg.resolvedName ?? leg.place;
}

function compareWinningLeg(a: TripLeg, b: TripLeg): number {
  const start = a.startDate.localeCompare(b.startDate);
  if (start !== 0) return start;
  const sort = a.sortOrder - b.sortOrder;
  if (sort !== 0) return sort;
  return a.id.localeCompare(b.id);
}

/** The leg covering `date`, or null if none does. See docs/trip-legs/00-overview.md rule 2. */
export function legForDate(legs: TripLeg[], date: string): TripLeg | null {
  const covering = legs.filter((leg) => !isReversed(leg) && leg.startDate <= date && date <= leg.endDate);
  if (covering.length === 0) return null;
  return covering.sort(compareWinningLeg).at(-1) ?? null;
}

/** Display place for `date`: the covering leg's resolvedName ?? place, else `fallback`. */
export function placeForDate(legs: TripLeg[], date: string, fallback: string): string {
  const leg = legForDate(legs, date);
  return leg ? displayPlace(leg) : fallback;
}

/** Contiguous runs of dates sharing one leg, in date order. Phase 2 renders these. */
export function segmentDates(
  legs: TripLeg[],
  dates: string[],
  fallback: string,
): { leg: TripLeg | null; place: string; dates: string[] }[] {
  const segments: { leg: TripLeg | null; place: string; dates: string[] }[] = [];
  for (const date of dates) {
    const leg = legForDate(legs, date);
    const place = leg ? displayPlace(leg) : fallback;
    const previous = segments.at(-1);
    if (previous && previous.leg?.id === leg?.id && previous.place === place) {
      previous.dates.push(date);
    } else {
      segments.push({ leg, place, dates: [date] });
    }
  }
  return segments;
}

/** Non-blocking problems to surface in the editor. Never used to reject a write. */
export function legWarnings(
  legs: TripLeg[],
  tripStartDate: string,
  tripEndDate: string,
): LegWarning[] {
  const warnings: LegWarning[] = [];
  const validLegs = legs.filter((leg) => {
    if (isReversed(leg)) {
      warnings.push({
        legId: leg.id,
        kind: 'reversed',
        message: `${displayPlace(leg)} ends before it starts.`,
      });
      return false;
    }
    return true;
  });

  for (const leg of validLegs) {
    if (leg.startDate < tripStartDate) {
      warnings.push({ legId: leg.id, kind: 'outside-trip', message: `${displayPlace(leg)} starts before the trip begins.` });
    }
    if (leg.endDate > tripEndDate) {
      warnings.push({ legId: leg.id, kind: 'outside-trip', message: `${displayPlace(leg)} ends after the trip ends.` });
    }
  }

  for (const leg of validLegs) {
    for (const other of validLegs) {
      if (leg.id >= other.id) continue;
      const start = leg.startDate > other.startDate ? leg.startDate : other.startDate;
      const end = leg.endDate < other.endDate ? leg.endDate : other.endDate;
      if (start <= end) {
        const winner = legForDate([leg, other], start);
        warnings.push({
          legId: winner?.id ?? null,
          kind: 'overlap',
          message: `${start} is in both ${displayPlace(leg)} and ${displayPlace(other)} - weather will show ${winner ? displayPlace(winner) : 'the later leg'}.`,
        });
      }
    }
  }

  const sorted = [...validLegs].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate) || a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  let cursor = tripStartDate;
  for (const leg of sorted) {
    if (leg.endDate < tripStartDate || leg.startDate > tripEndDate) continue;
    if (cursor < leg.startDate) {
      warnings.push({ legId: null, kind: 'gap', message: `No place set for ${cursor} - weather will show the trip destination.` });
    }
    if (cursor <= leg.endDate) cursor = nextDate(leg.endDate);
  }
  if (cursor <= tripEndDate) {
    warnings.push({ legId: null, kind: 'gap', message: `No place set for ${cursor} - weather will show the trip destination.` });
  }

  return warnings;
}

function nextDate(date: string): string {
  const dt = new Date(date + 'T12:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}
