import { describe, expect, it, vi } from "vitest";
import { PartsBoxApiClient } from "../../src/partsbox/apiClient.js";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

const STORAGE_ID = "s".repeat(26);

describe("PartsBoxApiClient storage methods", () => {
  it("createStorage posts storage/name and returns the new id", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ "partsbox.status/category": "ok", data: { "storage/id": STORAGE_ID, "storage/name": "Drawer B3" } })
    );
    const client = new PartsBoxApiClient({ apiKey: "k", fetchImpl });
    const result = await client.createStorage({ name: "Drawer B3" });
    expect(result).toEqual({ id: STORAGE_ID, name: "Drawer B3" });
    const [, init] = fetchImpl.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({ "storage/name": "Drawer B3" });
  });

  it("createStorage throws on a non-ok status", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ "partsbox.status/category": "status/error", "partsbox.status/message": "name not unique" })
    );
    const client = new PartsBoxApiClient({ apiKey: "k", fetchImpl });
    await expect(client.createStorage({ name: "dupe" })).rejects.toThrow(/name not unique/);
  });

  it("archiveStorage posts storage/id and validates status", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ "partsbox.status/category": "ok" }));
    const client = new PartsBoxApiClient({ apiKey: "k", fetchImpl });
    await expect(client.archiveStorage(STORAGE_ID)).resolves.toBeUndefined();
    const [, init] = fetchImpl.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({ "storage/id": STORAGE_ID });
  });

  it("getStorageParts returns part sources with quantities", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        "partsbox.status/category": "ok",
        data: [{ "source/part-id": "p".repeat(26), "source/quantity": 5 }]
      })
    );
    const client = new PartsBoxApiClient({ apiKey: "k", fetchImpl });
    const result = await client.getStorageParts(STORAGE_ID);
    expect(result).toEqual([{ partId: "p".repeat(26), quantity: 5 }]);
  });
});
