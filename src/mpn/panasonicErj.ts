import { decodeEia3 } from "../parser/units.js";
import { letterTolerance } from "./tolerance.js";
import type { DecodedMpn, MpnDecoder } from "./types.js";

// ERJ-2G E J 102 X : size(2 chars) series(1) tol(1) value(3-4 EIA) packaging(letter)
const RE = /^ERJ([0-9][A-Z0-9])[A-Z]([A-Z])([0-9R]{3,4})[A-Z]?$/;

const SIZE: Record<string, string> = {
  "1R": "01005", "2G": "0402", "3E": "0603", "3G": "0603", "6E": "0805", "6G": "0805",
  "8E": "1206", "8G": "1206", "12": "1210", "14": "2010"
};

export const panasonicErj: MpnDecoder = {
  name: "Panasonic ERJ",
  decode(mpn) {
    const m = RE.exec(mpn);
    if (!m) return null;
    let value: number | null;
    // Handle 4-digit value codes: ABCD → ABC × 10^D
    if (m[3].length === 4 && /^\d{4}$/.test(m[3])) {
      value = Number(m[3].slice(0, 3)) * Math.pow(10, Number(m[3][3]));
    } else {
      value = decodeEia3(m[3]);
    }
    if (value == null) return null;
    const out: DecodedMpn = { type: "resistor", valueNorm: value };
    const tol = letterTolerance(m[2]);
    if (tol) out.tolerance = tol;
    const pkg = SIZE[m[1]];
    if (pkg) out.package = pkg;
    return out;
  }
};
