import type { PassiveType } from "../domain/passive.js";
import { siMultiplier } from "./units.js";

export interface ParsedDescription {
  type: PassiveType;
  valueNorm: number | null;
  tolerance: string | null;
  voltage: string | null;
  package: string | null;
}

const IND_RE = /(\d+(?:\.\d+)?)\s*(p|n|µ|μ|u|m)?H\b/i;
const CAP_RE = /(\d+(?:\.\d+)?)\s*(p|n|µ|μ|u|m)?F\b/i;
const RES_RE = /(\d+(?:\.\d+)?)\s*(k|K|m|M|g|G|µ|u)?\s*(?:Ω|ohms?)/i;
const TOL_RE = /(?:±|卤|\+\/-)\s*(\d+(?:\.\d+)?)\s*%|(?:^|\s)(\d+(?:\.\d+)?)\s*%/;
const VOLT_RE = /(\d+(?:\.\d+)?)\s*V\b/i;
const PKG_RE = /\b(01005|0201|0402|0603|0805|1206|1210|1812|2010|2512|2920|1008)\b/;

function valueFrom(re: RegExp, text: string, baseScale: number): number | null {
  const m = re.exec(text);
  if (!m) return null;
  const num = Number(m[1]);
  let prefix = (m[2] ?? "").replace("μ", "µ");
  // Preserve mega (M) and giga (G); lowercase the rest so UF/UH/PF/NF normalize correctly.
  if (prefix !== "M" && prefix !== "G") prefix = prefix.toLowerCase();
  const mult = siMultiplier(prefix);
  if (mult == null) return null;
  const result = num * mult * baseScale;
  // Round to 15 decimal places to handle floating-point precision issues
  return Math.round(result * 1e15) / 1e15;
}

// Patterns that indicate a part is an active component, even if its description
// mentions passive values (e.g. a MOSFET with Rds-on in ohms, or a crystal with load capacitance).
const ACTIVE_EXCLUSION_RE =
  /\b(mosfet|p-channel|n-channel|field.effect|transistor|npn|pnp|bjt|bjts|igbt|jfet|scr|thyristor|triac|crystal|oscillator|xtal|resonator|relay|contactor|optocoupler|opto.isolator|phototransistor|photodiode|comparator|operational amplifier|op.amp|voltage reference|voltage regulator|ldo|dc.dc|buck|boost|charge pump|gate driver|motor driver|h.bridge|half.bridge|full.bridge|dac|adc|codec|microcontroller|mcu|fpga|cpld|soc|eeprom|flash|sram|dram|fifo|uart|spi|i2c|can transceiver|ethernet|usb hub|led driver|lcd driver|display driver|battery charger|power management|current sense|or controller|load switch|hot swap)\b/i;

export function parseDescription(description: string, name: string, tags: string[]): ParsedDescription {
  const text = `${description} ${name} ${tags.join(" ")}`;

  // Skip passive value parsing if the part is clearly an active component.
  // This prevents MOSFETs with Rds-on specs, crystals with load capacitance, etc.
  // from being misclassified as passives.
  const isActiveComponent = ACTIVE_EXCLUSION_RE.test(text);

  // Type priority: only inductors carry H, only capacitors carry F.
  let type: PassiveType = "unknown";
  let valueNorm: number | null = null;

  if (!isActiveComponent) {
    const ind = valueFrom(IND_RE, text, 1);
    if (ind != null) {
      type = "inductor";
      valueNorm = ind;
    } else {
      const cap = valueFrom(CAP_RE, text, 1);
      if (cap != null) {
        type = "capacitor";
        valueNorm = cap;
      } else {
        const res = valueFrom(RES_RE, text, 1);
        if (res != null) {
          type = "resistor";
          valueNorm = res;
        }
      }
    }
  }

  const tolM = TOL_RE.exec(text);
  const tolerance = tolM ? `±${tolM[1] ?? tolM[2]}%` : null;

  const voltM = VOLT_RE.exec(text);
  const voltage = voltM ? `${Number(voltM[1])} V` : null;

  const pkgM = PKG_RE.exec(text);
  const pkg = pkgM ? pkgM[1] : null;

  return { type, valueNorm, tolerance, voltage, package: pkg };
}
