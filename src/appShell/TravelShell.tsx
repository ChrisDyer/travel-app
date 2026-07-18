"use client";

import Link from "next/link";
import { CalendarDays, ListChecks, Plus, Route, Settings2 } from "lucide-react";
import { AppSwitcher } from "./AppSwitcher";
import { CURRENT_APP_ID, appDestinations } from "./destinations";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type LocalNavId = "trips" | "new";

type TravelShellProps = {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  activeLocalNav?: LocalNavId;
  actions?: React.ReactNode;
  children: React.ReactNode;
  contentClassName?: string;
};

const localNav: Array<{
  id: LocalNavId;
  label: string;
  href: string;
  icon: typeof ListChecks;
}> = [
  { id: "trips", label: "Trips", href: "/trips", icon: ListChecks },
  { id: "new", label: "New trip", href: "/trips/new", icon: Plus },
];

export function TravelShell({
  title,
  subtitle,
  backHref,
  backLabel = "Back",
  activeLocalNav = "trips",
  actions,
  children,
  contentClassName,
}: TravelShellProps) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-56 flex-col overflow-y-auto bg-slate-900 px-3 py-4 text-slate-200 lg:flex">
        <AppSwitcher
          currentAppId={CURRENT_APP_ID}
          currentAppLabel="Travel"
          destinations={appDestinations}
          placement="sidebar"
        />

        <div className="mt-5 border-t border-slate-800 pt-5">
          <p className="px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Travel</p>
          <nav className="mt-2 grid gap-1" aria-label="Travel navigation">
            {localNav.map((item) => {
              const Icon = item.icon;
              const active = item.id === activeLocalNav;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900",
                    active
                      ? "bg-blue-600 text-white"
                      : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto border-t border-slate-800 pt-4">
          <div className="flex items-start gap-3 rounded-md px-3 py-2 text-xs text-slate-500">
            <Route className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Itineraries, bookings, maps, and exports stay local to Travel.</span>
          </div>
        </div>
      </aside>

      <div className="lg:pl-56">
        <header className="no-print sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] shadow-sm backdrop-blur lg:px-6 lg:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="lg:hidden">
                <AppSwitcher
                  currentAppId={CURRENT_APP_ID}
                  currentAppLabel="Travel"
                  destinations={appDestinations}
                  placement="mobile-header"
                />
              </div>
              <div className="min-w-0">
                {backHref && (
                  <Link
                    href={backHref}
                    className="mb-0.5 inline-flex text-xs font-medium text-slate-500 hover:text-slate-900"
                  >
                    &larr; {backLabel}
                  </Link>
                )}
                <div className="flex min-w-0 items-center gap-2">
                  <CalendarDays className="hidden h-5 w-5 shrink-0 text-blue-600 sm:block" aria-hidden="true" />
                  <h1 className="truncate text-lg font-semibold text-slate-950 sm:text-xl lg:text-2xl">{title}</h1>
                </div>
                {subtitle && <p className="truncate text-sm text-slate-500">{subtitle}</p>}
              </div>
            </div>
            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
          </div>
        </header>

        <main className={cn("mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8", contentClassName)}>
          {children}
        </main>
      </div>
    </div>
  );
}

export function NewTripAction() {
  return (
    <Link href="/trips/new">
      <Button>
        <Plus className="h-4 w-4" />
        <span>New Trip</span>
      </Button>
    </Link>
  );
}

export function ShellUtilityButton({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Button variant="outline" size="sm" className={cn("border-slate-300 text-slate-700", className)}>
      <Settings2 className="h-4 w-4" />
      {children}
    </Button>
  );
}

