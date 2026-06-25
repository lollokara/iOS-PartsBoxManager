import { describe, expect, it } from "vitest";
import { parseDescription } from "../../src/parser/descriptionParser.js";

const p = (d: string) => parseDescription(d, "", []);

describe("parseDescription", () => {
  it("parses a Yageo resistor description", () => {
    expect(p("100mW Thick Film Resistors ±100ppm/℃ ±1% 10kΩ 0603 Chip Resistor")).toEqual({
      type: "resistor",
      valueNorm: 10000,
      tolerance: "±1%",
      voltage: null,
      package: "0603"
    });
  });

  it("parses 'Res Thick Film 0603 22K Ohm 1%'", () => {
    expect(p("Res Thick Film 0603 22K Ohm 1% 0.1W(1/10W) ±100ppm/C Pad SMD T/R")).toMatchObject({
      type: "resistor",
      valueNorm: 22000,
      tolerance: "±1%",
      package: "0603"
    });
  });

  it("parses a TDK capacitor description with voltage", () => {
    expect(p("CAP CER 4.7UF 16V X7R 1206 / 4.7 µF ±10% 16V Ceramic Capacitor X7R 1206")).toMatchObject({
      type: "capacitor",
      valueNorm: 4.7e-6,
      tolerance: "±10%",
      voltage: "16 V",
      package: "1206"
    });
  });

  it("parses a garbled-tolerance capacitor (卤 for ±)", () => {
    expect(p("50V 10pF C0G 卤5% 0402 Multilayer Ceramic Capacitors")).toMatchObject({
      type: "capacitor",
      valueNorm: 1e-11,
      tolerance: "±5%",
      voltage: "50 V",
      package: "0402"
    });
  });

  it("classifies an inductor by H and ignores its DCR ohms", () => {
    expect(p("High Current Inductor, Fixed, SMD, 5040, 3.3UH 5.75A, 18.5MOHM")).toMatchObject({
      type: "inductor",
      valueNorm: 3.3e-6
    });
  });

  it("returns unknown type when no passive unit is present", () => {
    expect(p("Single Mode 5W Wireless Power Transmitter 20-Pin QFN EP")).toMatchObject({
      type: "unknown",
      valueNorm: null
    });
  });

  it("treats uppercase M in a resistor as mega, not milli", () => {
    expect(p("Res Thick Film 0805 4.7M Ohm 1%")).toMatchObject({
      type: "resistor",
      valueNorm: 4_700_000
    });
  });

  it("normalizes uppercase capacitor prefixes (PF/NF/UF)", () => {
    expect(p("CAP CER 10PF 50V")).toMatchObject({
      type: "capacitor",
      valueNorm: 1e-11
    });
    expect(p("CAP CER 100NF 16V")).toMatchObject({
      type: "capacitor",
      valueNorm: 1e-7
    });
  });
});
