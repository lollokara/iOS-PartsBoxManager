import type { PassiveType } from "../domain/passive.js";

const SI: Record<string, number> = {
  p: 1e-12, n: 1e-9, u: 1e-6, "µ": 1e-6, "μ": 1e-6, m: 1e-3, "": 1, k: 1e3, K: 1e3, M: 1e6, G: 1e9
};

export function siMultiplier(prefix: string): number | null {
  return Object.prototype.hasOwnProperty.call(SI, prefix) ? SI[prefix] : null;
}

export function unitSymbol(type: PassiveType): string {
  if (type === "resistor") return "Ω";
  if (type === "capacitor") return "F";
  if (type === "inductor") return "H";
  return "";
}

const ENG: Array<[number, string]> = [
  [1e9, "G"], [1e6, "M"], [1e3, "k"], [1, ""], [1e-3, "m"], [1e-6, "µ"], [1e-9, "n"], [1e-12, "p"]
];

export function formatValue(valueNorm: number, type: PassiveType): string {
  const unit = unitSymbol(type);
  if (valueNorm === 0) return `0 ${unit}`;
  const abs = Math.abs(valueNorm);
  let factor = 1;
  let prefix = "";
  for (const [f, p] of ENG) {
    if (abs >= f) {
      factor = f;
      prefix = p;
      break;
    }
  }
  const mant = valueNorm / factor;
  const s = mant.toFixed(3).replace(/\.?0+$/, "");
  return `${s} ${prefix}${unit}`;
}

export function decodeRkm(code: string): number | null {
  const m = /^(\d*)([RKMG])(\d*)$/.exec(code);
  if (!m) return null;
  const mult: Record<string, number> = { R: 1, K: 1e3, M: 1e6, G: 1e9 };
  const intPart = m[1] === "" ? "0" : m[1];
  const frac = m[3] === "" ? "0" : m[3];
  return Number(`${intPart}.${frac}`) * mult[m[2]];
}

export function decodeEia3(code: string): number | null {
  if (/^\d{3}$/.test(code)) {
    const sig = Number(code.slice(0, 2));
    const mult = Number(code.slice(2));
    return sig * Math.pow(10, mult);
  }
  if (/^\d*R\d*$/.test(code)) {
    const v = Number(code.replace("R", "."));
    return Number.isNaN(v) ? null : v;
  }
  return null;
}

export function approxEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= 0.02 * Math.max(Math.abs(a), Math.abs(b));
}
