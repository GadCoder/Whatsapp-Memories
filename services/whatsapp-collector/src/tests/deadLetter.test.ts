import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { writeDeadLetterRecord } from '../services/deadLetter';

test('writeDeadLetterRecord persists metadata and payload', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'collector-dead-letter-'));
  const filePath = path.join(dir, 'dead-letter.ndjson');
  const payload = JSON.stringify({ messageId: 'abc123', text: 'hello' });

  await writeDeadLetterRecord(filePath, 'memories:text:saved', payload, 'queue-full');

  const content = await readFile(filePath, 'utf8');
  const lines = content.trim().split('\n');
  assert.equal(lines.length, 1);

  const record = JSON.parse(lines[0]) as {
    reason: string;
    channel: string;
    messageId?: string;
    payload: string;
    timestamp: string;
  };
  assert.equal(record.reason, 'queue-full');
  assert.equal(record.channel, 'memories:text:saved');
  assert.equal(record.messageId, 'abc123');
  assert.equal(record.payload, payload);
  assert.ok(record.timestamp.length > 0);
});
