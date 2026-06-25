import { describe, expect, it } from "vitest";
import { approxEqual, decodeEia3, decodeRkm, formatValue, siMultiplier } from "../../src/parser/units.js";

describe("siMultiplier", () => {
  it("maps prefixes including µ and uppercase K/M", () => {
    expect(siMultiplier("k")).toBe(1e3);
    expect(siMultiplier("K")).toBe(1e3);
    expect(siMultiplier("µ")).toBe(1e-6);
    expect(siMultiplier("u")).toBe(1e-6);
    expect(siMultiplier("")).toBe(1);
    expect(siMultiplier("x")).toBeNull();
  });
});

describe("formatValue", () => {
  it("formats resistance, capacitance, inductance in engineering notation", () => {
    expect(formatValue(22000, "resistor")).toBe("22 kΩ");
    expect(formatValue(10000, "resistor")).toBe("10 kΩ");
    expect(formatValue(4.7e-6, "capacitor")).toBe("4.7 µF");
    expect(formatValue(1e-10, "capacitor")).toBe("100 pF");
    expect(formatValue(3.3e-6, "inductor")).toBe("3.3 µH");
    expect(formatValue(1, "resistor")).toBe("1 Ω");
  });
});

describe("decodeRkm", () => {
  it("decodes resistor R/K/M notation", () => {
    expect(decodeRkm("10K")).toBe(10000);
    expect(decodeRkm("22K6")).toBe(22600);
    expect(decodeRkm("4K7")).toBe(4700);
    expect(decodeRkm("1R0")).toBe(1);
    expect(decodeRkm("R47")).toBeCloseTo(0.47, 6);
    expect(decodeRkm("nope")).toBeNull();
  });
});

describe("decodeEia3", () => {
  it("decodes 3-digit and R-notation EIA codes", () => {
    expect(decodeEia3("102")).toBe(1000);
    expect(decodeEia3("100")).toBe(10);
    expect(decodeEia3("475")).toBe(4_700_000);
    expect(decodeEia3("4R7")).toBeCloseTo(4.7, 6);
    expect(decodeEia3("xy")).toBeNull();
  });
});

describe("approxEqual", () => {
  it("treats values within 2% as equal", () => {
    expect(approxEqual(10000, 10100)).toBe(true);
    expect(approxEqual(10000, 12000)).toBe(false);
  });
});
