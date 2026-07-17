"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLinkItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AppDestination, AppDestinationId } from "./destinations";

type AppSwitcherProps = {
  currentAppId: AppDestinationId;
  currentAppLabel: string;
  destinations: readonly AppDestination[];
  placement: "sidebar" | "mobile-header";
};

function DestinationIcon({ destination }: { destination: AppDestination }) {
  const Icon = destination.icon;
  return <Icon className="h-4 w-4" aria-hidden="true" />;
}

function DestinationList({
  currentAppId,
  destinations,
  onDark = false,
}: {
  currentAppId: AppDestinationId;
  destinations: readonly AppDestination[];
  onDark?: boolean;
}) {
  return (
    <div className="grid gap-1">
      {destinations.map((destination) => {
        const current = destination.id === currentAppId;
        return (
          <a
            key={destination.id}
            href={destination.href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "app-switcher-link flex min-h-11 items-center justify-between gap-3 rounded-md px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
              onDark
                ? "text-slate-300 hover:bg-slate-800 hover:text-slate-50 focus-visible:ring-offset-slate-900"
                : "text-slate-700 hover:bg-slate-100 hover:text-slate-950 focus-visible:ring-offset-white",
              current && (onDark ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-700")
            )}
          >
            <span className="flex min-w-0 items-center gap-3">
              <DestinationIcon destination={destination} />
              <span className="truncate">{destination.label}</span>
            </span>
            {current && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
          </a>
        );
      })}
    </div>
  );
}

export function AppSwitcher({
  currentAppId,
  currentAppLabel,
  destinations,
  placement,
}: AppSwitcherProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!mobileOpen) return;
    const active = dialogRef.current?.querySelector<HTMLAnchorElement>('a[aria-current="page"]');
    active?.focus();
  }, [mobileOpen]);

  function closeMobile() {
    setMobileOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function handleMobileKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const links = Array.from(dialogRef.current?.querySelectorAll<HTMLAnchorElement>('.app-switcher-link') ?? []);
    const currentIndex = links.findIndex((link) => link === document.activeElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMobile();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      links[(currentIndex + 1 + links.length) % links.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      links[(currentIndex - 1 + links.length) % links.length]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      links[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      links[links.length - 1]?.focus();
    } else if (event.key === 'Tab' && links.length) {
      const closeButton = dialogRef.current?.querySelector<HTMLButtonElement>('button[data-close-switcher]');
      if (event.shiftKey && document.activeElement === links[0]) {
        event.preventDefault();
        closeButton?.focus();
      } else if (!event.shiftKey && document.activeElement === closeButton) {
        event.preventDefault();
        links[0]?.focus();
      }
    }
  }

  if (placement === "mobile-header") {
    return (
      <>
        <Button
          ref={triggerRef}
          type="button"
          variant="outline"
          className="h-10 max-w-[46vw] justify-between gap-2 border-slate-300 bg-white px-3 text-slate-800"
          aria-label={`Switch app, currently ${currentAppLabel}`}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(true)}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-900 text-[10px] font-bold text-white">
              ZB
            </span>
            <span className="truncate">{currentAppLabel}</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
        </Button>

        {mobileOpen && (
          <div className="fixed inset-0 z-50 bg-slate-950/20 backdrop-blur-sm" onMouseDown={closeMobile}>
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="travel-app-switcher-title"
              className="absolute inset-y-0 right-0 w-full max-w-sm overflow-y-auto border-l border-slate-200 bg-white p-0 shadow-xl"
              onMouseDown={(event) => event.stopPropagation()}
              onKeyDown={handleMobileKeyDown}
            >
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4">
                <div>
                  <h2 id="travel-app-switcher-title" className="text-base font-semibold text-slate-950">Zo-Bot</h2>
                  <p className="text-sm text-slate-500">Switch applications</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  data-close-switcher
                  aria-label="Close app switcher"
                  onClick={closeMobile}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <nav className="p-3" aria-label="Applications">
                <DestinationList currentAppId={currentAppId} destinations={destinations} />
              </nav>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            className="h-auto w-full justify-between rounded-md border border-slate-700 bg-slate-800/70 px-3 py-3 text-left text-slate-50 hover:bg-slate-800 hover:text-white"
            aria-label={`Switch app, currently ${currentAppLabel}`}
          />
        }
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-600 text-xs font-bold text-white">
            ZB
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Zo-Bot</span>
            <span className="block truncate text-sm font-semibold">{currentAppLabel}</span>
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={8} className="w-56 border-slate-200">
        {destinations.map((destination) => {
          const current = destination.id === currentAppId;
          return (
            <DropdownMenuLinkItem
              key={destination.id}
              href={destination.href}
              aria-current={current ? "page" : undefined}
              className={cn(
                "justify-between text-slate-700 data-highlighted:bg-slate-100 data-highlighted:text-slate-950",
                current && "bg-blue-50 text-blue-700"
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <DestinationIcon destination={destination} />
                <span className="truncate">{destination.label}</span>
              </span>
              {current && <Check className="h-4 w-4" aria-hidden="true" />}
            </DropdownMenuLinkItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
