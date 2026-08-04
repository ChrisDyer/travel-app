import test from 'node:test';
import assert from 'node:assert/strict';
import { newFeedToken, isValidTokenShape, stripIcsSuffix } from './token.ts';

// --- newFeedToken --------------------------------------------------------------

test('a token is 43 base64url characters', () => {
  const t = newFeedToken();
  assert.equal(t.length, 43);
  assert.match(t, /^[A-Za-z0-9_-]+$/);
});

test('a fresh token always passes its own shape check', () => {
  for (let i = 0; i < 50; i += 1) {
    assert.equal(isValidTokenShape(newFeedToken()), true);
  }
});

test('two calls produce different tokens', () => {
  const seen = new Set();
  for (let i = 0; i < 100; i += 1) seen.add(newFeedToken());
  assert.equal(seen.size, 100);
});

// --- isValidTokenShape ---------------------------------------------------------

test('isValidTokenShape rejects the empty string and anything too short', () => {
  assert.equal(isValidTokenShape(''), false);
  assert.equal(isValidTokenShape('a'.repeat(31)), false);
  assert.equal(isValidTokenShape('a'.repeat(32)), true);
});

test('isValidTokenShape rejects anything too long', () => {
  assert.equal(isValidTokenShape('a'.repeat(64)), true);
  assert.equal(isValidTokenShape('a'.repeat(65)), false);
});

test('isValidTokenShape rejects standard-base64 and path characters', () => {
  const base = 'a'.repeat(42);
  for (const bad of ['/', '+', '=', '.', ' ', '%', '\n']) {
    assert.equal(isValidTokenShape(base + bad), false, `char ${JSON.stringify(bad)}`);
  }
});

test('isValidTokenShape accepts the base64url extras', () => {
  assert.equal(isValidTokenShape('a'.repeat(41) + '-_'), true);
});

test('isValidTokenShape is anchored, so junk around a valid token is rejected', () => {
  const t = newFeedToken();
  assert.equal(isValidTokenShape(`../${t}`), false);
  assert.equal(isValidTokenShape(`${t}\n${t}`), false);
});

// --- stripIcsSuffix ------------------------------------------------------------

test('stripIcsSuffix handles both URL forms', () => {
  const t = newFeedToken();
  assert.equal(stripIcsSuffix(`${t}.ics`), t);
  assert.equal(stripIcsSuffix(t), t);
});

test('stripIcsSuffix only strips a trailing suffix, never letters mid-string', () => {
  // A real base64url token can contain the letters 'ics' anywhere.
  assert.equal(stripIcsSuffix('abcicsdef'), 'abcicsdef');
  assert.equal(stripIcsSuffix('icsabc'), 'icsabc');
  // Only the final '.ics' goes.
  assert.equal(stripIcsSuffix('abcics.ics'), 'abcics');
  assert.equal(stripIcsSuffix('a.ics.ics'), 'a.ics');
});

test('stripIcsSuffix leaves the empty string alone', () => {
  assert.equal(stripIcsSuffix(''), '');
});
