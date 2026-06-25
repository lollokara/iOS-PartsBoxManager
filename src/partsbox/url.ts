import { compactPartIdSchema } from "../domain/labelRecord.js";

export function extractPartIdFromUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }

  if (url.hostname !== "partsbox.com") {
    return null;
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const partsIndex = segments.indexOf("parts");
  if (partsIndex === -1 || partsIndex === segments.length - 1) {
    return null;
  }

  const candidate = segments[partsIndex + 1];
  return compactPartIdSchema.safeParse(candidate).success ? candidate : null;
}
