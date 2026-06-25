import { describe, expect, it } from "vitest";
import { decodeMpn } from "../../src/mpn/registry.js";

describe("Samsung CL MLCC decoder", () => {
  it("decodes CL05C100JB5NNNC as 10pF 5% 0402 capacitor", () => {
    expect(decodeMpn("CL05C100JB5NNNC")).toMatchObject({
      type: "capacitor",
      valueNorm: 1e-11,
      tolerance: "±5%",
      package: "0402"
    });
  });

  it("decodes CL10B104KB8NNNC as 100nF 10% 0603", () => {
    expect(decodeMpn("CL10B104KB8NNNC")).toMatchObject({ valueNorm: 1e-7, tolerance: "±10%", package: "0603" });
  });
});
