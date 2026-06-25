import { describe, expect, it, vi } from "vitest";
import { PartsBoxApiClient } from "../../src/partsbox/apiClient.js";

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body };
}

describe("PartsBoxApiClient library calls", () => {
  it("maps part/all into RawPart records", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: [
        {
          "part/id": "a".repeat(26),
          "part/type": "linked",
          "part/name": "RC0603FR-0710KL",
          "part/mpn": "RC0603FR-0710KL",
          "part/manufacturer": "Yageo Group",
          "part/description": "10kΩ 0603",
          "part/footprint": "0603",
          "part/tags": ["smd"]
        }
      ]
    }));
    const client = new PartsBoxApiClient({ apiKey: "k", fetchImpl: fetchMock });
    const parts = await client.getAllParts();
    expect(parts).toMatchObject([
      {
        partId: "a".repeat(26),
        partType: "linked",
        name: "RC0603FR-0710KL",
        mpn: "RC0603FR-0710KL",
        manufacturer: "Yageo Group",
        description: "10kΩ 0603",
        footprint: "0603",
        tags: ["smd"]
      }
    ]);
    expect(fetchMock).toHaveBeenCalledWith("https://api.partsbox.com/api/1/part/all", expect.objectContaining({ method: "POST" }));
  });

  it("builds a storage id -> name map", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: [
        { "storage/id": "s".repeat(26), "storage/name": "Drawer A1" },
        { "storage/id": "t".repeat(26), "storage/name": "Drawer B2" }
      ]
    }));
    const client = new PartsBoxApiClient({ apiKey: "k", fetchImpl: fetchMock });
    const map = await client.getStorageList();
    expect(map.get("s".repeat(26))).toBe("Drawer A1");
    expect(map.get("t".repeat(26))).toBe("Drawer B2");
  });

  it("returns storage sources with quantities", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: [
        { "source/part-id": "a".repeat(26), "source/storage-id": "s".repeat(26), "source/quantity": 42 }
      ]
    }));
    const client = new PartsBoxApiClient({ apiKey: "k", fetchImpl: fetchMock });
    const sources = await client.getPartStorageSources("a".repeat(26));
    expect(sources).toEqual([{ storageId: "s".repeat(26), quantity: 42 }]);
  });
});
