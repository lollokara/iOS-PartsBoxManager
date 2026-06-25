import { describe, expect, it } from "vitest";
import { labelRecordSchema, selectedPartSchema } from "../../src/domain/labelRecord.js";

describe("label record schemas", () => {
  it("accepts selected part IDs with source URLs", () => {
    const parsed = selectedPartSchema.parse({
      partId: "e789qkmhpejtb9p49630xawxhd",
      sourceUrl: "https://partsbox.com/lorenzok/parts/e789qkmhpejtb9p49630xawxhd"
    });

    expect(parsed.partId).toBe("e789qkmhpejtb9p49630xawxhd");
  });

  it("rejects invalid compact part IDs", () => {
    expect(() => selectedPartSchema.parse({ partId: "too-short" })).toThrow();
  });

  it("accepts resolved label records", () => {
    const parsed = labelRecordSchema.parse({
      partId: "e789qkmhpejtb9p49630xawxhd",
      pn: "LTM8055MPY#PBF",
      description: "36VIN, 8.5AMP BUCK-BOOST uMODULE Regulator",
      sourceUrl: "https://partsbox.com/lorenzok/parts/e789qkmhpejtb9p49630xawxhd"
    });

    expect(parsed.pn).toBe("LTM8055MPY#PBF");
  });
});
