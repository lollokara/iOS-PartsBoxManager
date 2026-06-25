import type { Confidence, ExtractedPart, OverrideRecord, PassiveType, RawPart, ValueSource } from "../domain/passive.js";
import { decodeMpn } from "../mpn/registry.js";
import { parseDescription } from "../parser/descriptionParser.js";
import { approxEqual, formatValue } from "../parser/units.js";
import { classify } from "./classifier.js";

interface ValuePick {
  valueNorm: number | null;
  source: ValueSource;
  conflict: boolean;
}

function pickValue(override: OverrideRecord | undefined, decoded: number | null, desc: number | null): ValuePick {
  if (override?.valueNorm != null) return { valueNorm: override.valueNorm, source: "override", conflict: false };
  if (decoded != null && desc != null) {
    return { valueNorm: decoded, source: "mpn", conflict: !approxEqual(decoded, desc) };
  }
  if (decoded != null) return { valueNorm: decoded, source: "mpn", conflict: false };
  if (desc != null) return { valueNorm: desc, source: "description", conflict: false };
  return { valueNorm: null, source: null, conflict: false };
}

function pickString(a: string | undefined, b: string | undefined, c: string | null): string | null {
  return a ?? b ?? c ?? null;
}

function confidenceOf(type: PassiveType, pick: ValuePick): Confidence {
  if (type === "unknown" || pick.valueNorm == null) return "unknown";
  if (pick.conflict) return "conflict";
  if (pick.source === "override" || pick.source === "mpn") return "high";
  return "medium";
}

export interface NotesSpecs {
  manufacturer?: string;
  datasheetUrl?: string;
  specs: Record<string, string>;
}

export function parseNotes(notes: string | undefined | null): NotesSpecs {
  const result: NotesSpecs = { specs: {} };
  if (!notes) return result;

  const lines = notes.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("Manufacturer:")) {
      result.manufacturer = trimmed.substring("Manufacturer:".length).trim();
    } else if (trimmed.startsWith("Datasheet:")) {
      const match = trimmed.match(/\((https?:\/\/[^\)]+)\)/);
      if (match) {
        result.datasheetUrl = match[1];
      }
    } else if (trimmed.startsWith("|")) {
      const cols = trimmed.split("|").map(c => c.trim()).filter(Boolean);
      if (cols.length === 2 && cols[0] !== "Specification" && !cols[0].startsWith("---")) {
        result.specs[cols[0].toLowerCase()] = cols[1];
      }
    }
  }
  return result;
}

export function extract(part: RawPart, override?: OverrideRecord): ExtractedPart {
  const decoded = decodeMpn(part.mpn);
  const desc = parseDescription(part.description, part.name, part.tags);
  const notesSpecs = parseNotes(part.notes);

  const type: PassiveType = override?.type ?? classify(part, desc.type, decoded?.type);

  let notesValueNorm: number | null = null;
  const valueKey = Object.keys(notesSpecs.specs).find((k) => k === "value");
  const valueVal = valueKey ? notesSpecs.specs[valueKey] : null;
  if (valueVal) {
    const parsedDirect = parseDescription(valueVal, "", []);
    if (parsedDirect.valueNorm != null) {
      notesValueNorm = parsedDirect.valueNorm;
    } else if (type !== "unknown") {
      const suffix = type === "resistor" ? " Ω" : type === "capacitor" ? " F" : type === "inductor" ? " H" : "";
      const parsedWithSuffix = parseDescription(valueVal + suffix, "", []);
      if (parsedWithSuffix.valueNorm != null) {
        notesValueNorm = parsedWithSuffix.valueNorm;
      }
    }
  }

  const pick = pickValue(override, decoded?.valueNorm ?? null, desc.valueNorm ?? notesValueNorm);
  const valueDisplay =
    pick.valueNorm != null ? formatValue(pick.valueNorm, type) : override?.valueDisplay ?? null;

  const price = override?.price ?? part.price ?? null;
  const currency = override?.currency ?? part.currency ?? null;
  
  let datasheetUrl = override?.datasheetUrl ?? part.datasheetUrl ?? notesSpecs.datasheetUrl ?? null;
  if (datasheetUrl && datasheetUrl.startsWith("//")) {
    datasheetUrl = "https:" + datasheetUrl;
  }

  const manufacturer = part.manufacturer ?? notesSpecs.manufacturer ?? null;

  const toleranceKey = Object.keys(notesSpecs.specs).find(k => k.includes("tolerance"));
  const toleranceVal = toleranceKey ? notesSpecs.specs[toleranceKey] : null;
  const tolerance = pickString(override?.tolerance, decoded?.tolerance, desc.tolerance) ?? toleranceVal;

  const voltageKey = Object.keys(notesSpecs.specs).find(k => k.includes("voltage"));
  const voltageVal = voltageKey ? notesSpecs.specs[voltageKey] : null;
  const voltage = pickString(override?.voltage, decoded?.voltage, desc.voltage) ?? voltageVal;

  const packageKey = Object.keys(notesSpecs.specs).find(k => k.includes("package"));
  const packageVal = packageKey ? notesSpecs.specs[packageKey] : null;
  const pkg = pickString(override?.package, decoded?.package, desc.package) ?? packageVal;

  return {
    partId: part.partId,
    pn: part.mpn || part.name,
    manufacturer,
    type,
    valueNorm: pick.valueNorm,
    valueDisplay,
    tolerance,
    voltage,
    package: pkg,
    confidence: confidenceOf(type, pick),
    valueSource: pick.source,
    rawDescription: part.description,
    price,
    currency,
    datasheetUrl
  };
}
