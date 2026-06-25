import { describe, expect, it } from "vitest";
import { overrideInputSchema } from "../../src/domain/passive.js";

describe("overrideInputSchema", () => {
  it("accepts a partial override with a type and value string", () => {
    const parsed = overrideInputSchema.parse({ type: "resistor", value: "10k", tolerance: "±1%" });
    expect(parsed).toEqual({ type: "resistor", value: "10k", tolerance: "±1%" });
  });

  it("rejects an unknown type", () => {
    expect(() => overrideInputSchema.parse({ type: "diode" })).toThrow();
  });

  it("accepts an empty object (clears nothing)", () => {
    expect(overrideInputSchema.parse({})).toEqual({});
  });
});
