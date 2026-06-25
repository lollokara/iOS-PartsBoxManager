import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ParsedPassive } from "../../src/domain/passive.js";
import { LibraryCache } from "../../src/cache/libraryCache.js";
import { OverrideStore } from "../../src/overrides/overrideStore.js";
import { registerMobileRoutes } from "../../src/api/mobileRoutes.js";
import type { PendingSyncService } from "../../src/sync/pendingSyncService.js";

function passive(over: Partial<ParsedPassive>): ParsedPassive {
  return {
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
    locations: [{ storageId: "s".repeat(26), name: "Drawer A1", quantity: 42 }],
    totalStock: 42,
    ...over
  };
}

let dir: string;

async function buildApp(
  parts: ParsedPassive[],
  options?: {
    sync?: import("../../src/sync/syncService.js").SyncService;
    client?: import("../../src/partsbox/apiClient.js").PartsBoxApiClient;
    enricher?: unknown;
    pendingSync?: PendingSyncService;
  }
) {
  dir = await mkdtemp(join(tmpdir(), "mobile-api-"));
  const cache = new LibraryCache(join(dir, "cache.json"));
  await cache.set({ parts, lastSyncedAt: 5, error: null });
  const overrides = new OverrideStore(join(dir, "overrides.json"));
  const sync =
    options?.sync ??
    ({
      sync: async () => cache.getSnapshot()
    } as unknown as import("../../src/sync/syncService.js").SyncService);
  let createdPart: { partId: string; name: string; description: string; tags: string[] } | null = null;
  let stockSources: Array<{ storageId: string; quantity: number }> = [];
  const defaultClient = {
    addStock: async (input: { partId: string; storageId: string; quantity: number }) => {
      stockSources = [{ storageId: input.storageId, quantity: input.quantity }];
      return { ok: true };
    },
    removeStock: async () => ({ ok: true }),
    createLocalPart: async (input: { name: string; description?: string; tags?: string[] }) => {
      createdPart = {
        partId: "c".repeat(26),
        name: input.name,
        description: input.description ?? "",
        tags: input.tags ?? []
      };
      return { partId: createdPart.partId };
    },
    getPart: async (partId: string) => ({
      partId,
      pn: createdPart?.name ?? partId,
      description: createdPart?.description ?? ""
    }),
    getPartStorageSources: async () => stockSources
  } as unknown as import("../../src/partsbox/apiClient.js").PartsBoxApiClient;
  const client = options?.client ? ({ ...defaultClient, ...options.client } as import("../../src/partsbox/apiClient.js").PartsBoxApiClient) : defaultClient;
  const server = Fastify();
  registerMobileRoutes(server, {
    cache,
    sync,
    client,
    enricher: options?.enricher as never,
    digikeyEnricher: options?.enricher as never,
    pendingSync: options?.pendingSync,
    overrides
  });
  return { server, cache };
}

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("mobile routes", () => {
  it("GET /api/mobile/sections returns section counts", async () => {
    const { server } = await buildApp([
      passive({ type: "resistor" }),
      passive({ type: "capacitor", partId: "b".repeat(26), pn: "C0402C104K5RACTU", valueDisplay: "100 nF", valueNorm: 0.0000001, totalStock: 7 })
    ]);

    const res = await server.inject({ method: "GET", url: "/api/mobile/sections" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      sections: [
        { id: "active", label: "Active", count: 0 },
        { id: "resistor", label: "Resistor", count: 1 },
        { id: "capacitor", label: "Capacitor", count: 1 },
        { id: "inductor", label: "Inductor", count: 0 },
        { id: "other", label: "Other", count: 0 },
        { id: "manage", label: "Manage", count: null }
      ]
    });
  });

  it("GET /api/mobile/sections counts active and other parts", async () => {
    const { server } = await buildApp([
      passive({
        type: "unknown",
        partId: "b".repeat(26),
        pn: "ESP32-WROOM-32E-N4",
        rawDescription: "WiFi module",
        category: "mcu",
        categoryLabel: "MCU",
        section: "active"
      }),
      passive({
        type: "unknown",
        partId: "c".repeat(26),
        pn: "JST-PH-2",
        rawDescription: "2-pin connector",
        category: "connector",
        categoryLabel: "Connector",
        section: "other"
      })
    ]);

    const res = await server.inject({ method: "GET", url: "/api/mobile/sections" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      sections: [
        { id: "active", count: 1 },
        { id: "resistor", count: 0 },
        { id: "capacitor", count: 0 },
        { id: "inductor", count: 0 },
        { id: "other", count: 1 },
        { id: "manage", count: null }
      ]
    });
  });

  it("GET /api/mobile/parts returns passive rows for a section", async () => {
    const { server } = await buildApp([
      passive({ type: "resistor", totalStock: 42 }),
      passive({ type: "capacitor", partId: "b".repeat(26), pn: "C0402C104K5RACTU", valueDisplay: "100 nF", valueNorm: 0.0000001, totalStock: 7 })
    ]);

    const res = await server.inject({ method: "GET", url: "/api/mobile/parts?section=resistor" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      section: "resistor",
      parts: [
        {
          id: "a".repeat(26),
          section: "resistor",
          category: "resistor",
          categoryLabel: "Resistor",
          value: "10 kΩ",
          pn: "RC0603FR-0710KL",
          quantity: 42,
          description: "10kΩ"
        }
      ]
    });
  });

  it("GET /api/mobile/parts sorts passive rows by valueNorm then pn", async () => {
    const { server } = await buildApp([
      passive({
        type: "resistor",
        partId: "b".repeat(26),
        pn: "RC0603FR-071K",
        valueNorm: 1000,
        valueDisplay: "1 kΩ"
      }),
      passive({
        type: "resistor",
        partId: "c".repeat(26),
        pn: "RC0603FR-072K",
        valueNorm: 2000,
        valueDisplay: "2 kΩ"
      }),
      passive({
        type: "resistor",
        partId: "a".repeat(26),
        pn: "RC0603FR-071K0",
        valueNorm: 1000,
        valueDisplay: "1 kΩ"
      })
    ]);

    const res = await server.inject({ method: "GET", url: "/api/mobile/parts?section=resistor" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      section: "resistor",
      parts: [
        {
          id: "b".repeat(26),
          section: "resistor",
          category: "resistor",
          value: "1 kΩ",
          pn: "RC0603FR-071K",
          quantity: 42,
          description: "10kΩ"
        },
        {
          id: "a".repeat(26),
          section: "resistor",
          category: "resistor",
          value: "1 kΩ",
          pn: "RC0603FR-071K0",
          quantity: 42,
          description: "10kΩ"
        },
        {
          id: "c".repeat(26),
          section: "resistor",
          category: "resistor",
          value: "2 kΩ",
          pn: "RC0603FR-072K",
          quantity: 42,
          description: "10kΩ"
        }
      ]
    });
  });

  it("GET /api/mobile/parts returns active rows with category tags", async () => {
    const { server } = await buildApp([
      passive({
        type: "unknown",
        partId: "b".repeat(26),
        pn: "ESP32-WROOM-32E-N4",
        rawDescription: "WiFi module",
        category: "mcu",
        categoryLabel: "MCU",
        section: "active",
        tags: ["pbm-category-mcu", "mobile-scan"]
      }),
      passive({
        type: "unknown",
        partId: "c".repeat(26),
        pn: "BSS138",
        rawDescription: "MOSFET",
        category: "mosfet",
        categoryLabel: "MOSFET",
        section: "active",
        tags: ["pbm-category-mosfet"]
      })
    ]);

    const res = await server.inject({ method: "GET", url: "/api/mobile/parts?section=active" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      section: "active",
      parts: [
        {
          id: "b".repeat(26),
          section: "active",
          category: "mcu",
          categoryLabel: "MCU",
          tags: ["pbm-category-mcu", "mobile-scan"]
        },
        {
          id: "c".repeat(26),
          section: "active",
          category: "mosfet",
          categoryLabel: "MOSFET",
          tags: ["pbm-category-mosfet"]
        }
      ]
    });
  });

  it("GET /api/mobile/part/:id returns detail with locations", async () => {
    const { server } = await buildApp([passive({})]);

    const res = await server.inject({ method: "GET", url: `/api/mobile/part/${"a".repeat(26)}` });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      id: "a".repeat(26),
      section: "resistor",
      category: "resistor",
      categoryLabel: "Resistor",
      value: "10 kΩ",
      pn: "RC0603FR-0710KL",
      quantity: 42,
      description: "10kΩ",
      locations: [{ storageId: "s".repeat(26), name: "Drawer A1", quantity: 42 }]
    });
  });

  it("GET /api/mobile/storage returns storage locations", async () => {
    const client = {
      addStock: vi.fn(),
      removeStock: vi.fn(),
      createLocalPart: vi.fn(),
      getStorageList: vi.fn().mockResolvedValue(new Map([
        ["s".repeat(26), "Drawer A1"],
        ["t".repeat(26), "Shelf B2"]
      ]))
    } as unknown as import("../../src/partsbox/apiClient.js").PartsBoxApiClient;
    const { server } = await buildApp([passive({})], { client });

    const res = await server.inject({ method: "GET", url: "/api/mobile/storage" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      storage: [
        { id: "s".repeat(26), storageId: "s".repeat(26), name: "Drawer A1", label: "Drawer A1" },
        { id: "t".repeat(26), storageId: "t".repeat(26), name: "Shelf B2", label: "Shelf B2" }
      ]
    });
  });

  it("POST /api/mobile/part/:id/stock-adjust rejects zero delta", async () => {
    const { server } = await buildApp([passive({})]);

    const res = await server.inject({
      method: "POST",
      url: `/api/mobile/part/${"a".repeat(26)}/stock-adjust`,
      payload: { storageId: "s".repeat(26), delta: 0 }
    });

    expect(res.statusCode).toBe(400);
  });

  it("POST /api/mobile/part/:id/stock-adjust rejects fractional delta", async () => {
    const { server } = await buildApp([passive({})]);

    const res = await server.inject({
      method: "POST",
      url: `/api/mobile/part/${"a".repeat(26)}/stock-adjust`,
      payload: { storageId: "s".repeat(26), delta: 0.5 }
    });

    expect(res.statusCode).toBe(400);
  });

  it("POST /api/mobile/part/:id/category updates the local cache without waiting for PartsBox", async () => {
    const part = passive({ partId: "a".repeat(26) });
    const updatePartTags = vi.fn().mockReturnValue(new Promise(() => undefined));
    const sync = {
      sync: vi.fn()
    } as unknown as import("../../src/sync/syncService.js").SyncService;
    const client = {
      addStock: vi.fn(),
      removeStock: vi.fn(),
      updatePartTags,
      createLocalPart: vi.fn()
    } as unknown as import("../../src/partsbox/apiClient.js").PartsBoxApiClient;
    const { server, cache } = await buildApp([part], { client, sync });

    const res = await server.inject({
      method: "POST",
      url: `/api/mobile/part/${"a".repeat(26)}/category`,
      payload: { category: "connector" }
    });

    expect(res.statusCode).toBe(200);
    expect(updatePartTags).toHaveBeenCalledWith({
      partId: "a".repeat(26),
      tags: ["pbm-category-connector"]
    });
    expect(sync.sync).not.toHaveBeenCalled();
    expect(res.json()).toMatchObject({
      part: {
        id: "a".repeat(26),
        category: "connector",
        categoryLabel: "Connector",
        tags: ["pbm-category-connector"]
      },
      sync: { lastSyncedAt: 5, error: null, count: 1, pending: true }
    });
    expect(cache.getPart("a".repeat(26))).toMatchObject({
      category: "connector",
      categoryLabel: "Connector",
      tags: ["pbm-category-connector"]
    });
  });

  it("GET /api/mobile/uncategorized returns uncategorized parts", async () => {
    const { server } = await buildApp([
      passive({ partId: "a".repeat(26), type: "unknown", category: "uncategorized", categoryLabel: "Uncategorized" }),
      passive({ partId: "b".repeat(26), type: "unknown", category: "connector", categoryLabel: "Connector" })
    ]);

    const res = await server.inject({ method: "GET", url: "/api/mobile/uncategorized" });

    expect(res.statusCode).toBe(200);
    expect(res.json().parts.map((p: { id: string }) => p.id)).toEqual(["a".repeat(26)]);
  });

  it("DELETE /api/mobile/part/:id removes the part locally without waiting for full sync", async () => {
    const deletePart = vi.fn().mockReturnValue(new Promise(() => undefined));
    const sync = {
      sync: vi.fn()
    } as unknown as import("../../src/sync/syncService.js").SyncService;
    const client = {
      addStock: vi.fn(),
      removeStock: vi.fn(),
      deletePart
    } as unknown as import("../../src/partsbox/apiClient.js").PartsBoxApiClient;
    const { server, cache } = await buildApp([passive({})], { sync, client });

    const res = await server.inject({
      method: "DELETE",
      url: `/api/mobile/part/${"a".repeat(26)}`
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      ok: true,
      partId: "a".repeat(26),
      sync: { lastSyncedAt: 5, error: null, count: 0, pending: true }
    });
    expect(cache.getPart("a".repeat(26))).toBeUndefined();
    expect(deletePart).toHaveBeenCalledWith({ partId: "a".repeat(26) });
    expect(sync.sync).not.toHaveBeenCalled();
  });

  it("POST /api/mobile/part/:id/stock-adjust adds stock locally without waiting for full sync", async () => {
    const parts = [passive({})];
    const addStock = vi.fn().mockReturnValue(new Promise(() => undefined));
    const sync = {
      sync: vi.fn()
    } as unknown as import("../../src/sync/syncService.js").SyncService;
    const client = {
      addStock,
      removeStock: vi.fn()
    } as unknown as import("../../src/partsbox/apiClient.js").PartsBoxApiClient;
    const { server, cache } = await buildApp(parts, { sync, client });

    const res = await server.inject({
      method: "POST",
      url: `/api/mobile/part/${"a".repeat(26)}/stock-adjust`,
      payload: { storageId: "s".repeat(26), delta: 5, note: "restock" }
    });

    expect(res.statusCode).toBe(200);
    expect(addStock).toHaveBeenCalledWith({
      partId: "a".repeat(26),
      storageId: "s".repeat(26),
      quantity: 5,
      note: "restock"
    });
    expect(res.json()).toMatchObject({
      part: {
        id: "a".repeat(26),
        section: "resistor",
        category: "resistor",
        value: "10 kΩ",
        pn: "RC0603FR-0710KL",
        quantity: 47,
        description: "10kΩ",
        locations: [{ storageId: "s".repeat(26), name: "Drawer A1", quantity: 47 }],
        syncStatus: "pending"
      },
      sync: { lastSyncedAt: 5, error: null, count: 1, pending: true }
    });
    expect(sync.sync).not.toHaveBeenCalled();
    expect(cache.getPart("a".repeat(26))).toMatchObject({
      totalStock: 47,
      locations: [{ storageId: "s".repeat(26), name: "Drawer A1", quantity: 47 }],
      syncStatus: "pending"
    });
  });

  it("POST /api/mobile/part/:id/stock-adjust removes stock locally without waiting for full sync", async () => {
    const parts = [passive({})];
    const removeStock = vi.fn().mockReturnValue(new Promise(() => undefined));
    const sync = {
      sync: vi.fn()
    } as unknown as import("../../src/sync/syncService.js").SyncService;
    const client = {
      addStock: vi.fn(),
      removeStock,
      getPartLots: vi.fn().mockResolvedValue([{ storageId: "s".repeat(26), quantity: 42 }])
    } as unknown as import("../../src/partsbox/apiClient.js").PartsBoxApiClient;
    const { server } = await buildApp(parts, { sync, client });

    const res = await server.inject({
      method: "POST",
      url: `/api/mobile/part/${"a".repeat(26)}/stock-adjust`,
      payload: { storageId: "s".repeat(26), delta: -5 }
    });

    expect(res.statusCode).toBe(200);
    expect(removeStock).toHaveBeenCalledWith({
      partId: "a".repeat(26),
      storageId: "s".repeat(26),
      quantity: 5,
      note: undefined
    });
    expect(res.json()).toMatchObject({
      part: {
        id: "a".repeat(26),
        quantity: 37,
        locations: [{ storageId: "s".repeat(26), name: "Drawer A1", quantity: 37 }],
        syncStatus: "pending"
      },
      sync: { lastSyncedAt: 5, error: null, count: 1, pending: true }
    });
    expect(sync.sync).not.toHaveBeenCalled();
  });

  it("POST /api/mobile/part/:id/stock-adjust removes stock from a single matching lot", async () => {
    const removeStock = vi.fn().mockResolvedValue({ ok: true });
    const client = {
      addStock: vi.fn(),
      removeStock,
      getPartLots: vi.fn().mockResolvedValue([{ storageId: "s".repeat(26), lotId: "l".repeat(26), quantity: 42 }])
    } as unknown as import("../../src/partsbox/apiClient.js").PartsBoxApiClient;
    const { server } = await buildApp([passive({})], { client });

    const res = await server.inject({
      method: "POST",
      url: `/api/mobile/part/${"a".repeat(26)}/stock-adjust`,
      payload: { storageId: "s".repeat(26), delta: -5 }
    });

    expect(res.statusCode).toBe(200);
    expect(removeStock).toHaveBeenCalledWith({
      partId: "a".repeat(26),
      storageId: "s".repeat(26),
      lotId: "l".repeat(26),
      quantity: 5,
      note: undefined
    });
  });

  it("POST /api/mobile/part/:id/stock-adjust rejects ambiguous multi-lot removal", async () => {
    const client = {
      addStock: vi.fn(),
      removeStock: vi.fn(),
      getPartLots: vi.fn().mockResolvedValue([
        { storageId: "s".repeat(26), lotId: "l".repeat(26), quantity: 20 },
        { storageId: "s".repeat(26), lotId: "m".repeat(26), quantity: 22 }
      ])
    } as unknown as import("../../src/partsbox/apiClient.js").PartsBoxApiClient;
    const { server } = await buildApp([passive({})], { client });

    const res = await server.inject({
      method: "POST",
      url: `/api/mobile/part/${"a".repeat(26)}/stock-adjust`,
      payload: { storageId: "s".repeat(26), delta: -5 }
    });

    expect(res.statusCode).toBe(409);
    expect(client.removeStock).not.toHaveBeenCalled();
  });

  it("POST /api/mobile/scan/parse returns parsed label fields", async () => {
    const { server } = await buildApp([]);

    const res = await server.inject({
      method: "POST",
      url: "/api/mobile/scan/parse",
      payload: {
        raw: "Digi-Key 296-1234-1-ND | MPN: TLV70033DDCR | Qty: 10 | Lot: A1B2"
      }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      parsed: {
        vendor: "digikey",
        supplierPartNumber: "296-1234-1-ND",
        manufacturerPartNumber: "TLV70033DDCR",
        quantity: 10,
        lotCode: "A1B2"
      }
    });
  });

  it("POST /api/mobile/scan/parse resolves PartsBox ids", async () => {
    const { server } = await buildApp([]);

    const res = await server.inject({
      method: "POST",
      url: "/api/mobile/scan/parse",
      payload: {
        raw: `https://partsbox.com/me/parts/${"a".repeat(26)}?tab=stock`
      }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      parsed: {
        resolvedPartId: "a".repeat(26),
        sourceUrl: `https://partsbox.com/me/parts/${"a".repeat(26)}?tab=stock`
      }
    });
  });

  it("GET /api/mobile/storage returns ids and display names for iOS pickers", async () => {
    const client = {
      getStorageList: vi.fn().mockResolvedValue(new Map([["s".repeat(26), "Drawer A1"]]))
    } as unknown as import("../../src/partsbox/apiClient.js").PartsBoxApiClient;
    const { server } = await buildApp([], { client });

    const res = await server.inject({ method: "GET", url: "/api/mobile/storage" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      storage: [
        {
          id: "s".repeat(26),
          storageId: "s".repeat(26),
          name: "Drawer A1",
          label: "Drawer A1"
        }
      ]
    });
  });

  it("GET /api/mobile/storage caches storage locations in memory", async () => {
    const client = {
      getStorageList: vi.fn().mockResolvedValue(new Map([["s".repeat(26), "Drawer A1"]]))
    } as unknown as import("../../src/partsbox/apiClient.js").PartsBoxApiClient;
    const { server } = await buildApp([], { client });

    const first = await server.inject({ method: "GET", url: "/api/mobile/storage" });
    const second = await server.inject({ method: "GET", url: "/api/mobile/storage" });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(client.getStorageList).toHaveBeenCalledTimes(1);
  });

  it("POST /api/mobile/scan/resolve opens an existing PartsBox QR part", async () => {
    const { server } = await buildApp([passive({ partId: "p".repeat(26), pn: "TLV70033DDCR" })]);

    const res = await server.inject({
      method: "POST",
      url: "/api/mobile/scan/resolve",
      payload: { raw: `https://partsbox.com/parts/${"p".repeat(26)}` }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      parsed: {
        resolvedPartId: "p".repeat(26)
      },
      part: {
        id: "p".repeat(26),
        pn: "TLV70033DDCR"
      }
    });
  });

  it("POST /api/mobile/scan/resolve opens an existing scanned MPN", async () => {
    const { server } = await buildApp([passive({ partId: "p".repeat(26), pn: "ESP32-WROOM-32E-N4" })]);

    const res = await server.inject({
      method: "POST",
      url: "/api/mobile/scan/resolve",
      payload: { raw: "LCSC C123456 | MPN: ESP32-WROOM-32E-N4 | QTY 5" }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      part: {
        id: "p".repeat(26),
        pn: "ESP32-WROOM-32E-N4"
      }
    });
  });

  it("POST /api/mobile/scan/confirm creates a local part, adds stock, and refreshes only that part", async () => {
    const createLocalPart = vi.fn().mockResolvedValue({ partId: "c".repeat(26) });
    const addStock = vi.fn().mockResolvedValue({ ok: true });
    const getPart = vi.fn().mockResolvedValue({
      partId: "c".repeat(26),
      pn: "ESP32-WROOM-32E-N4",
      description: "WiFi module"
    });
    const getPartStorageSources = vi.fn().mockResolvedValue([
      { storageId: "s".repeat(26), quantity: 5 }
    ]);
    const sync = {
      sync: vi.fn().mockResolvedValue({
        parts: [],
        lastSyncedAt: 202,
        error: null
      })
    } as unknown as import("../../src/sync/syncService.js").SyncService;
    const client = {
      createLocalPart,
      addStock,
      getPart,
      getPartStorageSources,
      removeStock: vi.fn()
    } as unknown as import("../../src/partsbox/apiClient.js").PartsBoxApiClient;
    const { server } = await buildApp([], { sync, client });

    const res = await server.inject({
      method: "POST",
      url: "/api/mobile/scan/confirm",
      payload: {
        raw: "LCSC C123456 | MPN: ESP32-WROOM-32E-N4 | QTY 5",
        storageId: "s".repeat(26),
        name: "ESP32-WROOM-32E-N4",
        description: "WiFi module",
        quantity: 5
      }
    });

    expect(res.statusCode).toBe(200);
    expect(createLocalPart).toHaveBeenCalledWith({
      name: "ESP32-WROOM-32E-N4",
      description: "WiFi module",
      tags: expect.arrayContaining(["mobile-scan", "lcsc", "pbm-category-mcu"])
    });
    expect(addStock).toHaveBeenCalledWith({
      partId: "c".repeat(26),
      storageId: "s".repeat(26),
      quantity: 5,
      note: "Scanned LCSC C123456"
    });
    expect(getPart).toHaveBeenCalledWith("c".repeat(26));
    expect(getPartStorageSources).toHaveBeenCalledWith("c".repeat(26));
    expect(sync.sync).not.toHaveBeenCalled();
    expect(res.json()).toEqual({
      partId: "c".repeat(26),
      parsed: expect.objectContaining({ vendor: "lcsc" }),
      sync: { lastSyncedAt: 5, error: null, count: 1 }
    });
  });

  it("POST /api/mobile/scan/confirm can queue a local pending part without waiting for PartsBox", async () => {
    const createLocalPart = vi.fn();
    const addStock = vi.fn();
    const pendingSync = {
      enqueueCreatePart: vi.fn().mockResolvedValue({ id: "mutation-1" }),
      flush: vi.fn().mockReturnValue(new Promise(() => undefined))
    } as unknown as PendingSyncService;
    const client = {
      createLocalPart,
      addStock,
      removeStock: vi.fn()
    } as unknown as import("../../src/partsbox/apiClient.js").PartsBoxApiClient;
    const { server, cache } = await buildApp([], { client, pendingSync });

    const res = await server.inject({
      method: "POST",
      url: "/api/mobile/scan/confirm",
      payload: {
        raw: "LCSC C123456 | MPN: ESP32-WROOM-32E-N4 | QTY 5",
        storageId: "s".repeat(26),
        name: "ESP32-WROOM-32E-N4",
        description: "WiFi module",
        quantity: 5
      }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.partId).toMatch(/^local[a-z0-9]{21}$/);
    expect(body.sync).toMatchObject({ pending: true });
    expect(createLocalPart).not.toHaveBeenCalled();
    expect(addStock).not.toHaveBeenCalled();
    expect(pendingSync.enqueueCreatePart).toHaveBeenCalledWith(
      expect.objectContaining({
        localPartId: body.partId,
        create: expect.objectContaining({
          name: "ESP32-WROOM-32E-N4",
          description: "WiFi module",
          tags: expect.arrayContaining(["mobile-scan", "lcsc", "pbm-category-mcu"])
        }),
        defaultStorageId: "s".repeat(26),
        stock: expect.objectContaining({
          storageId: "s".repeat(26),
          quantity: 5
        })
      })
    );
    expect(pendingSync.flush).toHaveBeenCalledOnce();
    expect(cache.getPart(body.partId)).toMatchObject({
      partId: body.partId,
      pn: "ESP32-WROOM-32E-N4",
      totalStock: 5,
      syncStatus: "pending"
    });
  });

  it("POST /api/mobile/scan/confirm uses Nexar enrichment when available", async () => {
    const createLocalPart = vi.fn().mockResolvedValue({ partId: "c".repeat(26) });
    const updatePartDefaultStorage = vi.fn().mockResolvedValue({ ok: true });
    const addStock = vi.fn().mockResolvedValue({ ok: true });
    const sync = {
      sync: vi.fn().mockResolvedValue({
        parts: [],
        lastSyncedAt: 303,
        error: null
      })
    } as unknown as import("../../src/sync/syncService.js").SyncService;
    const client = {
      createLocalPart,
      updatePartDefaultStorage,
      addStock,
      removeStock: vi.fn()
    } as unknown as import("../../src/partsbox/apiClient.js").PartsBoxApiClient;
    const enricher = {
      enrich: vi.fn().mockResolvedValue({
        name: "ESP32-WROOM-32E-N4",
        description: "WiFi module",
        categoryName: "Wireless Modules",
        tags: ["nexar"],
        notes: "Enriched from Nexar"
      })
    };
    const { server } = await buildApp([], { sync, client, enricher });

    const res = await server.inject({
      method: "POST",
      url: "/api/mobile/scan/confirm",
      payload: {
        raw: "ESP32-WROOM-32E-N4",
        storageId: "s".repeat(26),
        quantity: 5
      }
    });

    expect(res.statusCode).toBe(200);
    expect(enricher.enrich).toHaveBeenCalled();
    expect(createLocalPart).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "ESP32-WROOM-32E-N4",
        description: "WiFi module",
        tags: expect.arrayContaining(["mobile-scan", "nexar", "pbm-category-module"]),
        notes: "Enriched from Nexar"
      })
    );
    expect(createLocalPart.mock.calls[0][0].tags).not.toContain("active");
    expect(updatePartDefaultStorage).toHaveBeenCalledWith({
      partId: "c".repeat(26),
      storageId: "s".repeat(26)
    });
    expect(addStock).toHaveBeenCalledWith({
      partId: "c".repeat(26),
      storageId: "s".repeat(26),
      quantity: 5,
      note: expect.stringContaining("Scanned")
    });
  });

  it("POST /api/mobile/scan/confirm uses Nexar category text for taxonomy without long supplier tags", async () => {
    const createLocalPart = vi.fn().mockResolvedValue({ partId: "c".repeat(26) });
    const updatePartDefaultStorage = vi.fn().mockResolvedValue({ ok: true });
    const addStock = vi.fn().mockResolvedValue({ ok: true });
    const sync = {
      sync: vi.fn().mockResolvedValue({
        parts: [],
        lastSyncedAt: 404,
        error: null
      })
    } as unknown as import("../../src/sync/syncService.js").SyncService;
    const client = {
      createLocalPart,
      updatePartDefaultStorage,
      addStock,
      removeStock: vi.fn()
    } as unknown as import("../../src/partsbox/apiClient.js").PartsBoxApiClient;
    const enricher = {
      enrich: vi.fn().mockResolvedValue({
        name: "ADA4051-1AKSZ-R7",
        categoryName: "Amplifiers, Op Amps, Buffer, Instrumentation",
        tags: ["nexar"],
        notes: "Enriched from Nexar"
      })
    };
    const { server } = await buildApp([], { sync, client, enricher });

    const res = await server.inject({
      method: "POST",
      url: "/api/mobile/scan/confirm",
      payload: {
        raw: "ADA4051-1AKSZ-R7",
        storageId: "s".repeat(26),
        quantity: 5
      }
    });

    expect(res.statusCode).toBe(200);
    expect(createLocalPart).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "ADA4051-1AKSZ-R7",
        tags: expect.arrayContaining(["mobile-scan", "nexar", "pbm-category-opamp"])
      })
    );
    expect(createLocalPart.mock.calls[0][0].tags).not.toContain("nexar-amplifiers-op-amps-buffer-instrumentation");
  });

  it("scan/confirm tags an op-amp from the Nexar category", async () => {
  let captured = null as { tags?: string[] } | null;
  const client = {
    createLocalPart: async (input: { tags?: string[] }) => {
      captured = input;
      return { partId: "c".repeat(26) };
    },
    addStock: async () => ({ ok: true }),
    updatePartDefaultStorage: async () => ({ ok: true })
  } as unknown as import("../../src/partsbox/apiClient.js").PartsBoxApiClient;
  const enricher = {
    enrich: async () => ({ name: "TL072", categoryName: "Amplifier ICs" })
  };
  const { server } = await buildApp([], { client, enricher });

  const res = await server.inject({
    method: "POST",
    url: "/api/mobile/scan/confirm",
    payload: { raw: "TL072" }
  });

  expect(res.statusCode).toBe(200);
  expect(captured?.tags).toContain("pbm-category-opamp");
});

  it("POST /api/mobile/scan/enrich returns the Nexar description and detected category", async () => {
    const enricher = {
      enrich: async () => ({
        name: "ADA4051-1AKSZ-R7",
        description: "Op Amp Single Micropower Amplifier R-R I/O 5.5V 5-Pin SC-70 T/R",
        categoryName: "Amplifiers - Op Amps, Buffer, Instrumentation"
      })
    };
    const { server } = await buildApp([], { enricher });

    const res = await server.inject({
      method: "POST",
      url: "/api/mobile/scan/enrich",
      payload: { raw: "ADA4051-1AKSZ-R7" }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.category).toBe("opamp");
    expect(body.categoryLabel).toBe("Op-Amp");
    expect(body.section).toBe("active");
    expect(body.sectionLabel).toBe("Active");
    expect(body.description).toBe("Op Amp Single Micropower Amplifier R-R I/O 5.5V 5-Pin SC-70 T/R");
    expect(body.name).toBe("ADA4051-1AKSZ-R7");
  });

  it("POST /api/mobile/storage creates a location", async () => {
  const newId = "n".repeat(26);
  const client = {
    createStorage: async ({ name }: { name: string }) => ({ id: newId, name })
  } as unknown as import("../../src/partsbox/apiClient.js").PartsBoxApiClient;
  const { server } = await buildApp([], { client });

  const res = await server.inject({ method: "POST", url: "/api/mobile/storage", payload: { name: "Drawer B3" } });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ id: newId, storageId: newId, name: "Drawer B3", label: "Drawer B3" });
});

