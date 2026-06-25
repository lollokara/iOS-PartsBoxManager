import { describe, expect, it } from "vitest";
import { assertPartsBoxOk } from "../../src/partsbox/apiClient.js";

describe("assertPartsBoxOk", () => {
  it("passes for category 'ok'", () => {
    expect(() => assertPartsBoxOk({ "partsbox.status/category": "ok" }, "storage/create")).not.toThrow();
  });

  it("passes for category 'status/ok'", () => {
    expect(() => assertPartsBoxOk({ "partsbox.status/category": "status/ok" }, "storage/create")).not.toThrow();
  });

  it("passes when the status field is absent", () => {
    expect(() => assertPartsBoxOk({ data: {} }, "storage/create")).not.toThrow();
  });

  it("throws with the message for a non-ok category", () => {
    expect(() =>
      assertPartsBoxOk(
        { "partsbox.status/category": "status/error", "partsbox.status/message": "name not unique" },
        "storage/create"
      )
    ).toThrow(/storage\/create failed: name not unique/);
  });
});
