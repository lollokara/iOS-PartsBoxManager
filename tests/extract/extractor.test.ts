import { describe, expect, it } from "vitest";
import type { RawPart } from "../../src/domain/passive.js";
import { extract } from "../../src/extract/extractor.js";

const part = (over: Partial<RawPart>): RawPart => ({
  partId: "a".repeat(26), partType: "linked", name: "", mpn: "", manufacturer: "Yageo",
  description: "", footprint: "", tags: [], ...over
});

describe("extract", () => {
  it("marks high confidence when MPN and description agree", () => {
    const r = extract(part({
      mpn: "RC0603FR-0710KL",
      description: "Res Thick Film 0603 10K Ohm 1% 0.1W"
    }));
    expect(r).toMatchObject({
      type: "resistor", valueNorm: 10000, valueDisplay: "10 kΩ",
      tolerance: "±1%", package: "0603", confidence: "high", valueSource: "mpn"
    });
  });

  it("uses description with medium confidence when MPN is undecodable", () => {
    const r = extract(part({ mpn: "UNKNOWN123", description: "Res 0805 4.7K Ohm 5%" }));
    expect(r).toMatchObject({ valueNorm: 4700, confidence: "medium", valueSource: "description" });
  });

  it("flags a conflict when MPN and description disagree", () => {
    const r = extract(part({
      mpn: "RC0603FR-0710KL", // 10k
      description: "Res 0603 1K Ohm 1%" // 1k
    }));
    expect(r.confidence).toBe("conflict");
    expect(r.valueNorm).toBe(10000); // MPN wins as the stored value
  });

  it("returns unknown confidence when nothing parses", () => {
    const r = extract(part({ mpn: "LTC4125EUFD", description: "Wireless Power Transmitter" }));
    expect(r).toMatchObject({ type: "unknown", valueNorm: null, confidence: "unknown" });
  });

  it("lets an override win with high confidence", () => {
    const r = extract(
      part({ mpn: "UNKNOWN123", description: "mystery" }),
      { type: "resistor", valueNorm: 330, valueDisplay: "330 Ω", tolerance: "±1%" }
    );
    expect(r).toMatchObject({
      type: "resistor", valueNorm: 330, valueDisplay: "330 Ω",
      tolerance: "±1%", confidence: "high", valueSource: "override"
    });
  });

  it("handles local-only overrides like price, currency, datasheetUrl, voltage, and package case", () => {
    const r = extract(
      part({ mpn: "UNKNOWN123", description: "mystery" }),
      {
        price: 0.1234,
        currency: "USD",
        datasheetUrl: "https://example.com/datasheet.pdf",
        voltage: "50V",
        package: "0805"
      }
    );
    expect(r).toMatchObject({
      price: 0.1234,
      currency: "USD",
      datasheetUrl: "https://example.com/datasheet.pdf",
      voltage: "50V",
      package: "0805"
    });
  });
});
