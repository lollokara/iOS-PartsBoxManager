import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { mkdtemp, rm } from "fs/promises";
import { DigiKeyEnricher } from "../../src/digikey/enricher.js";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
}

describe("DigiKeyEnricher", () => {
  let tempDir: string;
  let cachePath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "digikey-test-"));
    cachePath = join(tempDir, "digikey-token.json");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("reports correctly on isEnabled() and getAuthUrl()", () => {
    const defaultEnricher = new DigiKeyEnricher();
    expect(defaultEnricher.isEnabled()).toBe(false);
    expect(defaultEnricher.getAuthUrl()).toBe("");

    const configured = new DigiKeyEnricher({ clientId: "my-id", clientSecret: "my-secret" });
    expect(configured.isEnabled()).toBe(true);
    expect(configured.getAuthUrl()).toContain("my-id");
    expect(configured.getAuthUrl()).toContain(encodeURIComponent("https://localhost"));
  });

  it("exchanges codes and caches tokens", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        access_token: "access123",
        refresh_token: "refresh456",
        expires_in: "1800",
        refresh_token_expires_in: "7776000"
      })
    );

    const enricher = new DigiKeyEnricher({
      clientId: "my-id",
      clientSecret: "my-secret",
      tokenCachePath: cachePath,
      fetchImpl: fetchMock
    });

    const token = await enricher.exchangeCode("auth-code");
    expect(token).toBeDefined();
    expect(token?.accessToken).toBe("access123");
    expect(token?.refreshToken).toBe("refresh456");

    // Verify it saved to disk
    const fileData = await fs.readFile(cachePath, "utf8");
    const saved = JSON.parse(fileData);
    expect(saved.accessToken).toBe("access123");
    expect(saved.refreshToken).toBe("refresh456");

    // Verify authentication status
    expect(await enricher.isAuthenticated()).toBe(true);
  });

  it("handles full URL or query string in exchangeCode", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        access_token: "access123",
        refresh_token: "refresh456",
        expires_in: "1800",
        refresh_token_expires_in: "7776000"
      })
    );

    const enricher = new DigiKeyEnricher({
      clientId: "my-id",
      clientSecret: "my-secret",
      tokenCachePath: cachePath,
      fetchImpl: fetchMock
    });

    // Test with full URL
    await enricher.exchangeCode("https://localhost/?code=aA7gXvHx&scope=");
    expect(fetchMock).toHaveBeenCalled();
    const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    expect(lastCall[1].body.toString()).toContain("code=aA7gXvHx");

    // Test with relative/query string
    await enricher.exchangeCode("?code=bB8hYwIy");
    const lastCall2 = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    expect(lastCall2[1].body.toString()).toContain("code=bB8hYwIy");
  });

  it("automatically refreshes access tokens when expired", async () => {
    const now = Date.now();
    // Save an expired token first
    const expiredToken = {
      accessToken: "expired-access",
      refreshToken: "refresh-token-valid",
      expiresAt: now - 5000, // expired 5s ago
      refreshTokenExpiresAt: now + 100000
    };
    await fs.writeFile(cachePath, JSON.stringify(expiredToken), "utf8");

    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        access_token: "new-access",
        refresh_token: "new-refresh",
        expires_in: 1800,
        refresh_token_expires_in: 7776000
      })
    );

    const enricher = new DigiKeyEnricher({
      clientId: "my-id",
      clientSecret: "my-secret",
      tokenCachePath: cachePath,
      fetchImpl: fetchMock
    });

    const accessToken = await enricher.getAccessToken();
    expect(accessToken).toBe("new-access");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Verify fetch body request was refresh_token
    const callArgs = fetchMock.mock.calls[0];
    expect(callArgs[0]).toBe("https://api.digikey.com/v1/oauth2/token");
    expect(callArgs[1].body.toString()).toContain("grant_type=refresh_token");
    expect(callArgs[1].body.toString()).toContain("refresh_token=refresh-token-valid");
  });

  it("enriches part data using keyword search v4", async () => {
    const now = Date.now();
    // Cache a valid token
    const token = {
      accessToken: "valid-access",
      refreshToken: "valid-refresh",
      expiresAt: now + 500000,
      refreshTokenExpiresAt: now + 1000000
    };
    await fs.writeFile(cachePath, JSON.stringify(token), "utf8");

    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        Products: [
          {
            DigiKeyPartNumber: "296-1014-1-ND",
            ManufacturerPartNumber: "NE555DR",
            ManufacturerName: "Texas Instruments",
            ProductDescription: "IC OSC SINGLE TIMER 100KHZ 8-SOIC",
            Category: { Name: "Clock/Timing - Programmable Timers and Oscillators" }
          }
        ]
      })
    );

    const enricher = new DigiKeyEnricher({
      clientId: "my-id",
      clientSecret: "my-secret",
      tokenCachePath: cachePath,
      fetchImpl: fetchMock
    });

    const result = await enricher.enrich({
      raw: "NE555DR",
      parsed: {
        vendor: "unknown",
        raw: "NE555DR",
        resolvedPartId: null,
        sourceUrl: null,
        supplierPartNumber: null,
        manufacturerPartNumber: "NE555DR",
        quantity: 10,
        lotCode: null,
        dateCode: null,
        confidence: 0.9,
        warnings: []
      }
    });

    expect(result).toMatchObject({
      name: "NE555DR",
      description: "IC OSC SINGLE TIMER 100KHZ 8-SOIC",
      categoryName: "Clock/Timing - Programmable Timers and Oscillators",
      tags: ["digikey"]
    });
    expect(result?.notes).toContain("Manufacturer: Texas Instruments");
    expect(result?.notes).toContain("MPN: NE555DR");
  });
});
