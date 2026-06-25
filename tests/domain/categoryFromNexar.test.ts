import { describe, expect, it } from "vitest";
import { categoryFromNexar, inferPartCategory } from "../../src/domain/category.js";
import type { RawPart } from "../../src/domain/passive.js";

function raw(over: Partial<RawPart>): RawPart {
  return { partId: "a".repeat(26), partType: "local", name: "", mpn: "", manufacturer: null, description: "", footprint: "", tags: [], ...over };
}

describe("categoryFromNexar", () => {
  it("maps Nexar 'Operational Amplifiers' (plural) to opamp", () => {
    expect(categoryFromNexar("Operational Amplifiers")).toBe("opamp");
  });
  it("maps 'Amplifier ICs' to opamp", () => {
    expect(categoryFromNexar("Amplifier ICs")).toBe("opamp");
  });
  it("maps microcontroller/regulator/mosfet/diode/passives", () => {
    expect(categoryFromNexar("Microcontrollers")).toBe("mcu");
    expect(categoryFromNexar("Voltage Regulators - Linear")).toBe("regulator");
    expect(categoryFromNexar("MOSFETs")).toBe("mosfet");
    expect(categoryFromNexar("Rectifiers / Diodes")).toBe("diode-led");
    expect(categoryFromNexar("Chip Resistor - Surface Mount")).toBe("resistor");
    expect(categoryFromNexar("Multilayer Ceramic Capacitors MLCC")).toBe("capacitor");
  });
  it("returns null when nothing matches", () => {
    expect(categoryFromNexar("Random Widgets")).toBeNull();
    expect(categoryFromNexar(undefined)).toBeNull();
  });
});

describe("inferPartCategory regex hardening", () => {
  it("matches plural 'operational amplifiers' in description text", () => {
    expect(inferPartCategory(raw({ name: "TL072", description: "Dual operational amplifiers" })).category).toBe("opamp");
  });
  it("matches 'ICs' for ic category", () => {
    expect(inferPartCategory(raw({ name: "X", description: "general purpose ICs" })).category).toBe("ic");
  });
});
