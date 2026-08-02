"use client";

import { useState } from "react";
import Link from "next/link";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Menu, X } from "lucide-react";
import { AppSwitcher } from "./AppSwitcher";
import { CURRENT_APP_ID, appDestinations } from "./destinations";
import type { LocalNavItem, LocalNavSection } from "./TravelShell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type MobileNavDrawerProps = {
  sections: LocalNavSection[];
  footerItems: LocalNavItem[];
  activeNav: string | null;
};

function NavLink({ item, active, onNavigate }: { item: LocalNavItem; active: boolean; onNavigate: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900",
        active ? "bg-blue-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span>{item.label}</span>
    </Link>
  );
}

export function MobileNavDrawer({ sections, footerItems, activeNav }: MobileNavDrawerProps) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Open navigation"
            className="no-print h-9 w-9 border border-slate-200 bg-white text-slate-700 shadow-sm focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          />
        }
      >
        <Menu className="h-4 w-4" aria-hidden="true" />
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 isolate z-50 bg-slate-950/45 duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Popup
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex h-dvh w-72 max-w-[calc(100vw-2rem)] flex-col overflow-y-auto bg-slate-900 px-3 py-4 text-slate-200 shadow-2xl outline-none no-print",
            "data-open:animate-in data-closed:animate-out duration-200 data-open:slide-in-from-left data-closed:slide-out-to-left"
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <AppSwitcher
              currentAppId={CURRENT_APP_ID}
              currentAppLabel="Travel"
              destinations={appDestinations}
              placement="sidebar"
            />
            <DialogPrimitive.Close
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Close navigation"
                  className="h-9 w-9 text-slate-400 hover:bg-slate-800 hover:text-slate-100 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                />
              }
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>

          <nav className="mt-5 space-y-5 border-t border-slate-800 pt-5" aria-label="Travel navigation">
            {sections.map((section) => (
              <div key={section.label}>
                <p className="px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{section.label}</p>
                <div className="mt-2 grid gap-1">
                  {section.items.map((item) => (
                    <NavLink key={item.id} item={item} active={item.id === activeNav} onNavigate={close} />
                  ))}
                </div>
              </div>
            ))}
          </nav>

          {footerItems.length > 0 && (
            <div className="mt-auto border-t border-slate-800 pt-4">
              {footerItems.map((item) => (
                <NavLink key={item.id} item={item} active={item.id === activeNav} onNavigate={close} />
              ))}
            </div>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
