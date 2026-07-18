import Link from "next/link";
import { TravelShell } from "@/appShell/TravelShell";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <TravelShell title="Travel">
      <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-base font-semibold text-slate-900">Page not found</p>
        <p className="mt-1 text-sm text-slate-500">
          That trip or page doesn&apos;t exist (it may have been deleted).
        </p>
        <Link href="/trips" className="mt-4 inline-block">
          <Button>Back to trips</Button>
        </Link>
      </div>
    </TravelShell>
  );
}
