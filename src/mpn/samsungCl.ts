import { decodeEia3 } from "../parser/units.js";
import { letterTolerance } from "./tolerance.js";
import type { DecodedMpn, MpnDecoder } from "./types.js";

// CL 05 C 100 J B5NNNC : size(2) dielectric(1) value(3 EIA pF) tol(1) rest
const RE = /^CL(\d{2})[A-Z]([0-9R]{3})([A-Z])[A-Z0-9]+$/;

const SIZE: Record<string, string> = {
  "03": "01005", "05": "0402", "10": "0603", "21": "0805", "31": "1206", "32": "1210"
};

export const samsungCl: MpnDecoder = {
  name: "Samsung CL",
  decode(mpn) {
    const m = RE.exec(mpn);
    if (!m) return null;
    const pf = decodeEia3(m[2]);
    if (pf == null) return null;
    const out: DecodedMpn = { type: "capacitor", valueNorm: pf * 1e-12 };
    const tol = letterTolerance(m[3]);
    if (tol) out.tolerance = tol;
    const pkg = SIZE[m[1]];
    if (pkg) out.package = pkg;
    return out;
  }
};
