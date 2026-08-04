import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const destinationsSource = readFileSync(new URL("./destinations.ts", import.meta.url), "utf8");
const switcherSource = readFileSync(new URL("./AppSwitcher.tsx", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("./TravelShell.tsx", import.meta.url), "utf8");
const drawerSource = readFileSync(new URL("./MobileNavDrawer.tsx", import.meta.url), "utf8");
const overviewPageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const tripsPageSource = readFileSync(new URL("../app/trips/page.tsx", import.meta.url), "utf8");
const newPageSource = readFileSync(new URL("../app/trips/new/page.tsx", import.meta.url), "utf8");
const detailPageSource = readFileSync(new URL("../app/trips/[tripId]/page.tsx", import.meta.url), "utf8");
const mapPageSource = readFileSync(new URL("../app/map/page.tsx", import.meta.url), "utf8");
const settingsPageSource = readFileSync(new URL("../app/settings/page.tsx", import.meta.url), "utf8");
const printPageSource = readFileSync(new URL("../app/trips/[tripId]/print/page.tsx", import.meta.url), "utf8");

test("canonical Travel manifest preserves IDs, labels, order, and hrefs", () => {
  const entries = [...destinationsSource.matchAll(/\{ id: "([^"]+)", label: "([^"]+)", href: "([^"]+)"/g)]
    .map((match) => ({ id: match[1], label: match[2], href: match[3] }));

  assert.deepEqual(entries, [
    { id: "dashboard", label: "Dashboard", href: "https://zo-bot.com/" },
    { id: "finance", label: "Finance", href: "https://zo-bot.com/finance/" },
    { id: "travel", label: "Travel", href: "https://zo-bot.com/travel/" },
    { id: "newsletters", label: "Newsletters", href: "https://zo-bot.com/newsletter/" },
    { id: "home", label: "Home", href: "https://home.zo-bot.com/" },
    { id: "records", label: "Records", href: "https://zo-bot.com/records/" },
  ]);
  assert.match(destinationsSource, /CURRENT_APP_ID = "travel"/);
});

test("local Travel navigation preserves IDs, labels, order, and hrefs", () => {
  const entries = [...shellSource.matchAll(/\{ id: "([^"]+)", label: "([^"]+)", href: "([^"]+)"/g)]
    .map((match) => ({ id: match[1], label: match[2], href: match[3] }));

  assert.deepEqual(entries, [
    { id: "overview", label: "Overview", href: "/" },
    { id: "trips", label: "Trips", href: "/trips" },
    { id: "map", label: "Map", href: "/map" },
    { id: "settings", label: "Settings", href: "/settings" },
  ]);
  assert.match(shellSource, /usePathname/);
  assert.doesNotMatch(shellSource, /activeLocalNav/);
});

test("switcher and shell expose required desktop and mobile semantics", () => {
  assert.match(switcherSource, /placement: "sidebar" \| "mobile-header"/);
  assert.match(switcherSource, /aria-current=\{current \? "page"/);
  // Canonical presentation (app-shell contract appendix): dropdown panel in both
  // placements on the dark slate-950 menu surface; every destination, including the
  // current app, is a real link.
  assert.match(switcherSource, /DropdownMenuContent/);
  assert.doesNotMatch(switcherSource, /role="dialog"/);
  assert.match(switcherSource, /bg-slate-950/);
  assert.match(switcherSource, /DropdownMenuLinkItem/);
  assert.match(switcherSource, /Zo-Bot/);
  assert.match(shellSource, /placement="sidebar"/);
  assert.match(shellSource, /placement="mobile-header"/);
  assert.match(shellSource, /aria-label="Travel navigation"/);
  assert.match(shellSource, /bg-slate-900/);
  assert.match(shellSource, /bg-blue-600/);
  assert.match(shellSource, /lg:hidden/);
  assert.match(drawerSource, /bg-slate-900/);
  assert.match(drawerSource, /aria-label="Open navigation"/);
});

test("switcher uses the canonical shared glyph set", () => {
  for (const glyph of ["LayoutDashboard", "Banknote", "Plane", "Mail", "Home", "FileText"]) {
    assert.match(destinationsSource, new RegExp(`icon: ${glyph}`));
  }
});

test("interactive Travel routes use the shared shell and print route stays shell-free", () => {
  for (const source of [overviewPageSource, tripsPageSource, newPageSource, detailPageSource, mapPageSource, settingsPageSource]) {
    assert.match(source, /TravelShell/);
    assert.doesNotMatch(source, /activeLocalNav/);
  }
  assert.doesNotMatch(printPageSource, /TravelShell/);
  assert.doesNotMatch(printPageSource, /AppSwitcher/);
});
