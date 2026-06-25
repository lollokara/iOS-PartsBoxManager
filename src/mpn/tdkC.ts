import { decodeEia3 } from "../parser/units.js";
import { letterTolerance } from "./tolerance.js";
import type { DecodedMpn, MpnDecoder } from "./types.js";

// C 3216 X7R 1C 475 K 160 AB : metricSize(4) temp(3) voltage(2) value(3 EIA pF) tol(1) rest
const RE = /^C(\d{4})[A-Z0-9]{3}([0-9][A-Z])([0-9R]{3})([A-Z])[A-Z0-9]*$/;

const SIZE: Record<string, string> = {
  "1005": "0402", "1608": "0603", "2012": "0805", "3216": "1206", "3225": "1210", "4532": "1812"
};

const VOLTAGE: Record<string, string> = {
  "0J": "6.3 V", "1A": "10 V", "1C": "16 V", "1E": "25 V", "1V": "35 V", "1H": "50 V",
  "2A": "100 V", "2E": "250 V", "2W": "450 V"
};

export const tdkC: MpnDecoder = {
  name: "TDK C-series",
  decode(mpn) {
    const m = RE.exec(mpn);
    if (!m) return null;
    const pf = decodeEia3(m[3]);
    if (pf == null) return null;
    // Divide by 1e12 to convert pF to Farads (exact for all digit codes, handles R-codes correctly)
    const valueNorm = pf / 1e12;
    const out: DecodedMpn = { type: "capacitor", valueNorm };
    const tol = letterTolerance(m[4]);
    if (tol) out.tolerance = tol;
    const volt = VOLTAGE[m[2]];
    if (volt) out.voltage = volt;
    const pkg = SIZE[m[1]];
    if (pkg) out.package = pkg;
    return out;
  }
};
