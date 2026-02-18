export interface TerminatorOptions {
  shutdown: () => Promise<void>;
  onExit: (exitCode: number) => void;
  timeoutMs?: number;
  logger?: {
    log: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
}

export function createTerminator(options: TerminatorOptions) {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const logger = options.logger ?? {
    log: (msg: string) => console.log(msg),
    warn: (msg: string) => console.warn(msg),
    error: (msg: string) => console.error(msg),
  };

  let terminating = false;

  return async function terminate(reason: string, exitCode: number): Promise<void> {
    if (terminating) {
      logger.warn(`[Signal] Termination already in progress, ignoring ${reason}`);
      return;
    }
    terminating = true;
    logger.log(`\n[Signal] Received ${reason}`);

    const hardTimeout = setTimeout(() => {
      logger.error('[Shutdown] Forced exit after timeout');
      options.onExit(1);
    }, timeoutMs);
    hardTimeout.unref();

    try {
      await options.shutdown();
      clearTimeout(hardTimeout);
      options.onExit(exitCode);
    } catch (error) {
      clearTimeout(hardTimeout);
      logger.error(`[Shutdown] Termination failed: ${String(error)}`);
      options.onExit(1);
    }
  };
}
