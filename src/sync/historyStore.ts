import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export interface HistoryEntry {
  id: string;
  timestamp: number;
  type: "create-part" | "stock-adjust" | "delete-part" | "category-change" | "sync-local-to-cloud";
  partId: string;
  partName: string;
  storageId?: string;
  storageName?: string;
  quantity?: number; // delta
  note?: string;
  status: "pending" | "completed" | "failed";
  error?: string;
}

export class HistoryStore {
  private entries: HistoryEntry[] = [];

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    try {
      const text = await readFile(this.filePath, "utf8");
      this.entries = JSON.parse(text) as HistoryEntry[];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        this.entries = [];
        return;
      }
      throw err;
    }
  }

  async save(): Promise<void> {
    try {
      await mkdir(dirname(this.filePath), { recursive: true });
      const toSave = this.entries.slice(0, 200);
      await writeFile(this.filePath, JSON.stringify(toSave, null, 2), "utf8");
    } catch (err) {
      console.error("Failed to save history:", err);
    }
  }

  getLatest(limit = 100): HistoryEntry[] {
    return this.entries.slice(0, limit);
  }

  async addEntry(entry: Omit<HistoryEntry, "id" | "timestamp">): Promise<HistoryEntry> {
    const fullEntry: HistoryEntry = {
      id: Math.random().toString(36).substring(2, 15),
      timestamp: Date.now(),
      ...entry
    };
    this.entries.unshift(fullEntry);
    await this.save();
    return fullEntry;
  }

  async updateEntry(id: string, updater: (entry: HistoryEntry) => Partial<HistoryEntry>): Promise<HistoryEntry | null> {
    const index = this.entries.findIndex((e) => e.id === id);
    if (index === -1) return null;
    this.entries[index] = {
      ...this.entries[index],
      ...updater(this.entries[index])
    };
    await this.save();
    return this.entries[index];
  }

  async updateEntryByPartIdAndType(
    partId: string,
    type: HistoryEntry["type"],
    updater: (entry: HistoryEntry) => Partial<HistoryEntry>
  ): Promise<HistoryEntry | null> {
    const entry = this.entries.find((e) => e.partId === partId && e.type === type && e.status === "pending");
    if (!entry) return null;
    return this.updateEntry(entry.id, updater);
  }
}
