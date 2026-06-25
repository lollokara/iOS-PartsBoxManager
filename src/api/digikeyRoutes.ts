import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { DigiKeyEnricher } from "../digikey/enricher.js";

const authCodeSchema = z
  .object({
    code: z.string().trim().min(1)
  })
  .strict();

export function registerDigiKeyRoutes(server: FastifyInstance, enricher: DigiKeyEnricher): void {
  server.get("/api/digikey/status", async () => {
    const isEnabled = enricher.isEnabled();
    const isAuthenticated = isEnabled ? await enricher.isAuthenticated() : false;
    return {
      isEnabled,
      isAuthenticated,
      authUrl: isEnabled ? enricher.getAuthUrl() : null
    };
  });

  server.post("/api/digikey/auth-code", async (request, reply) => {
    const parsed = authCodeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid auth code", details: parsed.error.flatten() });
    }

    try {
      await enricher.exchangeCode(parsed.data.code);
      return { ok: true };
    } catch (error: any) {
      server.log.error({ err: error }, "Failed to exchange DigiKey authorization code");
      return reply.status(502).send({ error: "Failed to exchange authorization code", details: error.message });
    }
  });
}
