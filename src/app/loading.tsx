import { TravelShell } from "@/appShell/TravelShell";

export default function Loading() {
  return (
    <TravelShell title="Travel">
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white">
            <div className="h-36 w-full rounded-t-xl bg-slate-100" />
            <div className="space-y-2 p-4">
              <div className="h-4 w-2/3 rounded bg-slate-100" />
              <div className="h-3 w-1/2 rounded bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
      <p className="sr-only">Loading Travel…</p>
    </TravelShell>
  );
}
