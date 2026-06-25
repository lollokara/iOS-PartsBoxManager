import { decodeRkm } from "../parser/units.js";
import { letterTolerance } from "./tolerance.js";
import type { DecodedMpn, MpnDecoder } from "./types.js";

// Example: RC0603FR-0710KL -> 0603, F(±1%), value 10K
const RE = /^RC(\d{4})([A-Z])R-\d{2}([0-9RKMG]+)[A-Z]$/;

export const yageoRc: MpnDecoder = {
  name: "Yageo RC",
  decode(mpn) {
    const m = RE.exec(mpn);
    if (!m) return null;
    const value = decodeRkm(m[3]);
    if (value == null) return null;
    const out: DecodedMpn = { type: "resistor", valueNorm: value, package: m[1] };
    const tol = letterTolerance(m[2]);
    if (tol) out.tolerance = tol;
    return out;
  }
};
