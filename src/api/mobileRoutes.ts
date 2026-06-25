import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { compactPartIdSchema } from "../domain/labelRecord.js";
import { DEFAULT_LABEL_PAPER_SIZE, parseLabelPaperSize } from "../render/paperProfiles.js";
import type { LibraryCache } from "../cache/libraryCache.js";
import type { SyncService } from "../sync/syncService.js";
import type { ParsedPassive, RawPart, PassiveType } from "../domain/passive.js";
import type { PartsBoxApiClient } from "../partsbox/apiClient.js";
import type { PendingSyncService } from "../sync/pendingSyncService.js";
import type { DigiKeyEnricher } from "../digikey/enricher.js";
import type { OverrideStore } from "../overrides/overrideStore.js";
import type { HistoryStore } from "../sync/historyStore.js";
import { renderLabelPng, renderStorageLabelPng } from "../render/labelRenderer.js";
import { extract, parseNotes } from "../extract/extractor.js";
import { categoryFromNexar, categoryLabel, categoryTag, inferPartCategory, sectionForCategory, sectionLabel, stripCategoryTags, type CategoryId, type CategoryMatch } from "../domain/category.js";
import { parseScanLabel, type ParsedScanLabel } from "../scan/labelParser.js";
import { parseDescription } from "../parser/descriptionParser.js";
import { formatValue, siMultiplier } from "../parser/units.js";

export interface ScanEnrichment {
  name: string;
  description?: string;
  tags?: string[];
  categoryName?: string;
  notes?: string;
  price?: number;
  currency?: string;
}

export interface ScanEnricher {
  enrich(input: { raw: string; parsed: ParsedScanLabel }): Promise<ScanEnrichment | null>;
}

export interface MobileRouteDeps {
  cache: LibraryCache;
  sync: SyncService;
  client: PartsBoxApiClient;
  enricher?: ScanEnricher;
  digikeyEnricher?: DigiKeyEnricher;
  pendingSync?: PendingSyncService;
  overrides?: OverrideStore;
  history?: HistoryStore;
}

const mobileSectionSchema = z.enum(["active", "resistor", "capacitor", "inductor", "other", "manage"]);
const mobileCategorySchema = z.enum([
  "resistor",
  "capacitor",
  "inductor",
  "ic",
  "mcu",
  "opamp",
  "regulator",
  "mosfet",
  "bjt",
  "diode-led",
  "crystal-oscillator",
  "sensor",
  "module",
  "connector",
  "switch-button",
  "cable",
  "mechanical",
  "tool-consumable",
  "other",
  "uncategorized"
]);
const mobileAdjustSchema = z
  .object({
    storageId: compactPartIdSchema,
    delta: z.number().int().refine((value) => value !== 0, "delta must not be 0"),
    note: z.string().trim().min(1).optional()
  })
  .strict();
const mobileCategoryUpdateSchema = z
  .object({
    category: mobileCategorySchema,
    tag: z.string().trim().min(1).optional()
  })
  .strict();
const mobileScanParseSchema = z
  .object({
    raw: z.string()
  })
  .strict();
const mobileScanConfirmSchema = z
  .object({
    raw: z.string(),
    storageId: compactPartIdSchema.optional(),
    name: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
    category: mobileCategorySchema.optional(),
    tag: z.string().trim().min(1).optional(),
    quantity: z.number().int().positive().optional(),
    value: z.string().trim().min(1).optional().nullable(),
    tolerance: z.string().trim().min(1).optional().nullable(),
    voltage: z.string().trim().min(1).optional().nullable(),
    package: z.string().trim().min(1).optional().nullable(),
    manufacturer: z.string().trim().min(1).optional().nullable(),
    datasheetUrl: z.string().trim().min(1).optional().nullable()
  })
  .strict();
const mobileCreateStorageSchema = z
  .object({
    name: z.string().trim().min(1)
  })
  .strict();

type MobileSectionId = z.infer<typeof mobileSectionSchema>;
interface MobileSection {
  id: MobileSectionId;
  label: string;
  count: number | null;
}

interface MobilePartRow {
  id: string;
  section: MobileSectionId;
  category: CategoryId;
  categoryLabel: string;
  tags: string[];
  syncStatus?: ParsedPassive["syncStatus"];
  syncError?: string | null;
  value: string | null;
  pn: string;
  quantity: number;
  description: string;
  manufacturer?: string | null;
  price?: number | null;
  currency?: string | null;
  datasheetUrl?: string | null;
  tolerance?: string | null;
  voltage?: string | null;
  package?: string | null;
}

interface MobilePartDetail extends MobilePartRow {
  locations: ParsedPassive["locations"];
}

const SECTIONS: MobileSection[] = [
  { id: "active", label: "Active", count: 0 },
  { id: "resistor", label: "Resistor", count: 0 },
  { id: "capacitor", label: "Capacitor", count: 0 },
  { id: "inductor", label: "Inductor", count: 0 },
  { id: "other", label: "Other", count: 0 },
  { id: "manage", label: "Manage", count: null }
];

function normalizeTags(tags: string[] | undefined): string[] {
  return tags ?? [];
}

function rawPartFromCache(part: ParsedPassive): RawPart {
  return {
    partId: part.partId,
    partType: "local",
    name: part.pn,
    mpn: part.pn,
    manufacturer: part.manufacturer,
    description: part.rawDescription,
    footprint: part.package ?? "",
    tags: normalizeTags(part.tags)
  };
}

function resolveCategory(part: ParsedPassive): { category: CategoryId; categoryLabel: string; section: MobileSectionId } {
  if (part.category && part.categoryLabel) {
    return { category: part.category, categoryLabel: part.categoryLabel, section: part.section ?? sectionForCategory(part.category) };
  }
  return inferPartCategory(rawPartFromCache(part), part.type);
}

