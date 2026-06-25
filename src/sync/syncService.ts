import type { ParsedPassive, RawPart } from "../domain/passive.js";
import type { LibraryCache, LibrarySnapshot } from "../cache/libraryCache.js";
import type { OverrideStore } from "../overrides/overrideStore.js";
import { extract } from "../extract/extractor.js";
import { inferPartCategory } from "../domain/category.js";

export interface SyncClient {
  getAllParts(): Promise<RawPart[]>;
  getStorageList(): Promise<Map<string, string>>;
  getPartStorageSources(partId: string): Promise<Array<{ storageId: string; quantity: number }>>;
}

export interface SyncDeps {
  client: SyncClient;
  cache: LibraryCache;
  overrides: OverrideStore;
  now?: () => number;
}

export class SyncService {
  constructor(private readonly deps: SyncDeps) {}

  async sync(): Promise<LibrarySnapshot> {
    const now = this.deps.now ?? Date.now;
    try {
      const previous = this.deps.cache.getSnapshot();
      const [parts, storageNames, overrides] = await Promise.all([
        this.deps.client.getAllParts(),
        this.deps.client.getStorageList(),
        this.deps.overrides.getAll()
      ]);

      const concurrency = 15;
      const result: ParsedPassive[] = new Array(parts.length);
      const workers = Array.from({ length: concurrency }, async (_, workerId) => {
        for (let i = workerId; i < parts.length; i += concurrency) {
          const part = parts[i];
          try {
            const extracted = extract(part, overrides[part.partId]);
            const sources = await this.deps.client.getPartStorageSources(part.partId);
            const locations = sources.map((s) => ({
              storageId: s.storageId,
              name: storageNames.get(s.storageId) ?? "Unknown",
              quantity: s.quantity
            }));
            const totalStock = locations.reduce((sum, l) => sum + l.quantity, 0);
            const category = inferPartCategory(part, extracted.type);
            const prevPart = previous.parts.find((p) => p.partId === part.partId);

            // Find the latest stock entry that has a price/currency
            let partPrice: number | null = null;
            let partCurrency: string | null = null;
            if (part.stock && part.stock.length > 0) {
              const sortedStock = [...part.stock].sort((a, b) => b.timestamp - a.timestamp);
              const pricedEntry = sortedStock.find((s) => s.price !== null && s.price !== undefined);
              if (pricedEntry) {
                partPrice = pricedEntry.price!;
                partCurrency = pricedEntry.currency ?? "usd";
              }
            }

            const finalPrice = extracted.price !== null && extracted.price !== undefined
              ? extracted.price
              : (partPrice !== null ? partPrice : (prevPart?.price || null));

            const finalCurrency = extracted.currency !== null && extracted.currency !== undefined
              ? extracted.currency
              : (partCurrency !== null ? partCurrency : (prevPart?.currency || null));

            const finalDatasheetUrl = extracted.datasheetUrl !== null && extracted.datasheetUrl !== undefined
              ? extracted.datasheetUrl
              : (prevPart?.datasheetUrl || null);

            const finalDescription = extracted.rawDescription || prevPart?.rawDescription || "";
            const finalNotes = part.notes || prevPart?.notes || "";
            const finalManufacturer = part.manufacturer || prevPart?.manufacturer || null;
            const finalPackage = extracted.package || prevPart?.package || null;
            const finalTolerance = extracted.tolerance || prevPart?.tolerance || null;
            const finalVoltage = extracted.voltage || prevPart?.voltage || null;

            const defaultStorageId = part.defaultStorageId || prevPart?.defaultStorageId || null;
            const defaultStorageName = defaultStorageId
              ? (storageNames.get(defaultStorageId) ?? defaultStorageId)
              : (prevPart?.defaultStorageName || null);

            result[i] = {
              ...extracted,
              rawDescription: finalDescription,
              manufacturer: finalManufacturer,
              package: finalPackage,
              tolerance: finalTolerance,
              voltage: finalVoltage,
              locations,
              totalStock,
              tags: part.tags,
              category: category.category,
              categoryLabel: category.categoryLabel,
              section: category.section,
              notes: finalNotes,
              defaultStorageId,
              defaultStorageName,
              price: finalPrice,
              currency: finalCurrency,
              datasheetUrl: finalDatasheetUrl
            };
          } catch (err) {
            console.error(`Failed to fetch storage sources for part ${part.partId}:`, err);
            throw err;
          }
        }
      });
      await Promise.all(workers);

      const pendingLocalParts = previous.parts.filter((part) => part.partId.startsWith("local") && part.syncStatus != null);
      result.push(...pendingLocalParts);

      const snapshot: LibrarySnapshot = { parts: result, lastSyncedAt: now(), error: null };
      await this.deps.cache.set(snapshot);
      return snapshot;
    } catch (err) {
      const previous = this.deps.cache.getSnapshot();
      const snapshot: LibrarySnapshot = {
        parts: previous.parts,
        lastSyncedAt: previous.lastSyncedAt,
        error: err instanceof Error ? err.message : String(err)
      };
      await this.deps.cache.set(snapshot);
      return snapshot;
    }
  }
}
