import { describe, expect, it, vi } from "vitest";
import { NexarEnricher } from "../../src/nexar/enricher.js";

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body };
}

describe("NexarEnricher", () => {
  it("returns category text for classification without creating supplier-category tags", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "token", expires_in: 3600 }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            supSearchMpn: {
              results: [
                {
                  part: {
                    mpn: "ADA4051-1AKSZ-R7",
                    shortDescription: "Zero-drift operational amplifier",
                    manufacturer: { name: "Analog Devices" },
                    category: { name: "Amplifiers, Op Amps, Buffer, Instrumentation" }
                  }
                }
              ]
            }
          }
        })
      );
    const enricher = new NexarEnricher({ clientId: "id", clientSecret: "secret", fetchImpl: fetchMock });

    const result = await enricher.enrich({
      raw: "ADA4051-1AKSZ-R7",
      parsed: {
        vendor: "digikey",
        raw: "ADA4051-1AKSZ-R7",
        resolvedPartId: null,
        sourceUrl: null,
        supplierPartNumber: null,
        manufacturerPartNumber: "ADA4051-1AKSZ-R7",
        quantity: 5,
        lotCode: null,
        dateCode: null,
        confidence: 0.9,
        warnings: []
      }
    });

    expect(result).toMatchObject({
      name: "ADA4051-1AKSZ-R7",
      description: "Zero-drift operational amplifier",
      categoryName: "Amplifiers, Op Amps, Buffer, Instrumentation",
      tags: ["nexar"]
    });
    expect(result?.tags?.some((tag) => tag.includes("amplifiers"))).toBe(false);
  });
});
