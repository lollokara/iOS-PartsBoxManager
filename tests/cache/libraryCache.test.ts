import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ParsedPassive } from "../../src/domain/passive.js";
import { LibraryCache } from "../../src/cache/libraryCache.js";

function passive(over: Partial<ParsedPassive>): ParsedPassive {
  return {
    partId: "a".repeat(26), pn: "PN", manufacturer: null, type: "resistor",
    valueNorm: 1000, valueDisplay: "1 kΩ", tolerance: "±1%", voltage: null, package: "0603",
    confidence: "high", valueSource: "mpn", rawDescription: "", locations: [], totalStock: 0, ...over
  };
}

let dir: string;
let cache: LibraryCache;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "cache-"));
  cache = new LibraryCache(join(dir, "cache.json"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("LibraryCache", () => {
  it("sorts a type by valueNorm ascending, nulls last", async () => {
    await cache.set({
      parts: [
        passive({ partId: "c".repeat(26), valueNorm: 22000 }),
        passive({ partId: "b".repeat(26), valueNorm: 1000 }),
        passive({ partId: "d".repeat(26), valueNorm: null, confidence: "medium" })
      ],
      lastSyncedAt: 1, error: null
    });
    expect(cache.getByType("resistor").map((p) => p.valueNorm)).toEqual([1000, 22000, null]);
  });

  it("returns review parts (unknown or conflict)", async () => {
    await cache.set({
      parts: [
        passive({ partId: "b".repeat(26), confidence: "high" }),
        passive({ partId: "c".repeat(26), confidence: "conflict" }),
        passive({ partId: "d".repeat(26), confidence: "unknown" })
      ],
      lastSyncedAt: 1, error: null
    });
    expect(cache.getReview().map((p) => p.partId)).toEqual(["c".repeat(26), "d".repeat(26)]);
  });

  it("computes distinct filters for a type", async () => {
    await cache.set({
      parts: [
        passive({ partId: "b".repeat(26), package: "0603", tolerance: "±1%", voltage: null }),
        passive({ partId: "c".repeat(26), package: "0805", tolerance: "±1%", voltage: "50 V" })
      ],
      lastSyncedAt: 1, error: null
    });
    expect(cache.filtersFor("resistor")).toEqual({
      packages: ["0603", "0805"], tolerances: ["±1%"], voltages: ["50 V"]
    });
  });

  it("persists across load()", async () => {
    await cache.set({ parts: [passive({})], lastSyncedAt: 99, error: null });
    const fresh = new LibraryCache(join(dir, "cache.json"));
    await fresh.load();
    expect(fresh.getSnapshot().lastSyncedAt).toBe(99);
  });
});
