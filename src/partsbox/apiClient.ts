import { compactPartIdSchema } from "../domain/labelRecord.js";
import type { RawPart } from "../domain/passive.js";

type FetchLike = typeof fetch;

export interface PartsBoxApiClientOptions {
  apiKey: string;
  fetchImpl?: FetchLike;
}

export interface ResolvedPart {
  partId: string;
  pn: string;
  description: string;
  notes?: string;
  defaultStorageId?: string | null;
}

export interface StockMutationInput {
  partId: string;
  storageId: string;
  lotId?: string;
  quantity: number;
  note?: string;
  price?: number;
  currency?: string;
}

export interface PartLotSource {
  storageId: string;
  lotId?: string;
  quantity: number;
}

export interface CreateLocalPartInput {
  name: string;
  description?: string;
  tags?: string[];
  notes?: string;
  defaultStorageId?: string;
  footprint?: string;
}

export interface UpdatePartTagsInput {
  partId: string;
  tags: string[];
}

export interface UpdatePartDefaultStorageInput {
  partId: string;
  storageId: string | null;
}

export interface DeletePartInput {
  partId: string;
}

export interface CreateLocalPartResult {
  partId: string;
}

export function sanitizePartTag(tag: string): string | null {
  const cleaned = tag
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned ? cleaned : null;
}

export function sanitizePartTags(tags: string[]): string[] {
  return [...new Set(tags.map(sanitizePartTag).filter((tag): tag is string => tag != null))];
}

