import test from 'node:test';
import assert from 'node:assert/strict';
import { MessageDeduplicator } from '../utils/deduplication';

test('deduplicator blocks duplicate IDs inside window', () => {
  const dedupe = new MessageDeduplicator(1000);
  const now = 1_700_000_000_000;

  assert.equal(dedupe.shouldProcess('m1', now), true);
  assert.equal(dedupe.shouldProcess('m1', now + 10), false);
});

test('deduplicator allows same ID after window expiry', () => {
  const dedupe = new MessageDeduplicator(1000);
  const now = 1_700_000_000_000;

  assert.equal(dedupe.shouldProcess('m1', now), true);
  assert.equal(dedupe.shouldProcess('m1', now + 2000), true);
});
