import type { ComponentType, SVGProps } from "react";
import {
  Banknote,
  FileText,
  Home,
  LayoutDashboard,
  Mail,
  Plane,
} from "lucide-react";

export type AppDestinationId =
  | "dashboard"
  | "finance"
  | "travel"
  | "newsletters"
  | "home"
  | "records";

export type AppDestination = {
  id: AppDestinationId;
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

export const CURRENT_APP_ID = "travel" satisfies AppDestinationId;

export const appDestinations = [
  { id: "dashboard", label: "Dashboard", href: "https://zo-bot.com/", icon: LayoutDashboard },
  { id: "finance", label: "Finance", href: "https://zo-bot.com/finance/", icon: Banknote },
  { id: "travel", label: "Travel", href: "https://zo-bot.com/travel/", icon: Plane },
  { id: "newsletters", label: "Newsletters", href: "https://zo-bot.com/newsletter/", icon: Mail },
  { id: "home", label: "Home", href: "https://home.zo-bot.com/", icon: Home },
  { id: "records", label: "Records", href: "https://zo-bot.com/records/", icon: FileText },
] as const satisfies readonly AppDestination[];

export function getDestination(id: AppDestinationId): AppDestination {
  return appDestinations.find((destination) => destination.id === id) ?? appDestinations[0];
}
