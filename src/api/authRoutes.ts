import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  parseBearerToken,
  signAuthToken,
  verifyAuthToken,
  verifyPasswordHash,
  type AuthConfig
} from "../auth.js";

const loginBodySchema = z
  .object({
    password: z.string().min(1)
  })
  .strict();

export function registerAuthRoutes(server: FastifyInstance, auth: AuthConfig): void {
  server.post("/api/auth/login", async (request, reply) => {
    const parsed = loginBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid login payload", details: parsed.error.flatten() });
    }

    if (!auth.enabled) {
      return reply.status(400).send({ error: "authentication is disabled" });
    }

    if (!auth.passwordHash || !auth.tokenSecret) {
      return reply.status(500).send({ error: "authentication is misconfigured" });
    }

    if (!verifyPasswordHash(parsed.data.password, auth.passwordHash)) {
      return reply.status(401).send({ error: "invalid password" });
    }

    const now = Date.now();
    const token = signAuthToken({ secret: auth.tokenSecret, now, ttlSeconds: auth.ttlSeconds });
    return { token, expiresAt: now + auth.ttlSeconds * 1000 };
  });

  server.get("/api/auth/status", async (request) => {
    const token = parseBearerToken(request.headers.authorization);
    if (!token || !auth.tokenSecret) {
      return { enabled: auth.enabled, authenticated: false };
    }

    const verification = verifyAuthToken(token, { secret: auth.tokenSecret });
    if (!verification.valid) {
      return { enabled: auth.enabled, authenticated: false };
    }

    return {
      enabled: auth.enabled,
      authenticated: true,
      expiresAt: verification.expiresAt
    };
  });
}