function sectionFromPart(part: ParsedPassive): MobileSectionId {
  return resolveCategory(part).section;
}

function comparePassiveRows(a: ParsedPassive, b: ParsedPassive): number {
  if (a.valueNorm == null && b.valueNorm == null) {
    return a.pn === b.pn ? a.partId.localeCompare(b.partId) : a.pn.localeCompare(b.pn);
  }
  if (a.valueNorm == null) return 1;
  if (b.valueNorm == null) return -1;
  if (a.valueNorm !== b.valueNorm) return a.valueNorm - b.valueNorm;
  if (a.pn !== b.pn) return a.pn.localeCompare(b.pn);
  return a.partId.localeCompare(b.partId);
}

function compareCategorizedRows(a: ParsedPassive, b: ParsedPassive): number {
  const aCategory = resolveCategory(a);
  const bCategory = resolveCategory(b);
  if (aCategory.category !== bCategory.category) {
    return aCategory.category.localeCompare(bCategory.category);
  }
  if (a.pn !== b.pn) return a.pn.localeCompare(b.pn);
  return a.partId.localeCompare(b.partId);
}

function toRow(part: ParsedPassive): MobilePartRow {
  const category = resolveCategory(part);
  return {
    id: part.partId,
    section: category.section,
    category: category.category,
    categoryLabel: category.categoryLabel,
    tags: normalizeTags(part.tags),
    syncStatus: part.syncStatus,
    syncError: part.syncError,
    value: part.valueDisplay,
    pn: part.pn,
    quantity: part.totalStock,
    description: part.rawDescription,
    manufacturer: part.manufacturer ?? null,
    price: part.price ?? null,
    currency: part.currency ?? null,
    datasheetUrl: part.datasheetUrl ?? null,
    tolerance: part.tolerance ?? null,
    voltage: part.voltage ?? null,
    package: part.package ?? null
  };
}

function toDetail(part: ParsedPassive): MobilePartDetail {
  return {
    ...toRow(part),
    locations: part.locations
  };
}

function buildSections(parts: ParsedPassive[]): MobileSection[] {
  const counts = new Map<MobileSectionId, number | null>([
    ["active", 0],
    ["resistor", 0],
    ["capacitor", 0],
    ["inductor", 0],
    ["other", 0],
    ["manage", null]
  ]);

  for (const part of parts) {
    const section = sectionFromPart(part);
    if (section === "manage") continue;
    counts.set(section, ((counts.get(section) ?? 0) as number) + 1);
  }

  return SECTIONS.map((section) => ({
    ...section,
    count: counts.get(section.id) ?? section.count
  }));
}

function stockSyncMetadata(snapshot: Awaited<ReturnType<SyncService["sync"]>>) {
  return {
    lastSyncedAt: snapshot.lastSyncedAt,
    error: snapshot.error,
    count: snapshot.parts.length
  };
}

function cachedSyncMetadata(snapshot: ReturnType<LibraryCache["getSnapshot"]>) {
  return {
    lastSyncedAt: snapshot.lastSyncedAt,
    error: snapshot.error,
    count: snapshot.parts.length,
    pending: true
  };
}

function refreshedPartMetadata(snapshot: ReturnType<LibraryCache["getSnapshot"]>) {
  return {
    lastSyncedAt: snapshot.lastSyncedAt,
    error: snapshot.error,
    count: snapshot.parts.length
  };
}

function pendingSyncMetadata(snapshot: ReturnType<LibraryCache["getSnapshot"]>) {
  return {
    lastSyncedAt: snapshot.lastSyncedAt,
    error: snapshot.error,
    count: snapshot.parts.length,
    pending: true
  };
}

function baseScanTags(parsed: ParsedScanLabel): string[] {
  const tags = ["mobile-scan"];
  if (parsed.vendor !== "unknown") {
    tags.push(parsed.vendor);
  }
  return tags;
}

function fallbackScanDescription(parsed: ParsedScanLabel): string {
  return [
    parsed.manufacturerPartNumber ? `MPN: ${parsed.manufacturerPartNumber}` : null,
    parsed.supplierPartNumber ? `Supplier PN: ${parsed.supplierPartNumber}` : null
  ]
    .filter((value): value is string => value != null)
    .join("; ");
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.filter((value): value is string => value != null))];
}

function serializeStorage(storage: Map<string, string>): Array<{ id: string; storageId: string; name: string; label: string }> {
  return [...storage.entries()].map(([storageId, name]) => ({ id: storageId, storageId, name, label: name }));
}

async function getStorageListSafely(client: PartsBoxApiClient): Promise<Map<string, string>> {
  if (typeof client.getStorageList !== "function") {
    return new Map();
  }
  return client.getStorageList().catch(() => new Map<string, string>());
}

interface StorageCache {
  get: () => Promise<Map<string, string>>;
  invalidate: () => void;
}

