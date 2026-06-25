// tests/api/libraryRoutes.test.ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ParsedPassive } from "../../src/domain/passive.js";
import { LibraryCache } from "../../src/cache/libraryCache.js";
import { OverrideStore } from "../../src/overrides/overrideStore.js";
import { registerLibraryRoutes } from "../../src/api/libraryRoutes.js";

function passive(over: Partial<ParsedPassive>): ParsedPassive {
  return {
    partId: "a".repeat(26), pn: "RC0603FR-0710KL", manufacturer: "Yageo", type: "resistor",
    valueNorm: 10000, valueDisplay: "10 kΩ", tolerance: "±1%", voltage: null, package: "0603",
    confidence: "high", valueSource: "mpn", rawDescription: "10kΩ", locations: [], totalStock: 0, ...over
  };
}

let dir: string;
async function buildApp(parts: ParsedPassive[]) {
  dir = await mkdtemp(join(tmpdir(), "api-"));
  const cache = new LibraryCache(join(dir, "cache.json"));
  await cache.set({ parts, lastSyncedAt: 5, error: null });
  const overrides = new OverrideStore(join(dir, "overrides.json"));
  const sync = { sync: async () => cache.getSnapshot() } as unknown as import("../../src/sync/syncService.js").SyncService;
  const server = Fastify();
  registerLibraryRoutes(server, { cache, overrides, sync });
  return { server, cache, overrides };
}

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("library routes", () => {
  it("GET /api/library returns sorted parts and filters", async () => {
    const { server } = await buildApp([
      passive({ partId: "b".repeat(26), valueNorm: 22000, valueDisplay: "22 kΩ" }),
      passive({ partId: "a".repeat(26), valueNorm: 1000, valueDisplay: "1 kΩ" })
    ]);
    const res = await server.inject({ method: "GET", url: "/api/library?type=resistor" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.parts.map((p: ParsedPassive) => p.valueNorm)).toEqual([1000, 22000]);
    expect(body.filters.packages).toContain("0603");
  });

  it("GET /api/part/:id returns one part", async () => {
    const { server } = await buildApp([passive({})]);
    const res = await server.inject({ method: "GET", url: `/api/part/${"a".repeat(26)}` });
    expect(res.json().pn).toBe("RC0603FR-0710KL");
  });

  it("PUT /api/part/:id/override normalizes the value and saves it", async () => {
    const { server, overrides } = await buildApp([passive({})]);
    const res = await server.inject({
      method: "PUT",
      url: `/api/part/${"a".repeat(26)}/override`,
      payload: { type: "resistor", value: "4.7k", tolerance: "±1%" }
    });
    expect(res.statusCode).toBe(200);
    const saved = await overrides.getAll();
    expect(saved["a".repeat(26)]).toMatchObject({ type: "resistor", valueNorm: 4700, valueDisplay: "4.7 kΩ", tolerance: "±1%" });
  });

  it("PUT rejects an invalid body", async () => {
    const { server } = await buildApp([passive({})]);
    const res = await server.inject({ method: "PUT", url: `/api/part/${"a".repeat(26)}/override`, payload: { type: "diode" } });
    expect(res.statusCode).toBe(400);
  });
});
