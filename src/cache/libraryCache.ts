import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ParsedPassive, PassiveType } from "../domain/passive.js";
import { readJsonFile, writeJsonFile } from "../utils/atomicFile.js";

export interface LibrarySnapshot {
  parts: ParsedPassive[];
  lastSyncedAt: number | null;
  error: string | null;
}

export interface LibraryFilters {
  packages: string[];
  tolerances: string[];
  voltages: string[];
}

function emptySnapshot(): LibrarySnapshot {
  return { parts: [], lastSyncedAt: null, error: null };
}

function needsReview(p: ParsedPassive): boolean {
  return p.confidence === "conflict" || p.confidence === "unknown";
}

function distinct(values: Array<string | null>): string[] {
  return [...new Set(values.filter((v): v is string => v != null))].sort();
}

export class LibraryCache {
  private snapshot: LibrarySnapshot = emptySnapshot();
  private syncedParts = new Map<string, string>();

  constructor(private readonly filePath: string) {}

  recordSyncedPart(localId: string, remoteId: string): void {
    this.syncedParts.set(localId, remoteId);
  }

  getRemoteIdForLocal(localId: string): string | undefined {
    return this.syncedParts.get(localId);
  }

  async load(): Promise<void> {
    const loaded = await readJsonFile<LibrarySnapshot>(this.filePath);
    this.snapshot = loaded ?? emptySnapshot();
  }

  async set(snapshot: LibrarySnapshot): Promise<void> {
    this.snapshot = snapshot;
    await writeJsonFile(this.filePath, snapshot);
  }

  async updatePart(id: string, updater: (part: ParsedPassive) => ParsedPassive): Promise<ParsedPassive | null> {
    const index = this.snapshot.parts.findIndex((part) => part.partId === id);
    if (index === -1) {
      return null;
    }
    const parts = [...this.snapshot.parts];
    const updated = updater(parts[index]);
    parts[index] = updated;
    await this.set({ ...this.snapshot, parts });
    return updated;
  }

  async addOrReplacePart(part: ParsedPassive): Promise<void> {
    const existingIndex = this.snapshot.parts.findIndex((entry) => entry.partId === part.partId);
    const parts = [...this.snapshot.parts];
    if (existingIndex === -1) {
      parts.push(part);
    } else {
      parts[existingIndex] = part;
    }
    await this.set({ ...this.snapshot, parts });
  }

  async removePart(id: string): Promise<void> {
    const parts = this.snapshot.parts.filter((part) => part.partId !== id);
    if (parts.length === this.snapshot.parts.length) {
      return;
    }
    await this.set({ ...this.snapshot, parts });
  }

  getSnapshot(): LibrarySnapshot {
    return this.snapshot;
  }

  getByType(type: PassiveType): ParsedPassive[] {
    return this.snapshot.parts
      .filter((p) => p.type === type && !needsReview(p))
      .sort((a, b) => {
        if (a.valueNorm == null) return 1;
        if (b.valueNorm == null) return -1;
        return a.valueNorm - b.valueNorm;
      });
  }

  getReview(): ParsedPassive[] {
    return this.snapshot.parts.filter(needsReview);
  }

  getPart(id: string): ParsedPassive | undefined {
    return this.snapshot.parts.find((p) => p.partId === id);
  }

  filtersFor(type: PassiveType): LibraryFilters {
    const parts = this.snapshot.parts.filter((p) => p.type === type);
    return {
      packages: distinct(parts.map((p) => p.package)),
      tolerances: distinct(parts.map((p) => p.tolerance)),
      voltages: distinct(parts.map((p) => p.voltage))
    };
  }
}
