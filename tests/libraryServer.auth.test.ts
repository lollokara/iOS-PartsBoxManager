import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LibraryCache } from "../src/cache/libraryCache.js";
import { OverrideStore } from "../src/overrides/overrideStore.js";
import { buildLibraryServer } from "../src/libraryServer.js";
import { hashPassword, loadAuthConfig, signAuthToken } from "../src/auth.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "srv-auth-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function makeClient(): import("../src/partsbox/apiClient.js").PartsBoxApiClient {
  return {
    addStock: async () => ({ ok: true }),
    removeStock: async () => ({ ok: true }),
    createLocalPart: async () => ({ partId: "c".repeat(26) })
  } as unknown as import("../src/partsbox/apiClient.js").PartsBoxApiClient;
}

describe("library server auth", () => {
  it("rejects API requests without a bearer token when auth is enabled", async () => {
    const cache = new LibraryCache(join(dir, "cache.json"));
    await cache.set({ parts: [], lastSyncedAt: 7, error: null });
    const overrides = new OverrideStore(join(dir, "overrides.json"));
    const sync = { sync: async () => cache.getSnapshot() } as unknown as import("../src/sync/syncService.js").SyncService;
    const auth = loadAuthConfig({
      AUTH_PASSWORD_HASH: hashPassword("secret"),
      AUTH_TOKEN_SECRET: "x".repeat(32)
    });
    const server = buildLibraryServer({ cache, overrides, sync, client: makeClient(), auth });

    const res = await server.inject({ method: "GET", url: "/api/meta" });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "authentication required" });
  });

  it("returns a bearer token from the login endpoint", async () => {
    const cache = new LibraryCache(join(dir, "cache.json"));
    await cache.set({ parts: [], lastSyncedAt: 7, error: null });
    const overrides = new OverrideStore(join(dir, "overrides.json"));
    const sync = { sync: async () => cache.getSnapshot() } as unknown as import("../src/sync/syncService.js").SyncService;
    const auth = loadAuthConfig({
      AUTH_PASSWORD_HASH: hashPassword("secret"),
      AUTH_TOKEN_SECRET: "x".repeat(32)
    });
    const server = buildLibraryServer({ cache, overrides, sync, client: makeClient(), auth });

    const res = await server.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { password: "secret" }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty("token");
    expect(res.json()).toHaveProperty("expiresAt");
  });

  it("returns authenticated status when a valid token is supplied", async () => {
    const cache = new LibraryCache(join(dir, "cache.json"));
    await cache.set({ parts: [], lastSyncedAt: 7, error: null });
    const overrides = new OverrideStore(join(dir, "overrides.json"));
    const sync = { sync: async () => cache.getSnapshot() } as unknown as import("../src/sync/syncService.js").SyncService;
    const auth = loadAuthConfig({
      AUTH_PASSWORD_HASH: hashPassword("secret"),
      AUTH_TOKEN_SECRET: "x".repeat(32)
    });
    const server = buildLibraryServer({ cache, overrides, sync, client: makeClient(), auth });
    const login = await server.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { password: "secret" }
    });
    const token = login.json<{ token: string }>().token;

    const res = await server.inject({
      method: "GET",
      url: "/api/auth/status",
      headers: { authorization: `Bearer ${token}` }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ enabled: true, authenticated: true });
  });

  it("allows /api/mobile/sections with a valid bearer token", async () => {
    const cache = new LibraryCache(join(dir, "cache.json"));
    await cache.set({
      parts: [
        {
          partId: "a".repeat(26),
          pn: "RC0603FR-0710KL",
          manufacturer: "Yageo",
          type: "resistor",
          valueNorm: 10000,
          valueDisplay: "10 kΩ",
          tolerance: "±1%",
          voltage: null,
          package: "0603",
          confidence: "high",
          valueSource: "mpn",
          rawDescription: "10kΩ",
          locations: [],
          totalStock: 0
        }
      ],
      lastSyncedAt: 7,
      error: null
    });
    const overrides = new OverrideStore(join(dir, "overrides.json"));
    const sync = { sync: async () => cache.getSnapshot() } as unknown as import("../src/sync/syncService.js").SyncService;
    const auth = loadAuthConfig({
      AUTH_PASSWORD_HASH: hashPassword("secret"),
      AUTH_TOKEN_SECRET: "x".repeat(32)
    });
    const server = buildLibraryServer({ cache, overrides, sync, client: makeClient(), auth });
    const login = await server.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { password: "secret" }
    });
    const token = login.json<{ token: string }>().token;

    const res = await server.inject({
      method: "GET",
      url: "/api/mobile/sections",
      headers: { authorization: `Bearer ${token}` }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty("sections");
  });

  it("rejects an expired bearer token", async () => {
    const cache = new LibraryCache(join(dir, "cache.json"));
    await cache.set({ parts: [], lastSyncedAt: 7, error: null });
    const overrides = new OverrideStore(join(dir, "overrides.json"));
    const sync = { sync: async () => cache.getSnapshot() } as unknown as import("../src/sync/syncService.js").SyncService;
    const auth = loadAuthConfig({
      AUTH_PASSWORD_HASH: hashPassword("secret"),
      AUTH_TOKEN_SECRET: "x".repeat(32)
    });
    const server = buildLibraryServer({ cache, overrides, sync, client: makeClient(), auth });
    const token = signAuthToken({ secret: auth.tokenSecret!, ttlSeconds: 1, now: 1_700_000_000_000 });

    const res = await server.inject({
      method: "GET",
      url: "/api/meta",
      headers: { authorization: `Bearer ${token}` }
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "authentication required" });
  });
});
