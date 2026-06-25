import { describe, expect, it } from "vitest";
import { decodeMpn } from "../../src/mpn/registry.js";

describe("Yageo RC decoder via registry", () => {
  it("decodes RC0603FR-0710KL as 10k 1% 0603", () => {
    expect(decodeMpn("RC0603FR-0710KL")).toEqual({
      type: "resistor",
      valueNorm: 10000,
      tolerance: "±1%",
      package: "0603"
    });
  });

  it("decodes RC0603FR-0722K6L as 22.6k 1%", () => {
    expect(decodeMpn("RC0603FR-0722K6L")).toMatchObject({ valueNorm: 22600, tolerance: "±1%", package: "0603" });
  });

  it("decodes RC0603JR-0710KP as 10k 5%", () => {
    expect(decodeMpn("RC0603JR-0710KP")).toMatchObject({ valueNorm: 10000, tolerance: "±5%" });
  });

  it("returns null for an unrelated MPN", () => {
    expect(decodeMpn("LTC4125EUFD#TRPBF")).toBeNull();
  });
});
