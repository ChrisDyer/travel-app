"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, LayoutDashboard, ListChecks, MapIcon, Plus, Settings2 } from "lucide-react";
import { AppSwitcher } from "./AppSwitcher";
import { CURRENT_APP_ID, appDestinations } from "./destinations";
import { MobileNavDrawer } from "./MobileNavDrawer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useReadOnly } from "@/lib/read-only";

export type LocalNavId = "overview" | "trips" | "new" | "map" | "settings";
export type LocalNavItem = {
  id: LocalNavId;
  label: string;
  href: string;
  icon: typeof ListChecks;
  adminOnly?: boolean;
};
export type LocalNavSection = {
  label: string;
  items: LocalNavItem[];
};

type TravelShellProps = {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  contentClassName?: string;
};

const localNavSections: LocalNavSection[] = [
  {
    label: "Plan",
    items: [
      { id: "overview", label: "Overview", href: "/", icon: LayoutDashboard },
      { id: "trips", label: "Trips", href: "/trips", icon: ListChecks },
      { id: "new", label: "New trip", href: "/trips/new", icon: Plus, adminOnly: true },
    ],
  },
  {
    label: "Explore",
    items: [{ id: "map", label: "Map", href: "/map", icon: MapIcon }],
  },
];

const footerNav: LocalNavItem[] = [{ id: "settings", label: "Settings", href: "/settings", icon: Settings2 }];

const allNavItems = [...localNavSections.flatMap((section) => section.items), ...footerNav];

/** The nav id that `pathname` belongs to, or null. Exact for '/', longest-prefix otherwise. */
export function matchNav(pathname: string): string | null {
  const matches = allNavItems
    .filter((item) => (item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`)))
    .sort((a, b) => b.href.length - a.href.length);

  return matches[0]?.id ?? null;
}

function visibleSections(readOnly: boolean): LocalNavSection[] {
  return localNavSections
    .map((section) => ({ ...section, items: section.items.filter((item) => !item.adminOnly || !readOnly) }))
    .filter((section) => section.items.length > 0);
}

function visibleFooter(readOnly: boolean): LocalNavItem[] {
  return footerNav.filter((item) => !item.adminOnly || !readOnly);
}

export function TravelShell({
  title,
  subtitle,
  backHref,
  backLabel = "Back",
  actions,
  children,
  contentClassName,
}: TravelShellProps) {
  const readOnly = useReadOnly();
  const pathname = usePathname();
  const activeNav = matchNav(pathname);
  const sections = visibleSections(readOnly);
  const footer = visibleFooter(readOnly);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-56 flex-col overflow-y-auto bg-slate-900 px-3 py-4 text-slate-200 lg:flex">
        <AppSwitcher
          currentAppId={CURRENT_APP_ID}
          currentAppLabel="Travel"
          destinations={appDestinations}
          placement="sidebar"
        />

        <div className="mt-5 space-y-6 border-t border-slate-800 pt-5">
          <nav className="space-y-5" aria-label="Travel navigation">
            {sections.map((section) => (
              <div key={section.label}>
                <p className="px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{section.label}</p>
                <div className="mt-2 grid gap-1">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const active = item.id === activeNav;
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
                </div>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-auto border-t border-slate-800 pt-4">
          {footer.map((item) => {
            const Icon = item.icon;
            const active = item.id === activeNav;
            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900",
                  active ? "bg-blue-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </aside>

      <div className="lg:pl-56">
        <header className="no-print sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] shadow-sm backdrop-blur lg:px-6 lg:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex shrink-0 items-center gap-2 lg:hidden">
                <MobileNavDrawer sections={sections} footerItems={footer} activeNav={activeNav} />
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
  const readOnly = useReadOnly();
  if (readOnly) return null;

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
