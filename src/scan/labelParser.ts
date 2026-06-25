export type ScanVendor = "digikey" | "lcsc" | "unknown";

export interface ParsedScanLabel {
  vendor: ScanVendor;
  raw: string;
  resolvedPartId: string | null;
  sourceUrl: string | null;
  supplierPartNumber: string | null;
  manufacturerPartNumber: string | null;
  quantity: number | null;
  lotCode: string | null;
  dateCode: string | null;
  confidence: number;
  warnings: string[];
}

const DIGIKEY_VENDOR_RE = /\bdigi-?key\b/i;
const LCSC_VENDOR_RE = /\blcsc\b/i;
const DIGIKEY_SUPPLIER_RE = /\b(\d{2,}-\d{3,}-\d+(?:-[A-Z0-9]+)*-ND)\b/i;
const LCSC_SUPPLIER_RE = /\b(C\d{6,})\b/i;
const PARTSBOX_ID_RE = /^[a-z0-9]{26}$/;
const PARTSBOX_PART_URL_RE = /(?:https?:\/\/)?(?:www\.)?partsbox\.com\/(?:[^?#\s]+\/)?parts\/([a-z0-9]{26})(?:[/?#].*)?/i;
const PARTSBOX_PART_ID_TOKEN_RE = /\bpart(?:_id|id|\/id)\b\s*[:=#-]?\s*([a-z0-9]{26})\b/i;

const MANUFACTURER_PART_RE =
  /(?:^|[\s|;,])(?:mpn|mfg\.?\s*p\/?n|mfr\.?\s*p\/?n|manufacturer(?:\s+part)?(?:\s+no\.?| number)?)\b\s*[:=#\- ]*\s*([A-Za-z0-9][A-Za-z0-9._/-]*)/i;
const SUPPLIER_PART_LABELED_RE =
  /(?:^|[\s|;,])(?:supplier\s+part(?:\s+no\.?| number)?|supplier\s+pn|spn|part\s+no\.?|catalog(?:ue)?\s+number|order\s+code|digi-?key\s+p\/?n|lcsc\s+p\/?n)\b\s*[:=#\- ]*\s*([A-Za-z0-9][A-Za-z0-9._/-]*)/i;
const GENERIC_PART_NUMBER_RE =
  /(?<!manufacturer\s)(?<!mfg\s)(?<!mfr\s)(?:^|[\s|;,])part\s+number\b\s*[:=#\- ]*\s*([A-Za-z0-9][A-Za-z0-9._/-]*)/i;
const QUANTITY_RE = /\b(?:qty|quantity|q'ty)\b\s*[:=#\- ]*\s*([0-9]{1,6})\b/i;
const LOT_RE = /\b(?:lot|lot\s+code)\b\s*[:=#\- ]*\s*([A-Za-z0-9._/-]{1,32})\b/i;
const DATE_RE = /\b(?:date(?:\s+code)?|dc)\b\s*[:=#\- ]*\s*([A-Za-z0-9._/-]{2,32})\b/i;

interface ParsedMh10DataMatrix {
  vendor: ScanVendor;
  supplierPartNumber: string | null;
  manufacturerPartNumber: string | null;
  quantity: number | null;
  lotCode: string | null;
  dateCode: string | null;
}

interface ParsedLcscDataMatrix {
  vendor: ScanVendor;
  supplierPartNumber: string | null;
  manufacturerPartNumber: string | null;
  quantity: number | null;
  lotCode: string | null;
}

function normalizeText(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanValue(value: string): string {
  return value.replace(/^[\s"'`]+|[\s"'`,;|]+$/g, "").trim();
}

function readFirstGroup(text: string, re: RegExp): string | null {
  const match = re.exec(text);
  if (!match) return null;
  const value = match[1];
  if (!value) return null;
  const cleaned = cleanValue(value);
  return cleaned.length > 0 ? cleaned : null;
}

function detectVendor(text: string): ScanVendor {
  if (isLikelyDigikeyMh10(text)) return "digikey";
  if (isLikelyLcscStructuredPayload(text)) return "lcsc";
  if (DIGIKEY_VENDOR_RE.test(text)) return "digikey";
  if (LCSC_VENDOR_RE.test(text)) return "lcsc";
  return "unknown";
}

function isLikelyDigikeyMh10(text: string): boolean {
  return /\[>\s*06\b/.test(text) && /\b(?:1P|30P)[A-Za-z0-9#._/-]+/.test(text) && /\bQ\d{1,6}\b/.test(text);
}

function isLikelyLcscStructuredPayload(text: string): boolean {
  return /^\{.*\bpc\s*:\s*C\d+\b.*\bpm\s*:\s*[^,}]+.*\bqty\s*:\s*\d+/i.test(text);
}

function resolvePartsBoxPart(text: string): { resolvedPartId: string | null; sourceUrl: string | null } {
  if (PARTSBOX_ID_RE.test(text)) {
    return { resolvedPartId: text, sourceUrl: null };
  }

  const urlMatch = PARTSBOX_PART_URL_RE.exec(text);
  if (urlMatch?.[1]) {
    return { resolvedPartId: urlMatch[1], sourceUrl: text };
  }

  const tokenMatch = PARTSBOX_PART_ID_TOKEN_RE.exec(text);
  if (tokenMatch?.[1]) {
    return { resolvedPartId: tokenMatch[1], sourceUrl: null };
  }

  return { resolvedPartId: null, sourceUrl: null };
}

function parseMh10DataMatrix(raw: string): ParsedMh10DataMatrix | null {
  if (!raw.includes("[)>") || !/[\u001d\u001e]/.test(raw)) {
    return null;
  }

  const fields = new Map<string, string>();
  const tokens = raw
    .split(/[\u001d\u001e]/)
    .map((token) => token.replace(/\u0004/g, "").trim())
    .filter((token) => token.length > 0 && token !== "[)>" && token !== "06");

  const identifiers = ["20Z", "13Z", "12Z", "11Z", "10K", "30P", "11K", "1P", "1T", "9D", "4L", "1K", "P", "Q", "K"];
  for (const token of tokens) {
    const identifier = identifiers.find((candidate) => token.startsWith(candidate));
    if (!identifier) continue;
    const value = cleanValue(token.slice(identifier.length));
    if (value) {
      fields.set(identifier, value);
    }
  }

  if (fields.size === 0) {
    return null;
  }

  const quantityRaw = fields.get("Q") ?? null;
  const quantity = quantityRaw && /^\d{1,6}$/.test(quantityRaw) ? Number(quantityRaw) : null;
  const manufacturerPartNumber = fields.get("1P") ?? fields.get("30P") ?? fields.get("P") ?? null;
  const supplierPartNumber = null;

  return {
    vendor: fields.has("30P") || fields.has("10K") || fields.has("11Z") || fields.has("12Z") || fields.has("13Z") ? "digikey" : "unknown",
    supplierPartNumber,
    manufacturerPartNumber,
    quantity: quantity != null && quantity > 0 ? quantity : null,
    lotCode: fields.get("1T") ?? null,
    dateCode: fields.get("9D") ?? null
  };
}

function parseLcscDataMatrix(raw: string): ParsedLcscDataMatrix | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}") || !/\bpc\s*:/i.test(trimmed)) {
    return null;
  }

  const body = trimmed.slice(1, -1);
  const fields = new Map<string, string>();
  const pairRe = /(?:^|,)\s*([a-z][a-z0-9]*)\s*:\s*([^,}]*)/gi;
  let match: RegExpExecArray | null;
  while ((match = pairRe.exec(body)) != null) {
    const key = match[1]?.toLowerCase();
    const value = cleanValue(match[2] ?? "");
    if (key && value && value.toLowerCase() !== "null") {
      fields.set(key, value);
    }
  }

  const supplierPartNumber = fields.get("pc") ?? null;
  const manufacturerPartNumber = fields.get("pm") ?? null;
  const quantityRaw = fields.get("qty") ?? null;
  const quantity = quantityRaw && /^\d{1,6}$/.test(quantityRaw) ? Number(quantityRaw) : null;

  if (!supplierPartNumber && !manufacturerPartNumber && quantity == null) {
    return null;
  }

  return {
    vendor: "lcsc",
    supplierPartNumber,
    manufacturerPartNumber,
    quantity: quantity != null && quantity > 0 ? quantity : null,
    lotCode: fields.get("pbn") ?? fields.get("on") ?? null
  };
}

function extractSupplierPartNumber(text: string, vendor: ScanVendor): string | null {
  const labeled = readFirstGroup(text, SUPPLIER_PART_LABELED_RE);
  if (labeled) return labeled;

  const genericPartNumber = readFirstGroup(text, GENERIC_PART_NUMBER_RE);
  if (genericPartNumber && vendor !== "unknown") {
    return genericPartNumber;
  }

  if (vendor === "digikey") {
    return readFirstGroup(text, DIGIKEY_SUPPLIER_RE);
  }

  if (vendor === "lcsc") {
    return readFirstGroup(text, LCSC_SUPPLIER_RE);
  }

  return null;
}

function extractManufacturerPartNumber(text: string): string | null {
  return readFirstGroup(text, MANUFACTURER_PART_RE);
}

function extractQuantity(text: string): number | null {
  const raw = readFirstGroup(text, QUANTITY_RE);
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
}

function extractLotCode(text: string): string | null {
  return readFirstGroup(text, LOT_RE);
}

function extractDateCode(text: string): string | null {
  return readFirstGroup(text, DATE_RE);
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, Math.round(value * 100) / 100));
}

function scoreConfidence(vendor: ScanVendor, fields: ParsedScanLabel): number {
  let score = fields.raw.trim().length > 0 ? 0.08 : 0;

  if (vendor !== "unknown") score += 0.46;
  if (fields.supplierPartNumber) score += 0.18;
  if (fields.manufacturerPartNumber) score += 0.16;
  if (fields.quantity != null) score += 0.06;
  if (fields.lotCode) score += 0.03;
  if (fields.dateCode) score += 0.03;
  if (vendor === "unknown" && !fields.supplierPartNumber && !fields.manufacturerPartNumber && fields.quantity == null && !fields.lotCode && !fields.dateCode) {
    score = Math.min(score, 0.12);
  }

  return clampConfidence(score);
}

export function parseScanLabel(raw: string): ParsedScanLabel {
  const normalized = normalizeText(raw);
  const warnings: string[] = [];
  const resolved = resolvePartsBoxPart(normalized);
  const mh10 = parseMh10DataMatrix(raw);
  const lcscStructured = parseLcscDataMatrix(raw);

  if (normalized.length === 0) {
    warnings.push("Empty scan payload");
  }

  const vendor = mh10?.vendor ?? lcscStructured?.vendor ?? detectVendor(normalized);
  const supplierPartNumber = mh10?.supplierPartNumber ?? lcscStructured?.supplierPartNumber ?? extractSupplierPartNumber(normalized, vendor);
  const manufacturerPartNumber = mh10?.manufacturerPartNumber ?? lcscStructured?.manufacturerPartNumber ?? extractManufacturerPartNumber(normalized);
  const quantity = mh10?.quantity ?? lcscStructured?.quantity ?? extractQuantity(normalized);
  const lotCode = mh10?.lotCode ?? lcscStructured?.lotCode ?? extractLotCode(normalized);
  const dateCode = mh10?.dateCode ?? extractDateCode(normalized);

  if (vendor === "unknown") {
    warnings.push("Vendor not recognized");
  }

  if (
    vendor === "unknown" &&
    !supplierPartNumber &&
    !manufacturerPartNumber &&
    quantity == null &&
    !lotCode &&
    !dateCode
  ) {
    warnings.push("No structured label fields found");
  }

  const parsed: ParsedScanLabel = {
    vendor,
    raw,
    resolvedPartId: resolved.resolvedPartId,
    sourceUrl: resolved.sourceUrl,
    supplierPartNumber,
    manufacturerPartNumber,
    quantity,
    lotCode,
    dateCode,
    confidence: 0,
    warnings
  };

  parsed.confidence = scoreConfidence(vendor, parsed);
  return parsed;
}
