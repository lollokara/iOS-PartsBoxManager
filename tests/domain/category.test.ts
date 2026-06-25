import { describe, expect, it } from "vitest";
import type { RawPart } from "../../src/domain/passive.js";
import { inferPartCategory } from "../../src/domain/category.js";

const part = (over: Partial<RawPart>): RawPart => ({
  partId: "x".repeat(26),
  partType: "linked",
  name: "",
  mpn: "",
  manufacturer: null,
  description: "",
  footprint: "",
  tags: [],
  ...over
});

describe("inferPartCategory", () => {
  it("uses the canonical pbm category tag when present", () => {
    expect(inferPartCategory(part({ tags: ["pbm-category-mosfet"] }))).toMatchObject({
      category: "mosfet",
      section: "active"
    });
  });

  it("infers active parts from name, mpn, description, and tags", () => {
    expect(inferPartCategory(part({ description: "Low dropout regulator", mpn: "TPS7A47" }))).toMatchObject({
      category: "regulator",
      section: "active"
    });
    expect(inferPartCategory(part({ description: "JST connector", tags: ["through-hole"] }))).toMatchObject({
      category: "connector",
      section: "other"
    });
  });

  it("returns uncategorized for a non-passive part without a match", () => {
    expect(inferPartCategory(part({ description: "Mystery assembly" }))).toMatchObject({
      category: "uncategorized",
      section: "other"
    });
  });
});
