// Common resistor/capacitor tolerance letter codes.
const MAP: Record<string, string> = {
  B: "±0.1%", C: "±0.25%", D: "±0.5%", F: "±1%", G: "±2%", J: "±5%", K: "±10%", M: "±20%", W: "±0.05%"
};

export function letterTolerance(code: string): string | null {
  return MAP[code] ?? null;
}
