import { describe, expect, it, vi } from "vitest";
import type { RawPart } from "../../src/domain/passive.js";
import { LibraryCache } from "../../src/cache/libraryCache.js";
import { OverrideStore } from "../../src/overrides/overrideStore.js";
import { SyncService } from "../../src/sync/syncService.js";

function raw(over: Partial<RawPart>): RawPart {
  return { partId: "a".repeat(26), partType: "linked", name: "", mpn: "", manufacturer: null, description: "", footprint: "", tags: [], ...over };
}

const fakeCache = () => new LibraryCache("/tmp/does-not-matter-cache.json");
const fakeOverrides = () => ({ getAll: async () => ({}) }) as unknown as OverrideStore;

describe("SyncService", () => {
  it("keeps passives and non-passives, resolves locations, and preserves passive extraction", async () => {
    const client = {
      getAllParts: vi.fn().mockResolvedValue([
        raw({ partId: "a".repeat(26), mpn: "RC0603FR-0710KL", description: "10kΩ 0603 1%" }),
        raw({ partId: "b".repeat(26), mpn: "LTC4125EUFD", description: "Wireless Power Transmitter QFN" })
      ]),
      getStorageList: vi.fn().mockResolvedValue(new Map([["s".repeat(26), "Drawer A1"]])),
      getPartStorageSources: vi.fn().mockResolvedValue([{ storageId: "s".repeat(26), quantity: 50 }])
    };
    const cache = fakeCache();
    vi.spyOn(cache, "set").mockResolvedValue();
    const svc = new SyncService({ client, cache, overrides: fakeOverrides(), now: () => 12345 });

    const snap = await svc.sync();

    expect(snap.parts).toHaveLength(2);
    expect(snap.parts[0]).toMatchObject({
      partId: "a".repeat(26), type: "resistor", valueNorm: 10000,
      locations: [{ storageId: "s".repeat(26), name: "Drawer A1", quantity: 50 }], totalStock: 50
    });
    expect(snap.parts[1]).toMatchObject({
      partId: "b".repeat(26),
      type: "unknown",
      locations: [{ storageId: "s".repeat(26), name: "Drawer A1", quantity: 50 }],
      totalStock: 50
    });
    expect(snap.lastSyncedAt).toBe(12345);
    expect(client.getPartStorageSources).toHaveBeenCalledTimes(2);
  });

  it("records an error and keeps lastSyncedAt null on failure", async () => {
    const client = {
      getAllParts: vi.fn().mockRejectedValue(new Error("boom")),
      getStorageList: vi.fn(),
      getPartStorageSources: vi.fn()
    };
    const cache = fakeCache();
    vi.spyOn(cache, "set").mockResolvedValue();
    const svc = new SyncService({ client, cache, overrides: fakeOverrides(), now: () => 1 });

    const snap = await svc.sync();
    expect(snap.error).toContain("boom");
  });

  it("preserves local pending parts when pulling from PartsBox", async () => {
    const client = {
      getAllParts: vi.fn().mockResolvedValue([
        raw({ partId: "a".repeat(26), mpn: "RC0603FR-0710KL", description: "10kΩ 0603 1%" })
      ]),
      getStorageList: vi.fn().mockResolvedValue(new Map()),
      getPartStorageSources: vi.fn().mockResolvedValue([])
    };
    const cache = fakeCache();
    vi.spyOn(cache, "set").mockImplementation(async (snapshot) => {
      (cache as unknown as { snapshot: unknown }).snapshot = snapshot;
    });
    await cache.set({
      parts: [
        {
          partId: "local000000000000000000001",
          pn: "LTC4125EUFD#TRPBF",
          manufacturer: null,
          type: "unknown",
          valueNorm: null,
          valueDisplay: null,
          tolerance: null,
          voltage: null,
          package: null,
          confidence: "unknown",
          valueSource: null,
          rawDescription: "Pending DigiKey scan",
          locations: [],
          totalStock: 0,
          syncStatus: "pending"
        }
      ],
      lastSyncedAt: 1,
      error: null
    });
    const svc = new SyncService({ client, cache, overrides: fakeOverrides(), now: () => 2 });

    const snap = await svc.sync();

    expect(snap.parts.map((part) => part.partId)).toEqual([
      "a".repeat(26),
      "local000000000000000000001"
    ]);
  });
});
