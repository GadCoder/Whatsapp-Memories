export class MessageDeduplicator {
  private readonly seen = new Map<string, number>();

  constructor(private readonly windowMs: number) {}

  shouldProcess(messageId: string, now: number = Date.now()): boolean {
    for (const [id, seenAt] of this.seen) {
      if (now - seenAt > this.windowMs) {
        this.seen.delete(id);
      }
    }

    const seenAt = this.seen.get(messageId);
    if (seenAt && now - seenAt <= this.windowMs) {
      return false;
    }

    this.seen.set(messageId, now);
    return true;
  }
}
