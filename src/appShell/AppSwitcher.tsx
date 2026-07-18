"use client";

import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLinkItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { AppDestination, AppDestinationId } from "./destinations";

type AppSwitcherProps = {
  currentAppId: AppDestinationId;
  currentAppLabel: string;
  destinations: readonly AppDestination[];
  placement: "sidebar" | "mobile-header";
};

function DestinationIcon({ destination, className }: { destination: AppDestination; className?: string }) {
  const Icon = destination.icon;
  return <Icon className={cn("h-4 w-4", className)} aria-hidden="true" />;
}

export function AppSwitcher({
  currentAppId,
  currentAppLabel,
  destinations,
  placement,
}: AppSwitcherProps) {
  const isMobile = placement === "mobile-header";
  const currentDestination = destinations.find((destination) => destination.id === currentAppId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`Switch app, currently ${currentAppLabel}`}
            className={
              isMobile
                ? "flex min-h-11 max-w-[11rem] items-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-left shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                : "flex min-h-12 w-full items-center rounded-md px-2.5 py-2 text-left text-slate-100 transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
            }
          />
        }
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {currentDestination && (
            <DestinationIcon
              destination={currentDestination}
              className={isMobile ? "h-6 w-6 shrink-0 text-blue-600" : "h-7 w-7 shrink-0 text-blue-400"}
            />
          )}
          <span className="min-w-0">
            <span
              className={cn(
                "block text-[10px] font-semibold uppercase tracking-wide",
                isMobile ? "text-slate-500" : "text-slate-400"
              )}
            >
              Zo-Bot
            </span>
            <span
              className={cn(
                "block truncate text-sm font-bold",
                isMobile ? "text-slate-900" : "text-white"
              )}
            >
              {currentAppLabel}
            </span>
          </span>
          <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={8}
        className={cn("rounded-md border-slate-700 bg-slate-950 p-1.5", isMobile ? "w-64" : "w-52")}
      >
        {destinations.map((destination) => {
          const current = destination.id === currentAppId;
          return (
            <DropdownMenuLinkItem
              key={destination.id}
              href={destination.href}
              aria-current={current ? "page" : undefined}
              className={cn(
                "min-h-11 gap-2 font-medium",
                current
                  ? "bg-blue-600 text-white data-highlighted:bg-blue-600 data-highlighted:text-white"
                  : "text-slate-300 data-highlighted:bg-slate-800 data-highlighted:text-slate-100"
              )}
            >
              <DestinationIcon destination={destination} className="shrink-0" />
              <span className="flex-1 truncate text-left">{destination.label}</span>
              {current && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
            </DropdownMenuLinkItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
