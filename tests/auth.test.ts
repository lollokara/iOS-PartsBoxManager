import { describe, expect, it } from "vitest";
import {
  hashPassword,
  loadAuthConfig,
  signAuthToken,
  verifyAuthToken,
  verifyPasswordHash
} from "../src/auth.js";

describe("auth primitives", () => {
  it("verifies a password against its encoded hash", () => {
    const hash = hashPassword("correct horse battery staple");

    expect(verifyPasswordHash("correct horse battery staple", hash)).toBe(true);
    expect(verifyPasswordHash("wrong password", hash)).toBe(false);
  });

  it("signs and verifies a bearer token", () => {
    const secret = "x".repeat(32);
    const token = signAuthToken({ secret, now: 1_700_000_000_000, ttlSeconds: 60 });

    expect(verifyAuthToken(token, { secret, now: 1_700_000_000_500 })).toMatchObject({
      valid: true,
      expiresAt: 1_700_000_060_000
    });
  });

  it("rejects an expired bearer token", () => {
    const secret = "x".repeat(32);
    const token = signAuthToken({ secret, now: 1_700_000_000_000, ttlSeconds: 1 });

    expect(verifyAuthToken(token, { secret, now: 1_700_000_002_000 })).toMatchObject({
      valid: false,
      reason: "expired"
    });
  });

  it("enables auth automatically when a password hash is configured", () => {
    const config = loadAuthConfig({
      AUTH_PASSWORD_HASH: hashPassword("pw"),
      AUTH_TOKEN_SECRET: "y".repeat(32)
    });

    expect(config).toMatchObject({
      enabled: true,
      ttlSeconds: 86_400,
      allowLocalBypass: false
    });
  });

  it("rejects enabled auth without a password hash", () => {
    expect(() =>
      loadAuthConfig({
        AUTH_ENABLED: "true",
        AUTH_TOKEN_SECRET: "y".repeat(32)
      })
    ).toThrow("AUTH_PASSWORD_HASH is required when auth is enabled");
  });

  it("rejects enabled auth with a short token secret", () => {
    expect(() =>
      loadAuthConfig({
        AUTH_ENABLED: "true",
        AUTH_PASSWORD_HASH: hashPassword("pw"),
        AUTH_TOKEN_SECRET: "short-secret"
      })
    ).toThrow("AUTH_TOKEN_SECRET is required and must be at least 32 characters when auth is enabled");
  });
});
