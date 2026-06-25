import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LibraryCache } from "../../src/cache/libraryCache.js";
import { PendingMutationStore } from "../../src/sync/pendingMutationStore.js";
import { PendingSyncService } from "../../src/sync/pendingSyncService.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "pending-sync-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("PendingSyncService", () => {
  it("pushes a queued scan-created part to PartsBox and removes the mutation", async () => {
    const store = new PendingMutationStore(join(dir, "pending.json"), () => 1000);
    await store.load();
    await store.enqueueCreatePart({
      localPartId: "local000000000000000000001",
      create: {
        name: "LTC4125EUFD#TRPBF",
        description: "Wireless power transmitter",
        tags: ["mobile-scan", "digikey", "pbm-category-ic"]
      },
      defaultStorageId: "s".repeat(26),
      stock: {
        storageId: "s".repeat(26),
        quantity: 5,
        note: "Scanned DIGIKEY LTC4125EUFD#TRPBF"
      }
    });

    const client = {
      createLocalPart: vi.fn().mockResolvedValue({ partId: "p".repeat(26) }),
      updatePartDefaultStorage: vi.fn().mockResolvedValue({ ok: true }),
      addStock: vi.fn().mockResolvedValue({ ok: true })
    };
    const cache = new LibraryCache(join(dir, "cache.json"));
    await cache.set({ parts: [], lastSyncedAt: null, error: null });
    const sync = {
      sync: vi.fn().mockResolvedValue({ parts: [], lastSyncedAt: 2000, error: null })
    };
    const service = new PendingSyncService({ store, client, cache, sync });

    await service.flush();

    expect(client.createLocalPart).toHaveBeenCalledWith({
      name: "LTC4125EUFD#TRPBF",
      description: "Wireless power transmitter",
      tags: ["mobile-scan", "digikey", "pbm-category-ic"]
    });
    expect(client.updatePartDefaultStorage).toHaveBeenCalledWith({
      partId: "p".repeat(26),
      storageId: "s".repeat(26)
    });
    expect(client.addStock).toHaveBeenCalledWith({
      partId: "p".repeat(26),
      storageId: "s".repeat(26),
      quantity: 5,
      note: "Scanned DIGIKEY LTC4125EUFD#TRPBF"
    });
    expect(sync.sync).toHaveBeenCalledOnce();
    expect(store.list()).toEqual([]);
  });

  it("normalizes legacy Nexar supplier-category tags into canonical category tags", async () => {
    const store = new PendingMutationStore(join(dir, "pending.json"), () => 1000);
    await store.load();
    await store.enqueueCreatePart({
      localPartId: "local000000000000000000002",
      create: {
        name: "ADA4051-1AKSZ-R7",
        description: "MPN: ADA4051-1AKSZ-R7; Lot: 6868088.1; Date Code: 2511",
        tags: ["mobile-scan", "digikey", "nexar", "nexar:amplifiers-op-amps-buffer-instrumentation"]
      }
    });

    const client = {
      createLocalPart: vi.fn().mockResolvedValue({ partId: "p".repeat(26) }),
      updatePartDefaultStorage: vi.fn().mockResolvedValue({ ok: true }),
      addStock: vi.fn().mockResolvedValue({ ok: true })
    };
    const cache = new LibraryCache(join(dir, "cache.json"));
    await cache.set({ parts: [], lastSyncedAt: null, error: null });
    const sync = {
      sync: vi.fn().mockResolvedValue({ parts: [], lastSyncedAt: 2000, error: null })
    };
    const service = new PendingSyncService({ store, client, cache, sync });

    await service.flush();

    expect(client.createLocalPart).toHaveBeenCalledWith({
      name: "ADA4051-1AKSZ-R7",
      description: "MPN: ADA4051-1AKSZ-R7; Lot: 6868088.1; Date Code: 2511",
      tags: ["mobile-scan", "digikey", "nexar", "pbm-category-opamp"]
    });
  });
});
