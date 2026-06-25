import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OverrideStore } from "../../src/overrides/overrideStore.js";

let dir: string;
let store: OverrideStore;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ovr-"));
  store = new OverrideStore(join(dir, "overrides.json"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("OverrideStore", () => {
  it("returns an empty object when the file does not exist", async () => {
    expect(await store.getAll()).toEqual({});
  });

  it("persists and reads back an override", async () => {
    await store.set("p".repeat(26), { type: "resistor", valueNorm: 10000 });
    expect(await store.getAll()).toEqual({ ["p".repeat(26)]: { type: "resistor", valueNorm: 10000 } });
  });

  it("removes an override", async () => {
    const id = "p".repeat(26);
    await store.set(id, { valueNorm: 1 });
    await store.remove(id);
    expect(await store.getAll()).toEqual({});
  });
});
