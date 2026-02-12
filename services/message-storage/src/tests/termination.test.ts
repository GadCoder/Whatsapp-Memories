import test from 'node:test';
import assert from 'node:assert/strict';
import { createTerminator } from '../utils/termination';

test('terminate performs cleanup and exits with requested code', async () => {
  const exits: number[] = [];
  let shutdownCalls = 0;

  const terminate = createTerminator({
    shutdown: async () => {
      shutdownCalls++;
    },
    onExit: (code) => exits.push(code),
    timeoutMs: 500,
    logger: { log: () => {}, warn: () => {}, error: () => {} },
  });

  await terminate('SIGTERM', 0);

  assert.equal(shutdownCalls, 1);
  assert.deepEqual(exits, [0]);
});

test('terminate is idempotent while shutdown is in progress', async () => {
  const exits: number[] = [];
  let shutdownCalls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const terminate = createTerminator({
    shutdown: async () => {
      shutdownCalls++;
      await gate;
    },
    onExit: (code) => exits.push(code),
    timeoutMs: 500,
    logger: { log: () => {}, warn: () => {}, error: () => {} },
  });

  const first = terminate('SIGTERM', 0);
  const second = terminate('SIGINT', 0);
  await Promise.resolve();
  assert.equal(shutdownCalls, 1);
  assert.deepEqual(exits, []);

  release();
  await first;
  await second;

  assert.deepEqual(exits, [0]);
});

test('terminate forces exit code 1 when shutdown exceeds timeout', async () => {
  const exits: number[] = [];

  const terminate = createTerminator({
    shutdown: async () => {
      await new Promise<void>(() => {});
    },
    onExit: (code) => exits.push(code),
    timeoutMs: 20,
    logger: { log: () => {}, warn: () => {}, error: () => {} },
  });

  void terminate('SIGTERM', 0);
  await new Promise((resolve) => setTimeout(resolve, 60));

  assert.deepEqual(exits, [1]);
});
