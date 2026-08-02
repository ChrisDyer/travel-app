import Link from 'next/link';
import { db } from '@/db';
import { TravelShell } from '@/appShell/TravelShell';
import { TripsMap } from '@/components/map/TripsMap';
import { Button } from '@/components/ui/button';
import { getAccessInfo, getServerUserId } from '@/lib/auth';

export default async function MapPage() {
  const userId = await getServerUserId();
  const access = await getAccessInfo();
  const count = (db.prepare('SELECT COUNT(*) AS value FROM trips WHERE user_id = ?').get(userId) as { value: number }).value;

  return (
    <TravelShell title="Map" subtitle="Every trip and cached stop in one view" contentClassName="max-w-none">
      {count === 0 ? (
        <section className="mx-auto max-w-xl rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-xl font-semibold text-slate-950">No trips to map</h2>
          <p className="mt-2 text-sm text-slate-500">Create a trip and its destination will appear here.</p>
          {!access.readOnly && (
            <Link href="/trips/new" className="mt-5 inline-flex">
              <Button>Plan a trip</Button>
            </Link>
          )}
        </section>
      ) : (
        <TripsMap />
      )}
    </TravelShell>
  );
}
