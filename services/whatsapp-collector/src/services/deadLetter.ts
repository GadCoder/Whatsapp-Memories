import { appendFile, mkdir } from 'fs/promises';
import path from 'path';

export type DeadLetterReason = 'queue-full' | 'flush-requeue-full' | 'shutdown-unflushed';

interface DeadLetterRecord {
  timestamp: string;
  reason: DeadLetterReason;
  channel: string;
  messageId?: string;
  payload: string;
}

export async function writeDeadLetterRecord(
  deadLetterPath: string,
  channel: string,
  payload: string,
  reason: DeadLetterReason
): Promise<void> {
  await mkdir(path.dirname(deadLetterPath), { recursive: true });

  let messageId: string | undefined;
  try {
    const parsed = JSON.parse(payload) as { messageId?: string };
    messageId = parsed.messageId;
  } catch {
    messageId = undefined;
  }

  const record: DeadLetterRecord = {
    timestamp: new Date().toISOString(),
    reason,
    channel,
    messageId,
    payload,
  };

  await appendFile(deadLetterPath, `${JSON.stringify(record)}\n`, 'utf8');
}