it("DELETE /api/mobile/storage/:id returns 409 when not empty", async () => {
  const storageId = "s".repeat(26);
  const client = {
    getStorageParts: async () => [{ partId: "p".repeat(26), quantity: 4 }],
    archiveStorage: async () => undefined
  } as unknown as import("../../src/partsbox/apiClient.js").PartsBoxApiClient;
  const { server } = await buildApp([], { client });

  const res = await server.inject({ method: "DELETE", url: `/api/mobile/storage/${storageId}` });
  expect(res.statusCode).toBe(409);
});

it("DELETE /api/mobile/storage/:id archives an empty location", async () => {
  const storageId = "s".repeat(26);
  let archived: string | null = null;
  const client = {
    getStorageParts: async () => [],
    archiveStorage: async (id: string) => {
      archived = id;
    }
  } as unknown as import("../../src/partsbox/apiClient.js").PartsBoxApiClient;
  const { server } = await buildApp([], { client });

  const res = await server.inject({ method: "DELETE", url: `/api/mobile/storage/${storageId}` });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ ok: true, storageId });
  expect(archived).toBe(storageId);
});

it("GET /api/mobile/storage/:id/parts returns parts in the specified storage location", async () => {
  const storageId = "s".repeat(26);
  const { server } = await buildApp([
    passive({ partId: "p".repeat(26), pn: "PART-A", locations: [{ storageId, name: "Drawer A1", quantity: 10 }] }),
    passive({ partId: "q".repeat(26), pn: "PART-B", locations: [{ storageId: "other-id", name: "Drawer B2", quantity: 5 }] })
  ]);

  const res = await server.inject({
    method: "GET",
    url: `/api/mobile/storage/${storageId}/parts`
  });

  expect(res.statusCode).toBe(200);
  const body = res.json();
  expect(body.storageId).toBe(storageId);
  expect(body.parts.map((p: any) => p.id)).toEqual(["p".repeat(26)]);
});

