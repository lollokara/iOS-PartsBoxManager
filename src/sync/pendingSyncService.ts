import type { LibraryCache } from "../cache/libraryCache.js";
import { categoryTag, inferPartCategory, stripCategoryTags } from "../domain/category.js";
import type { PartsBoxApiClient } from "../partsbox/apiClient.js";
import type { SyncService } from "./syncService.js";
import { PendingMutationStore, type PendingCreatePartMutation, type PendingCreatePartInput } from "./pendingMutationStore.js";
import type { HistoryStore } from "./historyStore.js";

export interface PendingSyncDeps {
  store: PendingMutationStore;
  client: Pick<PartsBoxApiClient, "createLocalPart" | "updatePartDefaultStorage" | "addStock">;
  cache: LibraryCache;
  sync: Pick<SyncService, "sync">;
  history?: HistoryStore;
  logger?: {
    info: (value: unknown, message?: string) => void;
    warn: (value: unknown, message?: string) => void;
  };
}

export class PendingSyncService {
  private running: Promise<void> | null = null;

  constructor(private readonly deps: PendingSyncDeps) {}

  async enqueueCreatePart(input: PendingCreatePartInput): Promise<PendingCreatePartMutation> {
    return this.deps.store.enqueueCreatePart(input);
  }

  list(): PendingCreatePartMutation[] {
    return this.deps.store.list().filter((mutation): mutation is PendingCreatePartMutation => mutation.type === "create-part");
  }

  async flush(): Promise<void> {
    if (this.running) {
      return this.running;
    }
    this.running = this.flushNow().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async flushNow(): Promise<void> {
    for (const mutation of this.deps.store.list()) {
      if (mutation.type !== "create-part") continue;
      await this.processCreatePart(mutation);
    }
  }

  private async processCreatePart(mutation: PendingCreatePartMutation): Promise<void> {
    let current = mutation;
    try {
      current = (await this.deps.store.update(mutation.id, (entry) => ({
        ...entry,
        status: "syncing",
        attempts: entry.attempts + 1,
        lastError: undefined
      }))) as PendingCreatePartMutation;

      let remotePartId = current.remotePartId;
      if (!remotePartId) {
        const created = await this.deps.client.createLocalPart(normalizePendingCreateInput(current.create));
        remotePartId = created.partId;
        current = (await this.deps.store.update(current.id, (entry) => ({
          ...entry,
          remotePartId
        }))) as PendingCreatePartMutation;
      }

      if (current.defaultStorageId && !current.defaultStorageApplied) {
        await this.deps.client.updatePartDefaultStorage({ partId: remotePartId, storageId: current.defaultStorageId });
        current = (await this.deps.store.update(current.id, (entry) => ({
          ...entry,
          defaultStorageApplied: true
        }))) as PendingCreatePartMutation;
      }

      if (current.stock && !current.stockApplied) {
        await this.deps.client.addStock({ partId: remotePartId, ...current.stock });
        current = (await this.deps.store.update(current.id, (entry) => ({
          ...entry,
          stockApplied: true
        }))) as PendingCreatePartMutation;
      }

      const snapshot = await this.deps.sync.sync();
      if (snapshot.error) {
        throw new Error(snapshot.error);
      }
      await this.deps.cache.removePart(current.localPartId);
      this.deps.cache.recordSyncedPart(current.localPartId, remotePartId);
      await this.deps.store.remove(current.id);
      this.deps.logger?.info({ mutationId: current.id, localPartId: current.localPartId, remotePartId }, "pending part synced");

      if (this.deps.history) {
        await this.deps.history.updateEntryByPartIdAndType(current.localPartId, "create-part", () => ({
          status: "completed",
          partId: remotePartId
        }));
        await this.deps.history.addEntry({
          type: "sync-local-to-cloud",
          partId: remotePartId,
          partName: current.create.name,
          status: "completed",
          note: `Moved part from local to cloud: '${current.create.name}'`
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.deps.cache.updatePart(mutation.localPartId, (part) => ({ ...part, syncStatus: "failed", syncError: message }));
      await this.deps.store.update(mutation.id, (entry) => ({
        ...entry,
        status: "failed",
        lastError: message
      }));
      this.deps.logger?.warn({ mutationId: mutation.id, localPartId: mutation.localPartId, error: message }, "pending part sync failed");

      if (this.deps.history) {
        await this.deps.history.updateEntryByPartIdAndType(mutation.localPartId, "create-part", () => ({
          status: "failed",
          error: message
        }));
      }
    }
  }
}

function normalizePendingCreateInput(input: PendingCreatePartInput["create"]): PendingCreatePartInput["create"] {
  const tags = input.tags ?? [];
  const rawPart = {
    partId: "a".repeat(26),
    partType: "local",
    name: input.name,
    mpn: input.name,
    manufacturer: null,
    description: input.description ?? "",
    footprint: "",
    tags
  };
  const category = inferPartCategory(rawPart, "unknown");
  const canonicalCategoryTag = categoryTag(category.category);
  const finalTags = stripCategoryTags(tags).filter((tag) => !tag.toLowerCase().startsWith("nexar-") && !tag.toLowerCase().startsWith("nexar:"));
  if (canonicalCategoryTag) {
    finalTags.push(canonicalCategoryTag);
  }
  return {
    ...input,
    tags: [...new Set(finalTags)]
  };
}
