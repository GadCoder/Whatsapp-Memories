import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFilterContacts } from '../config/filterContacts';

test('parseFilterContacts normalizes and keeps valid contacts', () => {
  const parsed = parseFilterContacts(' Foo@C.us,bar@g.us,baz@broadcast ');

  assert.deepEqual(parsed.validContacts, ['foo@c.us', 'bar@g.us', 'baz@broadcast']);
  assert.deepEqual(parsed.invalidContacts, []);
});

test('parseFilterContacts reports invalid entries', () => {
  const parsed = parseFilterContacts('12345,foo@c.us,');

  assert.deepEqual(parsed.validContacts, ['foo@c.us']);
  assert.deepEqual(parsed.invalidContacts, ['12345']);
});