export class PartsBoxApiClient {
  private readonly apiKey: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: PartsBoxApiClientOptions) {
    if (!options.apiKey.trim()) {
      throw new Error("PartsBox API key is required");
    }
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async getPart(partId: string): Promise<ResolvedPart> {
    const parsedId = compactPartIdSchema.parse(partId);
    const response = await this.fetchImpl("https://api.partsbox.com/api/1/part/get", {
      method: "POST",
      headers: {
        Authorization: `APIKey ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ "part/id": parsedId })
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`PartsBox API failed with ${response.status}${body ? `: ${body}` : ""}`);
    }

    const payload = (await response.json()) as {
      data?: Record<string, unknown>;
      "partsbox.status/message"?: string;
    };

    const data = payload.data;
    if (!data) {
      throw new Error(`PartsBox API returned no part data: ${payload["partsbox.status/message"] ?? "unknown error"}`);
    }

    const pn = stringValue(data["part/mpn"]) || stringValue(data["part/name"]);
    const description = stringValue(data["part/description"]);
    const returnedId = stringValue(data["part/id"]) || parsedId;

    if (!pn) {
      throw new Error(`PartsBox part ${parsedId} has no part/mpn or part/name`);
    }
    if (!description) {
      throw new Error(`PartsBox part ${parsedId} has no part/description`);
    }

    return {
      partId: compactPartIdSchema.parse(returnedId),
      pn,
      description,
      notes: stringValue(data["part/notes"]) ?? "",
      defaultStorageId: stringValue(data["part/default-storage-id"])
    };
  }

  private async post(path: string, body: unknown): Promise<Record<string, unknown>> {
    const response = await this.fetchImpl(`https://api.partsbox.com/api/1/${path}`, {
      method: "POST",
      headers: {
        Authorization: `APIKey ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`PartsBox API ${path} failed with ${response.status}${text ? `: ${text}` : ""}`);
    }
    return (await response.json()) as Record<string, unknown>;
  }

  async getAllParts(): Promise<RawPart[]> {
    const payload = await this.post("part/all", {});
    const data = (payload.data as Array<Record<string, unknown>>) ?? [];
    return data
      .filter((p) => typeof p["part/id"] === "string")
      .map((p) => ({
        partId: p["part/id"] as string,
        partType: str(p["part/type"]) ?? "",
        name: str(p["part/name"]) ?? "",
        mpn: str(p["part/mpn"]) ?? str(p["part/name"]) ?? "",
        manufacturer: str(p["part/manufacturer"]),
        description: str(p["part/description"]) ?? "",
        footprint: str(p["part/footprint"]) ?? "",
        tags: Array.isArray(p["part/tags"]) ? (p["part/tags"] as string[]) : [],
        notes: str(p["part/notes"]) ?? "",
        defaultStorageId: str(p["part/default-storage-id"]),
        stock: Array.isArray(p["part/stock"])
          ? (p["part/stock"] as Array<Record<string, unknown>>).map((s) => ({
              quantity: typeof s["stock/quantity"] === "number" ? s["stock/quantity"] : 0,
              storageId: typeof s["stock/storage-id"] === "string" ? s["stock/storage-id"] : "",
              timestamp: typeof s["stock/timestamp"] === "number" ? s["stock/timestamp"] : 0,
              price: typeof s["stock/price"] === "number" ? s["stock/price"] : null,
              currency: typeof s["stock/currency"] === "string" ? s["stock/currency"] : null,
              comments: typeof s["stock/comments"] === "string" ? s["stock/comments"] : null
            }))
          : []
      }));
  }

  async getStorageList(): Promise<Map<string, string>> {
    const payload = await this.post("storage/all", {});
    const data = (payload.data as Array<Record<string, unknown>>) ?? [];
    const map = new Map<string, string>();
    for (const s of data) {
      const id = str(s["storage/id"]);
      const name = str(s["storage/name"]);
      if (id) map.set(id, name ?? id);
    }
    return map;
  }

  async createStorage(input: { name: string }): Promise<{ id: string; name: string }> {
    const payload = await this.post("storage/create", { "storage/name": input.name });
    assertPartsBoxOk(payload, "storage/create");
    const data = payload.data as Record<string, unknown> | undefined;
    const id = stringValue(data?.["storage/id"]);
    if (!id) {
      throw new Error("PartsBox storage/create returned no storage id");
    }
    return { id: compactPartIdSchema.parse(id), name: stringValue(data?.["storage/name"]) ?? input.name };
  }

  async archiveStorage(storageId: string): Promise<void> {
    const id = compactPartIdSchema.parse(storageId);
    const payload = await this.post("storage/archive", { "storage/id": id });
    assertPartsBoxOk(payload, "storage/archive");
  }

  async getStorageParts(storageId: string): Promise<Array<{ partId: string; quantity: number }>> {
    const id = compactPartIdSchema.parse(storageId);
    const payload = await this.post("storage/parts", { "storage/id": id });
    const data = (payload.data as Array<Record<string, unknown>>) ?? [];
    return data
      .filter((source) => typeof source["source/part-id"] === "string")
      .map((source) => ({
        partId: source["source/part-id"] as string,
        quantity: Number(source["source/quantity"] ?? 0)
      }));
  }

  async getPartStorageSources(partId: string): Promise<Array<{ storageId: string; quantity: number }>> {
    const parsedId = compactPartIdSchema.parse(partId);
    const payload = await this.post("part/storage", { "part/id": parsedId });
    const data = (payload.data as Array<Record<string, unknown>>) ?? [];
    return data
      .filter((s) => typeof s["source/storage-id"] === "string")
      .map((s) => ({
        storageId: s["source/storage-id"] as string,
        quantity: typeof s["source/quantity"] === "number" ? (s["source/quantity"] as number) : 0
      }));
  }

  async getPartLots(partId: string): Promise<PartLotSource[]> {
    const parsedId = compactPartIdSchema.parse(partId);
    const payload = await this.post("part/lots", { "part/id": parsedId });
    const data = (payload.data as Array<Record<string, unknown>>) ?? [];
    return data
      .filter((s) => typeof s["source/storage-id"] === "string")
      .map((s) => {
        const lotId = str(s["source/lot-id"]) ?? undefined;
        return {
          storageId: s["source/storage-id"] as string,
          ...(lotId ? { lotId } : {}),
          quantity: typeof s["source/quantity"] === "number" ? (s["source/quantity"] as number) : 0
        };
      });
  }

  async createLocalPart(input: CreateLocalPartInput): Promise<CreateLocalPartResult> {
    const body: Record<string, unknown> = {
      "part/type": "local",
      "part/name": input.name
    };
    if (input.description) {
      body["part/description"] = input.description;
    }
    if (input.tags?.length) {
      const tags = sanitizePartTags(input.tags);
      if (tags.length) {
        body["part/tags"] = tags;
      }
    }
    if (input.notes) {
      body["part/notes"] = input.notes;
    }
    if (input.defaultStorageId) {
      body["part/default-storage-id"] = compactPartIdSchema.parse(input.defaultStorageId);
    }
    if (input.footprint) {
      body["part/footprint"] = input.footprint;
    }
    const payload = await this.post("part/create", body);
    const data = payload.data as Record<string, unknown> | undefined;
    const partId = stringValue(data?.["part/id"]);
    if (!partId) {
      throw new Error("PartsBox API part/create returned no part id");
    }
    return { partId: compactPartIdSchema.parse(partId) };
  }

  async updatePartTags(input: UpdatePartTagsInput): Promise<Record<string, unknown>> {
    const partId = compactPartIdSchema.parse(input.partId);
    const tags = sanitizePartTags(input.tags);
    return this.post("part/update", {
      "part/id": partId,
      "part/tags": tags
    });
  }

  async updatePartDetails(input: {
    partId: string;
    description?: string;
    notes?: string;
    tags?: string[];
    footprint?: string;
  }): Promise<Record<string, unknown>> {
    const partId = compactPartIdSchema.parse(input.partId);
    const body: Record<string, unknown> = {
      "part/id": partId
    };
    if (input.description !== undefined) {
      body["part/description"] = input.description;
    }
    if (input.notes !== undefined) {
      body["part/notes"] = input.notes;
    }
    if (input.tags !== undefined) {
      body["part/tags"] = sanitizePartTags(input.tags);
    }
    if (input.footprint !== undefined) {
      body["part/footprint"] = input.footprint;
    }
    return this.post("part/update", body);
  }

  async updatePartSpecOverrides(input: {
    partId: string;
    specOverrides: Record<string, any>;
  }): Promise<Record<string, unknown>> {
    const partId = compactPartIdSchema.parse(input.partId);
    return this.post("part/update-spec-overrides", {
      "part/id": partId,
      "spec-overrides": input.specOverrides
    });
  }

  async updatePartDefaultStorage(input: UpdatePartDefaultStorageInput): Promise<Record<string, unknown>> {
    const partId = compactPartIdSchema.parse(input.partId);
    const body: Record<string, unknown> = { "part/id": partId };
    if (input.storageId) {
      body["part/default-storage-id"] = compactPartIdSchema.parse(input.storageId);
    }
    return this.post("part/update", body);
  }

  async deletePart(input: DeletePartInput): Promise<Record<string, unknown>> {
    const partId = compactPartIdSchema.parse(input.partId);
    return this.post("part/delete", { "part/id": partId });
  }

  async addStock(input: StockMutationInput): Promise<Record<string, unknown>> {
    const partId = compactPartIdSchema.parse(input.partId);
    const storageId = compactPartIdSchema.parse(input.storageId);
    const body: Record<string, unknown> = {
      "stock/part-id": partId,
      "stock/storage-id": storageId,
      "stock/quantity": input.quantity
    };
    if (input.price !== undefined && input.price > 0) {
      body["stock/price"] = input.price;
      if (input.currency !== undefined) {
        body["stock/currency"] = input.currency;
      }
    }
    if (input.note) {
      body["stock/comments"] = input.note;
    }
    return this.post("stock/add", body);
  }

  async removeStock(input: StockMutationInput): Promise<Record<string, unknown>> {
    const partId = compactPartIdSchema.parse(input.partId);
    const storageId = compactPartIdSchema.parse(input.storageId);
    const lotId = input.lotId ? compactPartIdSchema.parse(input.lotId) : undefined;
    const body: Record<string, unknown> = {
      "stock/source": {
        "source/part-id": partId,
        "source/storage-id": storageId,
        ...(lotId ? { "source/lot-id": lotId } : {})
      },
      "stock/quantity": input.quantity
    };
    if (input.note) {
      body["stock/comments"] = input.note;
    }
    return this.post("stock/remove", body);
  }

  async updateStockEntry(input: {
    partId: string;
    timestamp: number;
    price?: number | null;
    currency?: string | null;
    comments?: string | null;
    quantity?: number | null;
  }): Promise<Record<string, unknown>> {
    const partId = compactPartIdSchema.parse(input.partId);
    const body: Record<string, unknown> = {
      "stock/part-id": partId,
      "stock/timestamp": input.timestamp
    };
    if (input.price !== undefined) body["stock/price"] = input.price;
    if (input.currency !== undefined) body["stock/currency"] = input.currency;
    if (input.comments !== undefined) body["stock/comments"] = input.comments;
    if (input.quantity !== undefined) body["stock/quantity"] = input.quantity;
    return this.post("stock/update", body);
  }
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function assertPartsBoxOk(payload: Record<string, unknown>, op: string): void {
  const category = payload["partsbox.status/category"];
  if (typeof category !== "string") {
    return;
  }
  if (category === "ok" || category.endsWith("/ok")) {
    return;
  }
  const message =
    typeof payload["partsbox.status/message"] === "string" ? (payload["partsbox.status/message"] as string) : category;
  throw new Error(`PartsBox ${op} failed: ${message}`);
}
