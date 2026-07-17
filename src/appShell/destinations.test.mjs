import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const destinationsSource = readFileSync(new URL("./destinations.ts", import.meta.url), "utf8");
const switcherSource = readFileSync(new URL("./AppSwitcher.tsx", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("./TravelShell.tsx", import.meta.url), "utf8");
const tripsPageSource = readFileSync(new URL("../app/trips/page.tsx", import.meta.url), "utf8");
const newPageSource = readFileSync(new URL("../app/trips/new/page.tsx", import.meta.url), "utf8");
const detailPageSource = readFileSync(new URL("../app/trips/[tripId]/page.tsx", import.meta.url), "utf8");
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

test("switcher and shell expose required desktop and mobile semantics", () => {
  assert.match(switcherSource, /placement: "sidebar" \| "mobile-header"/);
  assert.match(switcherSource, /aria-current=\{current \? "page"/);
  assert.match(switcherSource, /Close app switcher/);
  assert.match(shellSource, /placement="sidebar"/);
  assert.match(shellSource, /placement="mobile-header"/);
  assert.match(shellSource, /aria-label="Travel navigation"/);
  assert.match(shellSource, /bg-slate-900/);
  assert.match(shellSource, /bg-blue-600/);
});

test("interactive Travel routes use the shared shell and print route stays shell-free", () => {
  for (const source of [tripsPageSource, newPageSource, detailPageSource]) {
    assert.match(source, /TravelShell/);
  }
  assert.doesNotMatch(printPageSource, /TravelShell/);
  assert.doesNotMatch(printPageSource, /AppSwitcher/);
});
