import { describe, expect, it } from "vitest";
import { extractPartIdFromUrl } from "../../src/partsbox/url.js";

describe("extractPartIdFromUrl", () => {
  it("extracts the compact part ID from a PartsBox part URL", () => {
    expect(extractPartIdFromUrl("https://partsbox.com/lorenzok/parts/e789qkmhpejtb9p49630xawxhd")).toBe(
      "e789qkmhpejtb9p49630xawxhd"
    );
  });

  it("ignores query strings and fragments", () => {
    expect(
      extractPartIdFromUrl("https://partsbox.com/lorenzok/parts/e789qkmhpejtb9p49630xawxhd?tab=stock#top")
    ).toBe("e789qkmhpejtb9p49630xawxhd");
  });

  it("returns null for non-part URLs", () => {
    expect(extractPartIdFromUrl("https://partsbox.com/lorenzok/projects")).toBeNull();
  });
});
