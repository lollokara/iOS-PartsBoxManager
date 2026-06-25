import { panasonicErj } from "./panasonicErj.js";
import { samsungCl } from "./samsungCl.js";
import { tdkC } from "./tdkC.js";
import { yageoRc } from "./yageoRc.js";
import type { DecodedMpn, MpnDecoder } from "./types.js";

const decoders: MpnDecoder[] = [yageoRc, panasonicErj, samsungCl, tdkC];

export function decodeMpn(mpn: string): DecodedMpn | null {
  const clean = mpn.trim().toUpperCase();
  for (const d of decoders) {
    const result = d.decode(clean);
    if (result) return result;
  }
  return null;
}
