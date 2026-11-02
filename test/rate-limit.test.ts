import { describe, expect, it } from "vitest";
import { RateLimiter } from "../app/lib/rate-limit";

describe("RateLimiter", () => {
  it("allows up to the limit in each window", () => {
    const limiter = new RateLimiter(2, 1000);
    expect(limiter.hit("a", 0)).toBe(true);
    expect(limiter.hit("a", 10)).toBe(true);
    expect(limiter.hit("a", 20)).toBe(false);
    expect(limiter.hit("b", 20)).toBe(true);
    expect(limiter.hit("a", 1000)).toBe(true);
  });

  it("stays bounded in memory", () => {
    const limiter = new RateLimiter(1, 1000, 2);
    limiter.hit("a", 0);
    limiter.hit("b", 0);
    expect(limiter.hit("c", 0)).toBe(true);
    expect(limiter.hit("a", 0)).toBe(true);
  });
});
