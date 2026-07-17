import { db, camelizeAll } from '@/db';
import { getServerUserId } from '@/lib/auth';
import { Trip } from '@/types/travel';
import { TripsClient } from '@/components/trips/TripsClient';
import { NewTripAction, TravelShell } from '@/appShell/TravelShell';

export default async function TripsPage() {
  const userId = await getServerUserId();
  const rows = db.prepare('SELECT * FROM trips WHERE user_id = ? ORDER BY start_date ASC').all(userId) as Record<string, unknown>[];
  const trips = camelizeAll<Trip>(rows);

  return (
    <TravelShell
      title="My Trips"
      subtitle="Plan, compare, and manage itineraries"
      activeLocalNav="trips"
      actions={<NewTripAction />}
      contentClassName="max-w-6xl"
    >
      <TripsClient initialTrips={trips} />
    </TravelShell>
  );
}
