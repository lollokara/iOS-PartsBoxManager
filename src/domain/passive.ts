import { z } from "zod";
import type { CategoryId, MobileSectionId } from "./category.js";

export type PassiveType = "resistor" | "capacitor" | "inductor" | "unknown";
export type Confidence = "high" | "medium" | "conflict" | "unknown";
export type ValueSource = "mpn" | "description" | "override" | null;

export interface RawStockEntry {
  quantity: number;
  storageId: string;
  timestamp: number;
  price?: number | null;
  currency?: string | null;
  comments?: string | null;
}

/** Normalized fields from PartsBox part/all, one entry per part. */
export interface RawPart {
  partId: string;
  partType: string; // PartsBox part/type: local | linked | meta | sub-assembly
  name: string;
  mpn: string;
  manufacturer: string | null;
  description: string;
  footprint: string;
  tags: string[];
  notes?: string;
  defaultStorageId?: string | null;
  stock?: RawStockEntry[];
  price?: number | null;
  currency?: string | null;
  datasheetUrl?: string | null;
}

export interface Specs {
  type: PassiveType;
  valueNorm: number | null; // base units: Ω, F, H
  valueDisplay: string | null;
  tolerance: string | null;
  voltage: string | null;
  package: string | null;
}

/** A part after extraction, before stock/location are attached. */
export interface ExtractedPart extends Specs {
  partId: string;
  pn: string;
  manufacturer: string | null;
  confidence: Confidence;
  valueSource: ValueSource;
  rawDescription: string;
  price?: number | null;
  currency?: string | null;
  datasheetUrl?: string | null;
}

export interface PartLocation {
  storageId: string;
  name: string;
  quantity: number;
}

/** Full library record served to clients. */
export interface ParsedPassive extends ExtractedPart {
  locations: PartLocation[];
  totalStock: number;
  tags?: string[];
  category?: CategoryId;
  categoryLabel?: string;
  section?: MobileSectionId;
  syncStatus?: "pending" | "syncing" | "failed";
  syncError?: string | null;
  notes?: string;
  defaultStorageId?: string | null;
  defaultStorageName?: string | null;
}

/** Stored override, already normalized. */
export interface OverrideRecord {
  type?: PassiveType;
  valueNorm?: number;
  valueDisplay?: string;
  tolerance?: string;
  voltage?: string;
  package?: string;
  price?: number;
  currency?: string;
  datasheetUrl?: string;
}

/** Raw override input from the UI (value is a human string like "10k"). */
export const overrideInputSchema = z
  .object({
    type: z.enum(["resistor", "capacitor", "inductor"]).optional(),
    value: z.string().trim().min(1).optional(),
    tolerance: z.string().trim().min(1).optional(),
    voltage: z.string().trim().min(1).optional(),
    package: z.string().trim().min(1).optional()
  })
  .strict();

export type OverrideInput = z.infer<typeof overrideInputSchema>;
