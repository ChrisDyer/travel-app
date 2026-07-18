"use client";

import { useEffect } from "react";
import { TravelShell } from "@/appShell/TravelShell";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <TravelShell title="Travel">
      <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-base font-semibold text-slate-900">Something went wrong</p>
        <p className="mt-1 text-sm text-slate-500">
          Travel could not finish loading this page. Any data shown may be stale.
        </p>
        <Button className="mt-4" onClick={reset}>Try again</Button>
      </div>
    </TravelShell>
  );
}
