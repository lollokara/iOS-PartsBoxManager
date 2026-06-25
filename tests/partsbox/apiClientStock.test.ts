import { describe, expect, it, vi } from "vitest";
import { PartsBoxApiClient } from "../../src/partsbox/apiClient.js";

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body };
}

describe("PartsBoxApiClient stock calls", () => {
  it("reads part lots with optional lot ids", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          {
            "source/storage-id": "s".repeat(26),
            "source/lot-id": "l".repeat(26),
            "source/quantity": 9
          }
        ]
      })
    );
    const client = new PartsBoxApiClient({ apiKey: "k", fetchImpl: fetchMock });

    await expect(client.getPartLots("a".repeat(26))).resolves.toEqual([
      { storageId: "s".repeat(26), lotId: "l".repeat(26), quantity: 9 }
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.partsbox.com/api/1/part/lots",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ "part/id": "a".repeat(26) })
      })
    );
  });

  it("posts part/create when creating a local part", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { "part/id": "b".repeat(26) } }));
    const client = new PartsBoxApiClient({ apiKey: "k", fetchImpl: fetchMock });

    const result = await client.createLocalPart({
      name: "TLV70033DDCR",
      description: "Scanned from DigiKey label",
      tags: ["mobile-scan", "digikey"]
    });

    expect(result).toEqual({ partId: "b".repeat(26) });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.partsbox.com/api/1/part/create",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          "part/type": "local",
          "part/name": "TLV70033DDCR",
          "part/description": "Scanned from DigiKey label",
          "part/tags": ["mobile-scan", "digikey"]
        })
      })
    );
  });

  it("sanitizes unsupported tag characters when creating a local part", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { "part/id": "b".repeat(26) } }));
    const client = new PartsBoxApiClient({ apiKey: "k", fetchImpl: fetchMock });

    await client.createLocalPart({
      name: "ADA4051-1AKSZ-R7",
      tags: ["mobile-scan", "nexar:amplifiers op amps", "  ", "nexar-amplifiers-op-amps"]
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.partsbox.com/api/1/part/create",
      expect.objectContaining({
        body: JSON.stringify({
          "part/type": "local",
          "part/name": "ADA4051-1AKSZ-R7",
          "part/tags": ["mobile-scan", "nexar-amplifiers-op-amps"]
        })
      })
    );
  });

  it("posts stock/add when adding stock", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ partsbox: "ok" }));
    const client = new PartsBoxApiClient({ apiKey: "k", fetchImpl: fetchMock });

    const result = await client.addStock({
      partId: "a".repeat(26),
      storageId: "s".repeat(26),
      quantity: 5,
      note: "restock"
    });

    expect(result).toEqual({ partsbox: "ok" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.partsbox.com/api/1/stock/add",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          "stock/part-id": "a".repeat(26),
          "stock/storage-id": "s".repeat(26),
          "stock/quantity": 5,
          "stock/comments": "restock"
        })
      })
    );
  });

  it("posts stock/remove when removing stock", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ partsbox: "ok" }));
    const client = new PartsBoxApiClient({ apiKey: "k", fetchImpl: fetchMock });

    await client.removeStock({
      partId: "a".repeat(26),
      storageId: "s".repeat(26),
      quantity: 3,
      note: "usage"
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.partsbox.com/api/1/stock/remove",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          "stock/source": {
            "source/part-id": "a".repeat(26),
            "source/storage-id": "s".repeat(26)
          },
          "stock/quantity": 3,
          "stock/comments": "usage"
        })
      })
    );
  });

  it("includes lot id when removing stock from a lot", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ partsbox: "ok" }));
    const client = new PartsBoxApiClient({ apiKey: "k", fetchImpl: fetchMock });

    await client.removeStock({
      partId: "a".repeat(26),
      storageId: "s".repeat(26),
      lotId: "l".repeat(26),
      quantity: 3
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.partsbox.com/api/1/stock/remove",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          "stock/source": {
            "source/part-id": "a".repeat(26),
            "source/storage-id": "s".repeat(26),
            "source/lot-id": "l".repeat(26)
          },
          "stock/quantity": 3
        })
      })
    );
  });

  it("posts part/update when updating tags", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { "part/id": "a".repeat(26) } }));
    const client = new PartsBoxApiClient({ apiKey: "k", fetchImpl: fetchMock });

    await client.updatePartTags({
      partId: "a".repeat(26),
      tags: ["pbm-category-connector", "mobile-scan"]
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.partsbox.com/api/1/part/update",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          "part/id": "a".repeat(26),
          "part/tags": ["pbm-category-connector", "mobile-scan"]
        })
      })
    );
  });

  it("sanitizes unsupported tag characters when updating tags", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { "part/id": "a".repeat(26) } }));
    const client = new PartsBoxApiClient({ apiKey: "k", fetchImpl: fetchMock });

    await client.updatePartTags({
      partId: "a".repeat(26),
      tags: ["pbm-category-connector", "nexar:connector headers"]
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.partsbox.com/api/1/part/update",
      expect.objectContaining({
        body: JSON.stringify({
          "part/id": "a".repeat(26),
          "part/tags": ["pbm-category-connector", "nexar-connector-headers"]
        })
      })
    );
  });

  it("posts part/update when updating default storage", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { "part/id": "a".repeat(26) } }));
    const client = new PartsBoxApiClient({ apiKey: "k", fetchImpl: fetchMock });

    await client.updatePartDefaultStorage({
      partId: "a".repeat(26),
      storageId: "s".repeat(26)
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.partsbox.com/api/1/part/update",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          "part/id": "a".repeat(26),
          "part/default-storage-id": "s".repeat(26)
        })
      })
    );
  });

  it("posts part/delete when deleting a part", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ "partsbox.status/category": "status/ok" }));
    const client = new PartsBoxApiClient({ apiKey: "k", fetchImpl: fetchMock });

    await client.deletePart({ partId: "a".repeat(26) });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.partsbox.com/api/1/part/delete",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          "part/id": "a".repeat(26)
        })
      })
    );
  });
});
