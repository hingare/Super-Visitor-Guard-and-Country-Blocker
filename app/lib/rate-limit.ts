// Fixed-window counter per key, kept in this process's memory. The verdict
// API uses it to stop one client from flooding the visitor log.

export class RateLimiter {
  private windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 50_000,
  ) {}

  // Counts one hit and says whether it is within the limit.
  hit(key: string, now = Date.now()): boolean {
    return this.count(key, now) <= this.limit;
  }

  // Counts one hit and returns the hits in the current window, this one included.
  count(key: string, now = Date.now()): number {
    const window = this.windows.get(key);
    if (!window || now - window.start >= this.windowMs) {
      if (this.windows.size >= this.maxKeys) this.prune(now);
      this.windows.set(key, { start: now, count: 1 });
      return 1;
    }
    window.count += 1;
    return window.count;
  }

  private prune(now: number) {
    for (const [key, window] of this.windows) {
      if (now - window.start >= this.windowMs) this.windows.delete(key);
    }
    // Still full: start over rather than grow without bound.
    if (this.windows.size >= this.maxKeys) this.windows.clear();
  }
}
