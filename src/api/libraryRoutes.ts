// src/api/libraryRoutes.ts
import type { FastifyInstance } from "fastify";
import { compactPartIdSchema } from "../domain/labelRecord.js";
import {
  overrideInputSchema,
  type OverrideInput,
  type OverrideRecord,
  type PassiveType
} from "../domain/passive.js";
import type { LibraryCache } from "../cache/libraryCache.js";
import type { OverrideStore } from "../overrides/overrideStore.js";
import type { SyncService } from "../sync/syncService.js";
import type { PendingSyncService } from "../sync/pendingSyncService.js";
import { formatValue, siMultiplier } from "../parser/units.js";

export interface LibraryRouteDeps {
  cache: LibraryCache;
  overrides: OverrideStore;
  sync: SyncService;
  pendingSync?: PendingSyncService;
}

const VALUE_RE = /^(\d+(?:\.\d+)?)\s*([pnµumkKMG]?)$/;

/** Parse a user value string like "4.7k" into normalized value for a given type. */
export function parseUserValue(raw: string, type: PassiveType): { valueNorm: number; valueDisplay: string } | null {
  const m = VALUE_RE.exec(raw.trim());
  if (!m) return null;
  const mult = siMultiplier(m[2]);
  if (mult == null) return null;
  const valueNorm = Number(m[1]) * mult;
  return { valueNorm, valueDisplay: formatValue(valueNorm, type) };
}

export function overrideFromInput(input: OverrideInput): OverrideRecord | null {
  const record: OverrideRecord = {};
  if (input.type) record.type = input.type;
  if (input.tolerance) record.tolerance = input.tolerance;
  if (input.voltage) record.voltage = input.voltage;
  if (input.package) record.package = input.package;
  if (input.value) {
    const parsed = parseUserValue(input.value, input.type ?? "resistor");
    if (!parsed) return null;
    record.valueNorm = parsed.valueNorm;
    record.valueDisplay = parsed.valueDisplay;
  }
  return record;
}

export function registerLibraryRoutes(server: FastifyInstance, deps: LibraryRouteDeps): void {
  server.get("/api/meta", async () => {
    const snap = deps.cache.getSnapshot();
    const counts: Record<string, number> = { resistor: 0, capacitor: 0, inductor: 0 };
    for (const p of snap.parts) if (p.type in counts && (p.confidence === "high" || p.confidence === "medium")) counts[p.type] += 1;
    return { counts, reviewCount: deps.cache.getReview().length, lastSyncedAt: snap.lastSyncedAt, error: snap.error };
  });

  server.get("/api/library", async (request, reply) => {
    const type = (request.query as { type?: string }).type as PassiveType | undefined;
    if (type !== "resistor" && type !== "capacitor" && type !== "inductor") {
      return reply.status(400).send({ error: "type must be resistor, capacitor, or inductor" });
    }
    return { parts: deps.cache.getByType(type), filters: deps.cache.filtersFor(type) };
  });

  server.get("/api/review", async () => ({ parts: deps.cache.getReview() }));

  server.get("/api/part/:id", async (request, reply) => {
    const idResult = compactPartIdSchema.safeParse((request.params as { id: string }).id);
    if (!idResult.success) return reply.status(400).send({ error: "invalid part id" });
    const part = deps.cache.getPart(idResult.data);
    if (!part) return reply.status(404).send({ error: "not found" });
    return part;
  });

  server.put("/api/part/:id/override", async (request, reply) => {
    const idResult = compactPartIdSchema.safeParse((request.params as { id: string }).id);
    if (!idResult.success) return reply.status(400).send({ error: "invalid part id" });
    const input = overrideInputSchema.safeParse(request.body);
    if (!input.success) return reply.status(400).send({ error: "invalid override", details: input.error.flatten() });
    const record = overrideFromInput(input.data);
    if (!record) return reply.status(400).send({ error: "could not parse value" });
    await deps.overrides.set(idResult.data, record);
    await deps.sync.sync();
    return { ok: true, override: record };
  });

  server.delete("/api/part/:id/override", async (request, reply) => {
    const idResult = compactPartIdSchema.safeParse((request.params as { id: string }).id);
    if (!idResult.success) return reply.status(400).send({ error: "invalid part id" });
    await deps.overrides.remove(idResult.data);
    await deps.sync.sync();
    return { ok: true };
  });

  server.post("/api/sync", async () => {
    await deps.pendingSync?.flush();
    const snap = await deps.sync.sync();
    return { lastSyncedAt: snap.lastSyncedAt, error: snap.error, count: snap.parts.length, pending: deps.pendingSync?.list() ?? [] };
  });

  server.get("/api/sync/status", async () => {
    const snap = deps.cache.getSnapshot();
    return {
      lastSyncedAt: snap.lastSyncedAt,
      error: snap.error,
      count: snap.parts.length,
      pending: deps.pendingSync?.list() ?? []
    };
  });
}