function makeStorageCache(client: PartsBoxApiClient, ttlMs = 5 * 60 * 1000): StorageCache {
  let cached: { expiresAt: number; storage: Map<string, string> } | null = null;
  let inflight: Promise<Map<string, string>> | null = null;

  const get = async () => {
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return cached.storage;
    }
    if (inflight) {
      return inflight;
    }
    inflight = client.getStorageList()
      .then((storage) => {
        cached = { storage, expiresAt: Date.now() + ttlMs };
        return storage;
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  };

  return {
    get,
    invalidate: () => {
      cached = null;
    }
  };
}

function findScannedPart(parts: ParsedPassive[], parsed: ParsedScanLabel, raw: string): ParsedPassive | null {
  if (parsed.resolvedPartId) {
    return parts.find((part) => part.partId === parsed.resolvedPartId) ?? null;
  }

  const candidates = uniqueStrings([
    parsed.manufacturerPartNumber,
    parsed.supplierPartNumber,
    raw.trim()
  ]).map((value) => value.toLowerCase());

  if (candidates.length === 0) {
    return null;
  }

  return (
    parts.find((part) => {
      const pn = part.pn.toLowerCase();
      return candidates.some((candidate) => pn === candidate);
    }) ?? null
  );
}

function makeLocalPartId(): string {
  return `local${randomBytes(16).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "0").slice(0, 21)}`.slice(0, 26);
}

function buildPendingPart(input: {
  localPartId: string;
  name: string;
  description: string;
  tags: string[];
  category: ReturnType<typeof inferPartCategory>;
  storageId?: string;
  storageName?: string;
  quantity?: number;
  value?: string | null;
  tolerance?: string | null;
  voltage?: string | null;
  package?: string | null;
  manufacturer?: string | null;
  datasheetUrl?: string | null;
  notes?: string | null;
  price?: number;
  currency?: string;
}): ParsedPassive {
  const locations = input.storageId && input.quantity
    ? [{ storageId: input.storageId, name: input.storageName ?? "Pending storage", quantity: input.quantity }]
    : [];

  const VALUE_RE = /^(\d+(?:\.\d+)?)\s*([pnµumkKMG]?)$/;
  let valueNorm: number | null = null;
  let valueDisplay: string | null = null;
  if (input.value) {
    valueDisplay = input.value;
    const type = input.category.category === "resistor" ? "resistor" :
                 input.category.category === "capacitor" ? "capacitor" :
                 input.category.category === "inductor" ? "inductor" : "unknown";
    if (type !== "unknown") {
      const m = VALUE_RE.exec(input.value.trim());
      if (m) {
        const mult = siMultiplier(m[2]);
        if (mult != null) {
          valueNorm = Number(m[1]) * mult;
          valueDisplay = formatValue(valueNorm, type);
        }
      }
    }
  }

  const categoryType = input.category.category;
  const passType: PassiveType = categoryType === "resistor" || categoryType === "capacitor" || categoryType === "inductor"
    ? categoryType
    : "unknown";

  return {
    partId: input.localPartId,
    pn: input.name,
    manufacturer: input.manufacturer ?? null,
    type: passType,
    valueNorm,
    valueDisplay,
    tolerance: input.tolerance ?? null,
    voltage: input.voltage ?? null,
    package: input.package ?? null,
    confidence: valueNorm != null ? "high" : "unknown",
    valueSource: valueNorm != null ? "override" : null,
    rawDescription: input.description,
    locations,
    totalStock: locations.reduce((sum, location) => sum + location.quantity, 0),
    tags: input.tags,
    category: input.category.category,
    categoryLabel: input.category.categoryLabel,
    section: input.category.section,
    syncStatus: "pending",
    syncError: null,
    notes: input.notes ?? undefined,
    datasheetUrl: input.datasheetUrl ?? null,
    price: input.price ?? null,
    currency: input.currency ?? null
  };
}

async function updateCachedStock(input: {
  cache: LibraryCache;
  partId: string;
  storageId: string;
  delta: number;
}): Promise<ParsedPassive | null> {
  return input.cache.updatePart(input.partId, (part) => {
    const locations = [...part.locations];
    const index = locations.findIndex((location) => location.storageId === input.storageId);
    if (index === -1) {
      if (input.delta <= 0) {
        return part;
      }
      locations.push({
        storageId: input.storageId,
        name: "Pending storage",
        quantity: input.delta
      });
    } else {
      const nextQuantity = Math.max(0, locations[index].quantity + input.delta);
      if (nextQuantity === 0) {
        locations.splice(index, 1);
      } else {
        locations[index] = { ...locations[index], quantity: nextQuantity };
      }
    }

    return {
      ...part,
      locations,
      totalStock: locations.reduce((sum, location) => sum + location.quantity, 0),
      syncStatus: "pending",
      syncError: null
    };
  });
}

async function markStockPushComplete(cache: LibraryCache, partId: string): Promise<void> {
  await cache.updatePart(partId, (part) => ({
    ...part,
    syncStatus: undefined,
    syncError: null
  }));
}

async function markStockPushFailed(cache: LibraryCache, partId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await cache.updatePart(partId, (part) => ({
    ...part,
    syncStatus: "failed",
    syncError: message
  }));
}

function buildCategoryMatch(category: CategoryId): CategoryMatch {
  return { category, categoryLabel: categoryLabel(category), section: sectionForCategory(category) };
}

function storageNameMapFromSnapshot(snapshot: ReturnType<LibraryCache["getSnapshot"]>): Map<string, string> {
  const storageNames = new Map<string, string>();
  for (const part of snapshot.parts) {
    for (const location of part.locations) {
      if (!storageNames.has(location.storageId)) {
        storageNames.set(location.storageId, location.name);
      }
    }
  }
  return storageNames;
}

async function refreshSinglePartInCache(input: {
  cache: LibraryCache;
  client: PartsBoxApiClient;
  partId: string;
  tags: string[];
  fallbackDescription: string;
  overrides?: OverrideStore;
}): Promise<ParsedPassive> {
  const [part, sources] = await Promise.all([
    input.client.getPart(input.partId),
    input.client.getPartStorageSources(input.partId)
  ]);

  const storageNames = storageNameMapFromSnapshot(input.cache.getSnapshot());
  const cachedPart = input.cache.getSnapshot().parts.find((p) => p.partId === input.partId);
  const price = cachedPart?.price ?? null;
  const currency = cachedPart?.currency ?? null;

  const rawPart: RawPart = {
    partId: part.partId,
    partType: "local",
    name: part.pn,
    mpn: part.pn,
    manufacturer: null,
    description: part.description || input.fallbackDescription,
    footprint: "",
    tags: input.tags,
    notes: part.notes,
    defaultStorageId: part.defaultStorageId
  };

  const override = input.overrides ? (await input.overrides.getAll())[input.partId] : undefined;
  const extracted = extract(rawPart, override);
  const category = inferPartCategory(rawPart, extracted.type);
  const locations = sources.map((source) => ({
    storageId: source.storageId,
    name: storageNames.get(source.storageId) ?? source.storageId,
    quantity: source.quantity
  }));
  const defaultStorageId = part.defaultStorageId;
  const defaultStorageName = defaultStorageId ? (storageNames.get(defaultStorageId) ?? defaultStorageId) : null;

  const finalPrice = extracted.price !== null && extracted.price !== undefined ? extracted.price : price;
  const finalCurrency = extracted.currency !== null && extracted.currency !== undefined ? extracted.currency : currency;

  const updated: ParsedPassive = {
    ...extracted,
    locations,
    totalStock: locations.reduce((sum, location) => sum + location.quantity, 0),
    tags: input.tags,
    category: category.category,
    categoryLabel: category.categoryLabel,
    section: category.section,
    notes: part.notes,
    defaultStorageId,
    defaultStorageName,
    price: finalPrice,
    currency: finalCurrency
  };

  await input.cache.addOrReplacePart(updated);
  return updated;
}

export function registerMobileRoutes(server: FastifyInstance, deps: MobileRouteDeps): void {
  const storageCache = makeStorageCache(deps.client);
  const getCachedStorageList = storageCache.get;

  server.get("/api/mobile/sections", async () => {
    return { sections: buildSections(deps.cache.getSnapshot().parts) };
  });

  server.get("/api/mobile/history", async (request, reply) => {
    if (!deps.history) {
      return { history: [] };
    }
    return { history: deps.history.getLatest() };
  });

  server.get("/api/mobile/storage", async () => {
    const storage = await getCachedStorageList();
    return {
      storage: serializeStorage(storage)
    };
  });

  server.post("/api/mobile/storage", async (request, reply) => {
    const parsed = mobileCreateStorageSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid storage", details: parsed.error.flatten() });
    }
    try {
      const created = await deps.client.createStorage({ name: parsed.data.name });
      storageCache.invalidate();
      return { id: created.id, storageId: created.id, name: created.name, label: created.name };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      server.log.error({ err: error, name: parsed.data.name }, "failed to create storage location");
      return reply.status(502).send({ error: "failed to create storage location", details: message });
    }
  });

  server.delete("/api/mobile/storage/:id", async (request, reply) => {
    const idResult = compactPartIdSchema.safeParse((request.params as { id: string }).id);
    if (!idResult.success) {
      return reply.status(400).send({ error: "invalid storage id" });
    }
    const storageId = idResult.data;
    try {
      const parts = await deps.client.getStorageParts(storageId);
      if (parts.some((part) => part.quantity > 0)) {
        return reply.status(409).send({
          error: "storage location not empty",
          details: "Remove or move its stock before deleting."
        });
      }
      await deps.client.archiveStorage(storageId);
      storageCache.invalidate();
      return { ok: true, storageId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      server.log.error({ err: error, storageId }, "failed to archive storage location");
      return reply.status(502).send({ error: "failed to remove storage location", details: message });
    }
  });

  server.get("/api/mobile/storage/:id/parts", async (request, reply) => {
    const idResult = compactPartIdSchema.safeParse((request.params as { id: string }).id);
    if (!idResult.success) {
      return reply.status(400).send({ error: "invalid storage id" });
    }
    const storageId = idResult.data;
    const snapshot = deps.cache.getSnapshot();
    const parts = snapshot.parts.filter((part) =>
      part.locations.some((loc) => loc.storageId === storageId)
    );

    const sorted = parts.sort(compareCategorizedRows);

    return {
      storageId,
      parts: sorted.map(toRow)
    };
  });

  server.get("/api/mobile/storage/:id/label.png", async (request, reply) => {
    const idResult = compactPartIdSchema.safeParse((request.params as { id: string }).id);
    if (!idResult.success) {
      return reply.status(400).send({ error: "invalid storage id" });
    }
    const storageId = idResult.data;

    const query = request.query as { paper?: string; text?: string };
    const paperSize = query.paper === undefined ? DEFAULT_LABEL_PAPER_SIZE : parseLabelPaperSize(query.paper);
    if (paperSize === null) {
      return reply.status(400).send({ error: "invalid label paper size" });
    }

    let name = query.text?.trim();
    if (!name) {
      const storageList = await getCachedStorageList();
      name = storageList.get(storageId) || storageId;
    }

    try {
      const png = await renderStorageLabelPng(storageId, name, { paperSize });
      return reply.type("image/png").send(png);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      server.log.error({ err: error, storageId }, "storage label render failed");
      return reply.status(500).send({ error: "label render failed", details: message });
    }
  });

  server.get("/api/mobile/parts", async (request, reply) => {
    const parsed = z
      .object({
        section: mobileSectionSchema
      })
      .strict()
      .safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid section", details: parsed.error.flatten() });
    }
    const snapshot = deps.cache.getSnapshot();
    const section = parsed.data.section;
    if (section === "manage") {
      return reply.status(400).send({ error: "manage is not a parts section" });
    }

    const parts = snapshot.parts.filter((part) => sectionFromPart(part) === section);
    const sorted = section === "resistor" || section === "capacitor" || section === "inductor" ? parts.sort(comparePassiveRows) : parts.sort(compareCategorizedRows);

    return {
      section,
      parts: sorted.map(toRow)
    };
  });

  server.get("/api/mobile/uncategorized", async () => {
    const snapshot = deps.cache.getSnapshot();
    const parts = snapshot.parts.filter((part) => resolveCategory(part).category === "uncategorized");
    
    let totalStockValue = 0;
    for (const part of snapshot.parts) {
      if (part.price && part.totalStock && part.totalStock > 0) {
        totalStockValue += part.price * part.totalStock;
      }
    }
    
    return {
      parts: parts.sort(compareCategorizedRows).map(toRow),
      totalStockValue
    };
  });

  server.get("/api/mobile/part/:id", async (request, reply) => {
    const idResult = compactPartIdSchema.safeParse((request.params as { id: string }).id);
    if (!idResult.success) {
      return reply.status(400).send({ error: "invalid part id" });
    }
    const partId = idResult.data;
    let part = deps.cache.getPart(partId);
    if (!part) {
      const remoteId = deps.cache.getRemoteIdForLocal(partId);
      if (remoteId) {
        part = deps.cache.getPart(remoteId);
      }
    }
    if (!part) {
      return reply.status(404).send({ error: "not found" });
    }
    return toDetail(part);
  });

  server.get("/api/mobile/part/:id/label.png", async (request, reply) => {
    const idResult = compactPartIdSchema.safeParse((request.params as { id: string }).id);
    if (!idResult.success) {
      return reply.status(400).send({ error: "invalid part id" });
    }
    const query = request.query as { paper?: string | undefined };
    const paperSize = query.paper === undefined ? DEFAULT_LABEL_PAPER_SIZE : parseLabelPaperSize(query.paper);
    if (paperSize === null) {
      return reply.status(400).send({ error: "invalid label paper size" });
    }
    const part = deps.cache.getPart(idResult.data);
    if (!part) {
      return reply.status(404).send({ error: "not found" });
    }

    try {
      const png = await renderLabelPng(
        { partId: part.partId, pn: part.pn, description: part.rawDescription },
        { paperSize }
      );
      return reply.type("image/png").send(png);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      server.log.error({ err: error, partId: part.partId }, "label render failed");
      return reply.status(500).send({ error: "label render failed", details: message });
    }
  });

  server.delete("/api/mobile/part/:id", async (request, reply) => {
    const idResult = compactPartIdSchema.safeParse((request.params as { id: string }).id);
    if (!idResult.success) {
      return reply.status(400).send({ error: "invalid part id" });
    }

    const partId = idResult.data;
    const part = deps.cache.getPart(partId);
    if (!part) {
      return reply.status(404).send({ error: "not found" });
    }

    await deps.cache.removePart(partId);
    if (deps.history && part) {
      await deps.history.addEntry({
        type: "delete-part",
        partId,
        partName: part.pn,
        status: "completed",
        note: `Deleted part '${part.pn}'`
      });
    }
    if (!partId.startsWith("local")) {
      void deps.client
        .deletePart({ partId })
        .then(() => {
          server.log.info({ partId }, "deleted PartsBox part");
        })
        .catch((error) => {
          server.log.error({ err: error, partId }, "failed to delete PartsBox part");
        });
    }

    return {
      ok: true,
      partId,
      sync: cachedSyncMetadata(deps.cache.getSnapshot())
    };
  });

  server.post("/api/mobile/part/:id/category", async (request, reply) => {
    const idResult = compactPartIdSchema.safeParse((request.params as { id: string }).id);
    if (!idResult.success) {
      return reply.status(400).send({ error: "invalid part id" });
    }

    const parsedBody = mobileCategoryUpdateSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid category update", details: parsedBody.error.flatten() });
    }

    const partId = idResult.data;
    const part = deps.cache.getPart(partId);
    if (!part) {
      return reply.status(404).send({ error: "not found" });
    }

    const tags = stripCategoryTags(normalizeTags(part.tags));
    const tag = categoryTag(parsedBody.data.category);
    if (tag) {
      tags.push(tag);
    }
    if (parsedBody.data.tag) {
      tags.push(parsedBody.data.tag);
    }

    const updated = await deps.cache.updatePart(partId, (current) => {
      const rawPart = rawPartFromCache({ ...current, tags });
      const category = inferPartCategory(rawPart, current.type);
      return {
        ...current,
        tags: uniqueStrings(tags),
        category: category.category,
        categoryLabel: category.categoryLabel,
        section: category.section
      };
    });

    if (deps.history && part) {
      await deps.history.addEntry({
        type: "category-change",
        partId,
        partName: part.pn,
        status: "completed",
        note: `Changed category of '${part.pn}' to '${parsedBody.data.category}'`
      });
    }

    void deps.client
      .updatePartTags({ partId, tags: uniqueStrings(tags) })
      .then(() => deps.sync.sync())
      .catch((error) => {
        server.log.error({ err: error, partId }, "failed to push category update to PartsBox");
      });

    return {
      part: updated ? toDetail(updated) : null,
      sync: cachedSyncMetadata(deps.cache.getSnapshot())
    };
  });

  server.post("/api/mobile/part/:id/pull-details", async (request, reply) => {
    const idResult = compactPartIdSchema.safeParse((request.params as { id: string }).id);
    if (!idResult.success) {
      return reply.status(400).send({ error: "invalid part id" });
    }

    const partId = idResult.data;
    const currentPart = deps.cache.getPart(partId);
    if (!currentPart) {
      return reply.status(404).send({ error: "not found" });
    }

    if (!deps.digikeyEnricher || !deps.digikeyEnricher.isEnabled()) {
      return reply.status(400).send({ error: "DigiKey is not configured." });
    }

    const isAuth = await deps.digikeyEnricher.isAuthenticated();
    if (!isAuth) {
      return reply.status(400).send({ error: "DigiKey authentication is required. Set up credentials and authenticate first." });
    }

    if (!deps.enricher) {
      return reply.status(400).send({ error: "Enricher is not configured." });
    }

    const parsed = parseScanLabel(currentPart.pn);
    const enrichment = await deps.enricher.enrich({ raw: currentPart.pn, parsed }).catch(() => null);
    if (!enrichment) {
      return reply.status(404).send({ error: `No details found on DigiKey for part number: ${currentPart.pn}` });
    }

    const nexarCategory = categoryFromNexar(enrichment.categoryName);
    const category = nexarCategory
      ? buildCategoryMatch(nexarCategory)
      : inferPartCategory(
          {
            partId,
            partType: "local",
            name: enrichment.name ?? currentPart.pn,
            mpn: enrichment.name ?? currentPart.pn,
            manufacturer: null,
            description: [enrichment.description, enrichment.categoryName, currentPart.rawDescription].filter(Boolean).join(" "),
            footprint: "",
            tags: currentPart.tags ?? []
          },
          "unknown"
        );
    const categoryTagValue = categoryTag(category.category);
    const tags = uniqueStrings([
      ...normalizeTags(currentPart.tags),
      ...(enrichment.tags ?? [])
    ]);
    const finalTags = stripCategoryTags(tags);
    if (categoryTagValue) {
      finalTags.push(categoryTagValue);
    }

    const finalDescription = enrichment.description || currentPart.rawDescription;
    const finalNotes = enrichment.notes || "";

    if (deps.overrides && enrichment.price !== undefined) {
      const allOverrides = await deps.overrides.getAll();
      const existing = allOverrides[partId] ?? {};
      await deps.overrides.set(partId, {
        ...existing,
        price: enrichment.price,
        currency: enrichment.currency || "USD"
      });
    }

    await deps.client.updatePartDetails({
      partId,
      description: finalDescription,
      notes: finalNotes,
      tags: uniqueStrings(finalTags)
    });

    const updated = await refreshSinglePartInCache({
      cache: deps.cache,
      client: deps.client,
      partId,
      tags: uniqueStrings(finalTags),
      fallbackDescription: finalDescription,
      overrides: deps.overrides
    });

    return {
      part: toDetail(updated),
      sync: refreshedPartMetadata(deps.cache.getSnapshot())
    };
  });

  server.post("/api/mobile/part/:id/stock-adjust", async (request, reply) => {
    const idResult = compactPartIdSchema.safeParse((request.params as { id: string }).id);
    if (!idResult.success) {
      return reply.status(400).send({ error: "invalid part id" });
    }

    const parsedBody = mobileAdjustSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid stock adjustment", details: parsedBody.error.flatten() });
    }

    const partId = idResult.data;
    const { storageId, delta, note } = parsedBody.data;
    const currentPart = deps.cache.getPart(partId);
    if (!currentPart) {
      return reply.status(404).send({ error: "not found" });
    }

    if (delta > 0) {
      const updated = await updateCachedStock({ cache: deps.cache, partId, storageId, delta });
      let historyEntryId = "";
      if (deps.history) {
        const entry = await deps.history.addEntry({
          type: "stock-adjust",
          partId,
          partName: currentPart.pn,
          storageId,
          quantity: delta,
          note,
          status: "pending"
        });
        historyEntryId = entry.id;
      }
      void deps.client
        .addStock({ partId, storageId, quantity: delta, note })
        .then(async () => {
          markStockPushComplete(deps.cache, partId);
          if (deps.history && historyEntryId) {
            await deps.history.updateEntry(historyEntryId, () => ({ status: "completed" }));
          }
        })
        .catch(async (error) => {
          server.log.error({ err: error, partId, storageId, delta }, "failed to push stock addition to PartsBox");
          markStockPushFailed(deps.cache, partId, error);
          if (deps.history && historyEntryId) {
            const msg = error instanceof Error ? error.message : String(error);
            await deps.history.updateEntry(historyEntryId, () => ({ status: "failed", error: msg }));
          }
        });

      return {
        part: updated ? toDetail(updated) : null,
        sync: cachedSyncMetadata(deps.cache.getSnapshot())
      };
    } else {
      const quantity = Math.abs(delta);
      const storageLots = (await deps.client.getPartLots(partId)).filter((lot) => lot.storageId === storageId && lot.quantity > 0);
      const lotControlled = storageLots.filter((lot) => lot.lotId != null);
      if (lotControlled.length > 1) {
        return reply.status(409).send({
          error: "multiple lots in storage location",
          details: "Choose a specific lot before removing stock from this location."
        });
      }
      const lot = lotControlled[0];
      if (lot && lot.quantity < quantity) {
        return reply.status(400).send({ error: "not enough stock in selected lot" });
      }
      const currentLocation = currentPart.locations.find((location) => location.storageId === storageId);
      if (!currentLocation || currentLocation.quantity < quantity) {
        return reply.status(400).send({ error: "not enough stock in selected location" });
      }
      const updated = await updateCachedStock({ cache: deps.cache, partId, storageId, delta });
      let historyEntryId = "";
      if (deps.history) {
        const entry = await deps.history.addEntry({
          type: "stock-adjust",
          partId,
          partName: currentPart.pn,
          storageId,
          quantity: delta,
          note,
          status: "pending"
        });
        historyEntryId = entry.id;
      }
      void deps.client
        .removeStock({ partId, storageId, ...(lot?.lotId ? { lotId: lot.lotId } : {}), quantity, note })
        .then(async () => {
          markStockPushComplete(deps.cache, partId);
          if (deps.history && historyEntryId) {
            await deps.history.updateEntry(historyEntryId, () => ({ status: "completed" }));
          }
        })
        .catch(async (error) => {
          server.log.error({ err: error, partId, storageId, delta }, "failed to push stock removal to PartsBox");
          markStockPushFailed(deps.cache, partId, error);
          if (deps.history && historyEntryId) {
            const msg = error instanceof Error ? error.message : String(error);
            await deps.history.updateEntry(historyEntryId, () => ({ status: "failed", error: msg }));
          }
        });

      return {
        part: updated ? toDetail(updated) : null,
        sync: cachedSyncMetadata(deps.cache.getSnapshot())
      };
    }
  });

  server.post("/api/mobile/scan/parse", async (request, reply) => {
    const parsedBody = mobileScanParseSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid scan payload", details: parsedBody.error.flatten() });
    }

    return { parsed: parseScanLabel(parsedBody.data.raw) };
  });

  server.post("/api/mobile/scan/enrich", async (request, reply) => {
    const parsedBody = mobileScanParseSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid scan payload", details: parsedBody.error.flatten() });
    }

    const raw = parsedBody.data.raw;
    const parsed = parseScanLabel(raw);
    const enrichment = deps.enricher ? await deps.enricher.enrich({ raw, parsed }).catch(() => null) : null;

    const name = enrichment?.name ?? parsed.manufacturerPartNumber ?? parsed.supplierPartNumber ?? null;
    const description = enrichment?.description ?? fallbackScanDescription(parsed);
    const nexarCategory = categoryFromNexar(enrichment?.categoryName);
    const match = nexarCategory
      ? buildCategoryMatch(nexarCategory)
      : inferPartCategory(
          {
            partId: "a".repeat(26),
            partType: "local",
            name: name ?? "",
            mpn: name ?? "",
            manufacturer: null,
            description: [enrichment?.description, enrichment?.categoryName, description].filter(Boolean).join(" "),
            footprint: "",
            tags: enrichment?.tags ?? []
          },
          "unknown"
        );

    const desc = parseDescription(description, name ?? "", enrichment?.tags ?? []);
    const notesSpecs = parseNotes(enrichment?.notes);
    const value = desc.valueNorm != null ? formatValue(desc.valueNorm, desc.type) : null;

    const toleranceKey = Object.keys(notesSpecs.specs).find(k => k.includes("tolerance"));
    const toleranceVal = toleranceKey ? notesSpecs.specs[toleranceKey] : null;
    const tolerance = desc.tolerance ?? toleranceVal;

    const voltageKey = Object.keys(notesSpecs.specs).find(k => k.includes("voltage"));
    const voltageVal = voltageKey ? notesSpecs.specs[voltageKey] : null;
    const voltage = desc.voltage ?? voltageVal;

    const packageKey = Object.keys(notesSpecs.specs).find(k => k.includes("package"));
    const packageVal = packageKey ? notesSpecs.specs[packageKey] : null;
    const pkg = desc.package ?? packageVal;

    return {
      parsed,
      name,
      description,
      category: match.category,
      categoryLabel: match.categoryLabel,
      section: match.section,
      sectionLabel: sectionLabel(match.section),
      value,
      tolerance,
      voltage,
      package: pkg,
      manufacturer: notesSpecs.manufacturer ?? null,
      datasheetUrl: notesSpecs.datasheetUrl ?? null
    };
  });

  server.post("/api/mobile/scan/resolve", async (request, reply) => {
    const parsedBody = mobileScanParseSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid scan payload", details: parsedBody.error.flatten() });
    }

    const raw = parsedBody.data.raw;
    const parsed = parseScanLabel(raw);
    const part = findScannedPart(deps.cache.getSnapshot().parts, parsed, raw);
    const storage = await getStorageListSafely({ ...deps.client, getStorageList: getCachedStorageList } as PartsBoxApiClient);

    return {
      parsed,
      part: part ? toDetail(part) : null,
      storage: serializeStorage(storage)
    };
  });

  server.post("/api/mobile/scan/confirm", async (request, reply) => {
    const parsedBody = mobileScanConfirmSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid scan confirmation", details: parsedBody.error.flatten() });
    }

    const {
      raw,
      storageId,
      description,
      quantity,
      value,
      tolerance,
      voltage,
      package: pkg,
      manufacturer,
      datasheetUrl
    } = parsedBody.data;
    const parsed = parseScanLabel(raw);
    const finalDescription = description ?? fallbackScanDescription(parsed);
    let refreshTags: string[] = [];
    let refreshDescription = finalDescription;

    let enrichment: ScanEnrichment | null = null;
    let partId = parsed.resolvedPartId;
    if (!partId) {
      if (deps.enricher) {
        enrichment = await deps.enricher.enrich({ raw, parsed }).catch(() => null);
      }

      const name = parsedBody.data.name ?? enrichment?.name ?? parsed.manufacturerPartNumber ?? parsed.supplierPartNumber;
      if (!name) {
        return reply.status(400).send({ error: "scan confirmation requires a name or parsed part number", parsed });
      }

      const tags = uniqueStrings([
        ...baseScanTags(parsed),
        ...(enrichment?.tags ?? [])
      ]);
      const requestedCategory = parsedBody.data.category;
      const nexarCategory = categoryFromNexar(enrichment?.categoryName);
      const category = requestedCategory
        ? buildCategoryMatch(requestedCategory)
        : nexarCategory
          ? buildCategoryMatch(nexarCategory)
          : inferPartCategory(
              {
                partId: "a".repeat(26),
                partType: "local",
                name,
                mpn: name,
                manufacturer: manufacturer ?? null,
                description: [enrichment?.description, enrichment?.categoryName, finalDescription].filter(Boolean).join(" "),
                footprint: "",
                tags
              },
              "unknown"
            );
      const categoryTagValue = categoryTag(category.category);
      const finalTags = stripCategoryTags(tags);
      if (categoryTagValue) {
        finalTags.push(categoryTagValue);
      }
      if (parsedBody.data.tag) {
        finalTags.push(parsedBody.data.tag);
      }

      const createdDescription = parsedBody.data.description ?? enrichment?.description ?? (finalDescription.trim() ? finalDescription : undefined);
      
      let finalNotes = "";
      if (value || tolerance || voltage || pkg || manufacturer || datasheetUrl) {
        const notesParts = [
          manufacturer ? `Manufacturer: ${manufacturer}` : null,
          datasheetUrl ? `Datasheet: [PDF Link](${datasheetUrl})` : null
        ];
        finalNotes = notesParts.filter((v): v is string => v != null).join("\n");
        const specs: Array<{ name: string; value: string }> = [];
        if (value) specs.push({ name: "Value", value });
        if (tolerance) specs.push({ name: "Tolerance", value: tolerance });
        if (voltage) specs.push({ name: "Voltage", value: voltage });
        if (pkg) specs.push({ name: "Package", value: pkg });
        if (specs.length > 0) {
          const tableHeader = "\n\n### Technical Specifications\n| Specification | Value |\n| --- | --- |\n";
          const tableRows = specs.map((s) => `| ${s.name} | ${s.value} |`).join("\n");
          finalNotes += tableHeader + tableRows;
        }
      } else if (enrichment?.notes) {
        finalNotes = enrichment.notes;
      }

      const createInput = {
        name,
        description: createdDescription,
        tags: uniqueStrings(finalTags),
        ...(finalNotes ? { notes: finalNotes } : {})
      };
      refreshTags = createInput.tags;
      refreshDescription = createdDescription ?? finalDescription;

      if (deps.pendingSync) {
        const localPartId = makeLocalPartId();
        const storageNames = storageId ? await getCachedStorageList().catch(() => new Map<string, string>()) : new Map<string, string>();
        const localPart = buildPendingPart({
          localPartId,
          name,
          description: createdDescription ?? finalDescription,
          tags: uniqueStrings(finalTags),
          category,
          storageId,
          storageName: storageId ? storageNames.get(storageId) : undefined,
          quantity,
          value,
          tolerance,
          voltage,
          package: pkg,
          manufacturer,
          datasheetUrl,
          notes: finalNotes,
          price: enrichment?.price,
          currency: enrichment?.currency
        });
        await deps.cache.addOrReplacePart(localPart);
        await deps.pendingSync.enqueueCreatePart({
          localPartId,
          create: createInput,
          ...(storageId ? { defaultStorageId: storageId } : {}),
          ...(storageId && quantity
            ? {
                stock: {
                  storageId,
                  quantity,
                  note: `Scanned ${parsed.vendor === "unknown" ? "label" : parsed.vendor.toUpperCase()}${parsed.supplierPartNumber ? ` ${parsed.supplierPartNumber}` : ""}`,
                  ...(enrichment?.price !== undefined ? { price: enrichment.price, currency: enrichment.currency || "USD" } : {})
                }
              }
            : {})
        });
        if (deps.history) {
          await deps.history.addEntry({
            type: "create-part",
            partId: localPartId,
            partName: name,
            storageId,
            storageName: storageId ? storageNames.get(storageId) : undefined,
            quantity,
            note: `Create pending part from scan: '${name}'`,
            status: "pending"
          });
        }
        server.log.info(
          { localPartId, name, storageId, quantity, status: "local-pending" },
          "created local pending part; queued PartsBox sync"
        );
        void deps.pendingSync.flush().catch((error) => {
          server.log.error({ err: error, localPartId }, "failed to flush pending scan-created part");
        });
        return {
          partId: localPartId,
          parsed,
          sync: pendingSyncMetadata(deps.cache.getSnapshot())
        };
      }

      const created = await deps.client.createLocalPart(createInput);

      partId = created.partId;
      if (deps.history) {
        await deps.history.addEntry({
          type: "create-part",
          partId,
          partName: name,
          storageId,
          quantity,
          note: `Created part directly on PartsBox: '${name}'`,
          status: "completed"
        });
      }
      server.log.info({ partId, name, storageId, quantity, status: "partsbox-created" }, "created PartsBox part from scan");

      if (storageId && typeof deps.client.updatePartDefaultStorage === "function") {
        void deps.client.updatePartDefaultStorage({ partId, storageId }).catch((error) => {
          server.log.warn({ err: error, partId, storageId }, "failed to set default storage after scan-created part");
        });
      }
    } else {
      const cachedPart = deps.cache.getPart(partId);
      refreshTags = cachedPart?.tags ?? [];
      refreshDescription = cachedPart?.rawDescription ?? finalDescription;
    }

    if (deps.overrides && enrichment?.price !== undefined) {
      const allOverrides = await deps.overrides.getAll();
      const existing = allOverrides[partId] ?? {};
      await deps.overrides.set(partId, {
        ...existing,
        price: enrichment.price,
        currency: enrichment.currency || "USD"
      });
    }

    if (storageId && quantity) {
      const vendorLabel = parsed.vendor === "unknown" ? "label" : parsed.vendor.toUpperCase();
      const supplierSuffix = parsed.supplierPartNumber ? ` ${parsed.supplierPartNumber}` : "";
      const addNote = `Scanned ${vendorLabel}${supplierSuffix}`;
      
      if (deps.history) {
        const cachedPart = deps.cache.getPart(partId);
        await deps.history.addEntry({
          type: "stock-adjust",
          partId,
          partName: cachedPart?.pn || name || "Unknown Part",
          storageId,
          quantity,
          note: addNote,
          status: "completed"
        });
      }
      
      await deps.client.addStock({
        partId,
        storageId,
        quantity,
        note: addNote,
        ...(enrichment?.price !== undefined ? { price: enrichment.price, currency: enrichment.currency || "USD" } : {})
      });
    }

    await refreshSinglePartInCache({
      cache: deps.cache,
      client: deps.client,
      partId,
      tags: refreshTags,
      fallbackDescription: refreshDescription,
      overrides: deps.overrides
    });
    return {
      partId,
      parsed,
      sync: refreshedPartMetadata(deps.cache.getSnapshot())
    };
  });
}
