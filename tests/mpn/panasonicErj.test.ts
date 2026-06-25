import { describe, expect, it } from "vitest";
import { decodeMpn } from "../../src/mpn/registry.js";

describe("Panasonic ERJ decoder", () => {
  it("decodes ERJ2GEJ102X as 1k 5% 0402", () => {
    expect(decodeMpn("ERJ2GEJ102X")).toEqual({
      type: "resistor",
      valueNorm: 1000,
      tolerance: "±5%",
      package: "0402"
    });
  });

  it("decodes ERJ3EKF1002V as 10k 1% 0603", () => {
    expect(decodeMpn("ERJ3EKF1002V")).toMatchObject({ valueNorm: 10000, tolerance: "±1%", package: "0603" });
  });

  it("decodes 4-digit codes with a non-zero third significant figure", () => {
    expect(decodeMpn("ERJ3EKF4990V")).toMatchObject({ valueNorm: 499 }); // 499 × 10^0
    expect(decodeMpn("ERJ3EKF2613V")).toMatchObject({ valueNorm: 261000 }); // 261 × 10^3
    expect(decodeMpn("ERJ3EKF1500V")).toMatchObject({ valueNorm: 150 }); // 150 × 10^0
  });
});
