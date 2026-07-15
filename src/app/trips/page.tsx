import Link from 'next/link';
import { Home } from 'lucide-react';
import { db, camelizeAll } from '@/db';
import { getServerUserId } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Trip } from '@/types/travel';
import { TripsClient } from '@/components/trips/TripsClient';

export default async function TripsPage() {
  const userId = await getServerUserId();
  const rows = db.prepare('SELECT * FROM trips WHERE user_id = ? ORDER BY start_date ASC').all(userId) as Record<string, unknown>[];
  const trips = camelizeAll<Trip>(rows);

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="bg-white border-b border-stone-200 px-6 py-4 pt-[max(1rem,env(safe-area-inset-top))] flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- leaves the Next app for the homepage launcher; must be a real navigation, not client-side routing */}
          <a href="/" className="hidden [@media(display-mode:standalone)]:block text-stone-400 hover:text-stone-700 transition-colors" title="Zo-Bot Home">
            <Home size={18} />
          </a>
          <h1 className="text-2xl font-serif font-bold text-stone-900">My Trips</h1>
        </div>
        <Link href="/trips/new">
          <Button>+ New Trip</Button>
        </Link>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <TripsClient initialTrips={trips} />
      </main>
    </div>
  );
}
