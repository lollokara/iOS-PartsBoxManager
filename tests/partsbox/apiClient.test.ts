import { describe, expect, it, vi } from "vitest";
import { PartsBoxApiClient } from "../../src/partsbox/apiClient.js";

describe("PartsBoxApiClient", () => {
  it("resolves a part through part/get", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          "part/id": "e789qkmhpejtb9p49630xawxhd",
          "part/mpn": "LTM8055MPY#PBF",
          "part/name": "Fallback name",
          "part/description": "36VIN, 8.5AMP BUCK-BOOST uMODULE Regulator"
        },
        "partsbox.status/category": "ok",
        "partsbox.status/message": "OK"
      })
    });

    const client = new PartsBoxApiClient({ apiKey: "partsboxapi_test", fetchImpl: fetchMock });
    const result = await client.getPart("e789qkmhpejtb9p49630xawxhd");

    expect(result).toMatchObject({
      partId: "e789qkmhpejtb9p49630xawxhd",
      pn: "LTM8055MPY#PBF",
      description: "36VIN, 8.5AMP BUCK-BOOST uMODULE Regulator"
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.partsbox.com/api/1/part/get",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "APIKey partsboxapi_test",
          "Content-Type": "application/json"
        }),
        body: JSON.stringify({ "part/id": "e789qkmhpejtb9p49630xawxhd" })
      })
    );
  });

  it("falls back to part/name when part/mpn is missing", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          "part/id": "e789qkmhpejtb9p49630xawxhd",
          "part/name": "LOCAL-PART-1",
          "part/description": "Local description"
        }
      })
    });

    const client = new PartsBoxApiClient({ apiKey: "partsboxapi_test", fetchImpl: fetchMock });
    await expect(client.getPart("e789qkmhpejtb9p49630xawxhd")).resolves.toMatchObject({
      pn: "LOCAL-PART-1"
    });
  });

  it("throws a clear error for failed API responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Unauthorized"
    });

    const client = new PartsBoxApiClient({ apiKey: "bad-key", fetchImpl: fetchMock });

    await expect(client.getPart("e789qkmhpejtb9p49630xawxhd")).rejects.toThrow("PartsBox API failed with 401");
  });
});
