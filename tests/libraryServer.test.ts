// tests/libraryServer.test.ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LibraryCache } from "../src/cache/libraryCache.js";
import { OverrideStore } from "../src/overrides/overrideStore.js";
import { buildLibraryServer } from "../src/libraryServer.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "srv-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("buildLibraryServer", () => {
  it("serves /api/meta", async () => {
    const cache = new LibraryCache(join(dir, "cache.json"));
    await cache.set({ parts: [], lastSyncedAt: 7, error: null });
    const overrides = new OverrideStore(join(dir, "overrides.json"));
    const sync = { sync: async () => cache.getSnapshot() } as unknown as import("../src/sync/syncService.js").SyncService;
    const server = buildLibraryServer({ cache, overrides, sync });
    const res = await server.inject({ method: "GET", url: "/api/meta" });
    expect(res.statusCode).toBe(200);
    expect(res.json().lastSyncedAt).toBe(7);
  });
});
