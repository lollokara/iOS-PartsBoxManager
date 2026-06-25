import { describe, expect, it } from "vitest";
import { decodeMpn } from "../../src/mpn/registry.js";

describe("TDK C-series decoder", () => {
  it("decodes C3216X7R1C475K160AB as 4.7µF 10% 16V 1206", () => {
    expect(decodeMpn("C3216X7R1C475K160AB")).toMatchObject({
      type: "capacitor",
      valueNorm: 4.7e-6,
      tolerance: "±10%",
      voltage: "16 V",
      package: "1206"
    });
  });

  it("decodes C1608X6S0J106M080AC as 10µF 20% 6.3V 0603", () => {
    expect(decodeMpn("C1608X6S0J106M080AC")).toMatchObject({
      valueNorm: 10e-6,
      tolerance: "±20%",
      voltage: "6.3 V",
      package: "0603"
    });
  });

  it("decodes a sub-10pF R-notation value without producing NaN", () => {
    const r = decodeMpn("C1005C0G1H4R7B080AC");
    expect(r).not.toBeNull();
    expect(Number.isNaN(r!.valueNorm)).toBe(false);
    expect(r!.valueNorm).toBeCloseTo(4.7e-12, 15); // 4.7 pF
  });
});
