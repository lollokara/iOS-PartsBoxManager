import { describe, expect, it } from "vitest";
import type { RawPart } from "../../src/domain/passive.js";
import { classify } from "../../src/extract/classifier.js";

const part = (over: Partial<RawPart>): RawPart => ({
  partId: "x".repeat(26), partType: "linked", name: "", mpn: "", manufacturer: null,
  description: "", footprint: "", tags: [], ...over
});

describe("classify", () => {
  it("prefers the decoded type", () => {
    expect(classify(part({}), "unknown", "capacitor")).toBe("capacitor");
  });

  it("falls back to the description-derived type", () => {
    expect(classify(part({}), "resistor", undefined)).toBe("resistor");
  });

  it("uses keywords when no value was parsed", () => {
    expect(classify(part({ description: "Ferrite Bead Inductor 600 ohm" }), "unknown", undefined)).toBe("inductor");
    expect(classify(part({ description: "Multilayer Ceramic Capacitor MLCC" }), "unknown", undefined)).toBe("capacitor");
  });

  it("returns unknown for a non-passive IC", () => {
    expect(classify(part({ description: "Wireless Power Transmitter QFN" }), "unknown", undefined)).toBe("unknown");
  });
});