it("GET /api/mobile/storage/:id/label.png renders storage QR label", async () => {
  const storageId = "s".repeat(26);
  const client = {
    getStorageList: vi.fn().mockResolvedValue(new Map([[storageId, "Drawer A1"]]))
  } as any;
  const { server } = await buildApp([], { client });

  const res = await server.inject({
    method: "GET",
    url: `/api/mobile/storage/${storageId}/label.png`
  });

  expect(res.statusCode).toBe(200);
  expect(res.headers["content-type"]).toContain("image/png");
  expect([...res.rawPayload.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
});

  it("POST /api/mobile/scan/confirm uses a resolved PartsBox part id instead of creating a duplicate", async () => {
    const createLocalPart = vi.fn().mockResolvedValue({ partId: "d".repeat(26) });
    const addStock = vi.fn().mockResolvedValue({ ok: true });
    const sync = {
      sync: vi.fn().mockResolvedValue({
        parts: [],
        lastSyncedAt: 404,
        error: null
      })
    } as unknown as import("../../src/sync/syncService.js").SyncService;
    const client = {
      createLocalPart,
      addStock,
      removeStock: vi.fn()
    } as unknown as import("../../src/partsbox/apiClient.js").PartsBoxApiClient;
    const { server } = await buildApp([], { sync, client });

    const res = await server.inject({
      method: "POST",
      url: "/api/mobile/scan/confirm",
      payload: {
        raw: "https://partsbox.com/me/parts/" + "a".repeat(26)
      }
    });

    expect(res.statusCode).toBe(200);
    expect(createLocalPart).not.toHaveBeenCalled();
    expect(addStock).not.toHaveBeenCalled();
    expect(res.json()).toMatchObject({
      partId: "a".repeat(26),
      parsed: {
        resolvedPartId: "a".repeat(26)
      }
    });
  });

  it("POST /api/mobile/scan/confirm stores datasheet, package, tolerance, voltage, manufacturer, and value details", async () => {
    const createLocalPart = vi.fn().mockResolvedValue({ partId: "c".repeat(26) });
    const addStock = vi.fn();
    const getPart = vi.fn().mockResolvedValue({
      partId: "c".repeat(26),
      partType: "local",
      pn: "744311220",
      description: "Wurth Inductor",
      notes: "Manufacturer: Wurth\nDatasheet: [PDF Link](https://example.com/ds.pdf)\n\n### Technical Specifications\n| Specification | Value |\n| --- | --- |\n| Value | 2.2uH |\n| Tolerance | 20% |\n| Voltage | 100V |\n| Package | SMD |"
    });
    const client = {
      createLocalPart,
      addStock,
      getPart,
      getPartStorageSources: vi.fn().mockResolvedValue([])
    } as unknown as import("../../src/partsbox/apiClient.js").PartsBoxApiClient;
    const { server, cache } = await buildApp([], { client });

    const res = await server.inject({
      method: "POST",
      url: "/api/mobile/scan/confirm",
      payload: {
        raw: "744311220",
        storageId: "s".repeat(26),
        name: "744311220",
        description: "Wurth Inductor",
        category: "inductor",
        quantity: 1,
        value: "2.2uH",
        tolerance: "20%",
        voltage: "100V",
        package: "SMD",
        manufacturer: "Wurth",
        datasheetUrl: "https://example.com/ds.pdf"
      }
    });

    expect(res.statusCode).toBe(200);
    expect(createLocalPart).toHaveBeenCalledWith(expect.objectContaining({
      name: "744311220",
      description: "Wurth Inductor",
      notes: expect.stringContaining("Manufacturer: Wurth\nDatasheet: [PDF Link](https://example.com/ds.pdf)\n\n### Technical Specifications\n| Specification | Value |\n| --- | --- |\n| Value | 2.2uH |\n| Tolerance | 20% |\n| Voltage | 100V |\n| Package | SMD |")
    }));

    const cachedPart = cache.getPart("c".repeat(26));
    expect(cachedPart).toMatchObject({
      pn: "744311220",
      valueDisplay: "2.2 µH",
      valueNorm: 0.0000022,
      tolerance: "20%",
      voltage: "100V",
      package: "SMD",
      manufacturer: "Wurth",
      datasheetUrl: "https://example.com/ds.pdf"
    });
  });

  it("POST /api/mobile/part/:id/pull-details refreshes part details via DigiKey API and updates PartsBox & cache", async () => {
    const updatePartDetails = vi.fn().mockResolvedValue({ ok: true });
    const getPart = vi.fn().mockResolvedValue({
      partId: "c".repeat(26),
      partType: "local",
      pn: "744311220",
      description: "Updated Wurth Inductor",
      notes: "Manufacturer: Wurth\nDatasheet: [PDF Link](https://example.com/ds.pdf)\n\n### Technical Specifications\n| Specification | Value |\n| --- | --- |\n| Value | 2.2uH |\n| Tolerance | 20% |\n| Voltage | 100V |\n| Package | SMD |"
    });
    const enrich = vi.fn().mockResolvedValue({
      name: "744311220",
      description: "Updated Wurth Inductor",
      categoryName: "Fixed Inductors",
      notes: "Manufacturer: Wurth\nDatasheet: [PDF Link](https://example.com/ds.pdf)\n\n### Technical Specifications\n| Specification | Value |\n| --- | --- |\n| Value | 2.2uH |\n| Tolerance | 20% |\n| Voltage | 100V |\n| Package | SMD |",
      tags: ["digikey", "pbm-category-inductor"],
      price: 1.03,
      currency: "USD"
    });
    const enricher = {
      isEnabled: () => true,
      isAuthenticated: async () => true,
      enrich
    } as any;
    const client = {
      updatePartDetails,
      getPart,
      getPartStorageSources: vi.fn().mockResolvedValue([])
    } as any;

    const initialPart = passive({
      partId: "c".repeat(26),
      pn: "744311220",
      rawDescription: "Old description"
    });
    const { server, cache } = await buildApp([initialPart], { client, enricher });

    const res = await server.inject({
      method: "POST",
      url: `/api/mobile/part/${"c".repeat(26)}/pull-details`
    });

    expect(res.statusCode).toBe(200);
    expect(enrich).toHaveBeenCalledWith(expect.objectContaining({ raw: "744311220" }));
    expect(updatePartDetails).toHaveBeenCalledWith(expect.objectContaining({
      partId: "c".repeat(26),
      description: "Updated Wurth Inductor",
      notes: expect.stringContaining("Manufacturer: Wurth\nDatasheet: [PDF Link](https://example.com/ds.pdf)\n\n### Technical Specifications\n| Specification | Value |\n| --- | --- |\n| Value | 2.2uH |\n| Tolerance | 20% |\n| Voltage | 100V |\n| Package | SMD |"),
      tags: expect.arrayContaining(["digikey", "pbm-category-inductor"])
    }));

    const cachedPart = cache.getPart("c".repeat(26));
    expect(cachedPart).toMatchObject({
      pn: "744311220",
      rawDescription: "Updated Wurth Inductor",
      valueDisplay: "2.2 µH",
      valueNorm: 0.0000022,
      tolerance: "20%",
      voltage: "100V",
      package: "SMD",
      manufacturer: "Wurth",
      datasheetUrl: "https://example.com/ds.pdf",
      price: 1.03,
      currency: "USD"
    });
  });

  describe("GET /api/mobile/part/:id/label.png", () => {
    it("renders a PNG label for the cached part", async () => {
      const { server } = await buildApp([passive({ partId: "a".repeat(26), pn: "RC0603FR-0710KL", rawDescription: "10kΩ 1% 0603" })]);

      const res = await server.inject({ method: "GET", url: `/api/mobile/part/${"a".repeat(26)}/label.png` });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("image/png");
      // PNG magic bytes
      expect([...res.rawPayload.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    });

    it("renders a PNG label for the requested paper size", async () => {
      const { server } = await buildApp([passive({ partId: "a".repeat(26), pn: "RC0603FR-0710KL", rawDescription: "10kΩ 1% 0603" })]);

      const res = await server.inject({ method: "GET", url: `/api/mobile/part/${"a".repeat(26)}/label.png?paper=40x15` });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("image/png");

      const metadata = await import("sharp").then((mod) => mod.default(res.rawPayload).metadata());
      expect(metadata.width).toBe(472);
      expect(metadata.height).toBe(177);
    });

    it("rejects an unsupported paper size", async () => {
      const { server } = await buildApp([passive({ partId: "a".repeat(26), pn: "RC0603FR-0710KL", rawDescription: "10kΩ 1% 0603" })]);

      const res = await server.inject({ method: "GET", url: `/api/mobile/part/${"a".repeat(26)}/label.png?paper=bogus` });

      expect(res.statusCode).toBe(400);
    });

    it("returns 404 for an unknown part id", async () => {
      const { server } = await buildApp([passive({ partId: "a".repeat(26) })]);

      const res = await server.inject({ method: "GET", url: `/api/mobile/part/${"b".repeat(26)}/label.png` });

      expect(res.statusCode).toBe(404);
    });

    it("returns 400 for a malformed part id", async () => {
      const { server } = await buildApp([passive({})]);

      const res = await server.inject({ method: "GET", url: "/api/mobile/part/not-a-valid-id/label.png" });

      expect(res.statusCode).toBe(400);
    });
  });
});
