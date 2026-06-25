import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { CreateLocalPartInput, StockMutationInput } from "../partsbox/apiClient.js";

export type PendingMutationStatus = "pending" | "syncing" | "failed";

export interface PendingCreatePartInput {
  localPartId: string;
  create: CreateLocalPartInput;
  defaultStorageId?: string;
  stock?: Omit<StockMutationInput, "partId">;
}

export interface PendingCreatePartMutation extends PendingCreatePartInput {
  id: string;
  type: "create-part";
  status: PendingMutationStatus;
  createdAt: number;
  updatedAt: number;
  attempts: number;
  remotePartId?: string;
  defaultStorageApplied?: boolean;
  stockApplied?: boolean;
  lastError?: string;
}

export type PendingMutation = PendingCreatePartMutation;

interface PendingMutationFile {
  mutations: PendingMutation[];
}

function mutationId(): string {
  return `mut_${randomBytes(12).toString("base64url")}`;
}

export class PendingMutationStore {
  private mutations: PendingMutation[] = [];

  constructor(
    private readonly filePath: string,
    private readonly now: () => number = Date.now
  ) {}

  async load(): Promise<void> {
    try {
      const text = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(text) as Partial<PendingMutationFile>;
      this.mutations = Array.isArray(parsed.mutations) ? parsed.mutations : [];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        this.mutations = [];
        return;
      }
      throw err;
    }
  }

  list(): PendingMutation[] {
    return this.mutations;
  }

  async enqueueCreatePart(input: PendingCreatePartInput): Promise<PendingCreatePartMutation> {
    const now = this.now();
    const mutation: PendingCreatePartMutation = {
      ...input,
      id: mutationId(),
      type: "create-part",
      status: "pending",
      createdAt: now,
      updatedAt: now,
      attempts: 0
    };
    this.mutations = [...this.mutations, mutation];
    await this.save();
    return mutation;
  }

  async update(id: string, updater: (mutation: PendingMutation) => PendingMutation): Promise<PendingMutation | null> {
    const index = this.mutations.findIndex((mutation) => mutation.id === id);
    if (index === -1) {
      return null;
    }
    const updated = { ...updater(this.mutations[index]), updatedAt: this.now() } as PendingMutation;
    const next = [...this.mutations];
    next[index] = updated;
    this.mutations = next;
    await this.save();
    return updated;
  }

  async remove(id: string): Promise<void> {
    this.mutations = this.mutations.filter((mutation) => mutation.id !== id);
    await this.save();
  }

  private async save(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify({ mutations: this.mutations }, null, 2), "utf8");
  }
}
