import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAdminEmails } from "./admin-emails.ts";

test("parseAdminEmails: unset/empty => no admins (role feature off)", () => {
  assert.deepEqual(parseAdminEmails(undefined), []);
  assert.deepEqual(parseAdminEmails(""), []);
  assert.deepEqual(parseAdminEmails("   "), []);
});

test("parseAdminEmails: trims whitespace, lowercases, drops empties", () => {
  assert.deepEqual(
    parseAdminEmails(" Chris@Example.com , kate@example.com,, "),
    ["chris@example.com", "kate@example.com"]
  );
});

test("readOnly decision mirrors src/proxy.ts and getAccessInfo()", () => {
  const isReadOnly = (email, adminEmailsRaw) => {
    const adminEmails = parseAdminEmails(adminEmailsRaw);
    return Boolean(email) && adminEmails.length > 0 && !adminEmails.includes(email);
  };

  // Unset ADMIN_EMAILS => nobody is read-only (fail-open).
  assert.equal(isReadOnly("notchris@example.com", undefined), false);
  assert.equal(isReadOnly("chrissdyer@gmail.com", undefined), false);

  // Configured allowlist: admin is not read-only, everyone else is.
  assert.equal(isReadOnly("chrissdyer@gmail.com", "chrissdyer@gmail.com"), false);
  assert.equal(isReadOnly("notchris@example.com", "chrissdyer@gmail.com"), true);

  // No email header (dev bypass) => never read-only.
  assert.equal(isReadOnly(null, "chrissdyer@gmail.com"), false);
});
