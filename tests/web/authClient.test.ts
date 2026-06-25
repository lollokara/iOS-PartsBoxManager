import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "../../web/authClient.js";

describe("web auth client", () => {
  it("attaches a bearer token to API requests", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true })
    });
    const storage = {
      getItem: vi.fn().mockReturnValue(JSON.stringify({ token: "abc123", expiresAt: Date.now() + 60_000 })),
      setItem: vi.fn(),
      removeItem: vi.fn()
    };
    const client = createApiClient({ fetchImpl, storage });

    await client.request("/api/meta");

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [, init] = fetchImpl.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer abc123"
    });
  });

  it("clears the stored token after a 401 response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Unauthorized"
    });
    const storage = {
      getItem: vi.fn().mockReturnValue(JSON.stringify({ token: "abc123", expiresAt: Date.now() + 60_000 })),
      setItem: vi.fn(),
      removeItem: vi.fn()
    };
    const client = createApiClient({ fetchImpl, storage });

    await expect(client.request("/api/meta")).rejects.toThrow("authentication required");

    expect(storage.removeItem).toHaveBeenCalledOnce();
  });
});
