import type { PassiveType, RawPart } from "../domain/passive.js";

export function classify(
  part: RawPart,
  descType: PassiveType,
  decodedType: PassiveType | undefined
): PassiveType {
  if (decodedType && decodedType !== "unknown") return decodedType;
  if (descType !== "unknown") return descType;

  const text = `${part.description} ${part.name} ${part.footprint} ${part.tags.join(" ")}`.toLowerCase();
  if (/\b(inductor|ferrite bead|choke|inductance)\b/.test(text)) return "inductor";
  if (/\b(capacitor|mlcc|ceramic cap|tantalum|cap cer)\b/.test(text)) return "capacitor";
  if (/\b(resistor|thick film|thin film|chip resistor)\b/.test(text)) return "resistor";
  return "unknown";
}
