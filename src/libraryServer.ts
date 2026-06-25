// src/libraryServer.ts
import { existsSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { Bonjour, type Service } from "bonjour-service";
import dotenv from "dotenv";
import Fastify, { type FastifyInstance } from "fastify";
import { LibraryCache } from "./cache/libraryCache.js";
import { isLocalBypassAddress, loadAuthConfig, parseBearerToken, verifyAuthToken, type AuthConfig } from "./auth.js";
import { OverrideStore } from "./overrides/overrideStore.js";
import { PartsBoxApiClient } from "./partsbox/apiClient.js";
import { SyncService } from "./sync/syncService.js";
import { PendingMutationStore } from "./sync/pendingMutationStore.js";
import { PendingSyncService } from "./sync/pendingSyncService.js";
import { HistoryStore } from "./sync/historyStore.js";
import { registerAuthRoutes } from "./api/authRoutes.js";
import { registerLibraryRoutes } from "./api/libraryRoutes.js";
import { registerMobileRoutes } from "./api/mobileRoutes.js";
import { NexarEnricher } from "./nexar/enricher.js";
import { DigiKeyEnricher } from "./digikey/enricher.js";
import { registerDigiKeyRoutes } from "./api/digikeyRoutes.js";

export interface LibraryServerDeps {
  cache: LibraryCache;
  overrides: OverrideStore;
  sync: SyncService;
  client?: PartsBoxApiClient;
  enricher?: { enrich(input: { raw: string; parsed: any }): Promise<any> };
  digikeyEnricher?: DigiKeyEnricher;
  pendingSync?: PendingSyncService;
  history?: HistoryStore;
  webRoot?: string;
  auth?: AuthConfig;
}

export function buildLibraryServer(deps: LibraryServerDeps): FastifyInstance {
  const server = Fastify({ logger: true });

  const auth: AuthConfig = deps.auth ?? { enabled: false, ttlSeconds: 86_400, allowLocalBypass: false };

  server.register(cors, {
    origin: true,
    allowedHeaders: ["Authorization", "Content-Type"]
  });

  if (auth.enabled) {
    server.addHook("preHandler", async (request, reply) => {
      if (request.method === "OPTIONS") return;

      const pathname = new URL(request.url, "http://localhost").pathname;
      if (!pathname.startsWith("/api/")) return;
      if (pathname === "/api/auth/login" || pathname === "/api/auth/status") return;

      if (auth.allowLocalBypass && isLocalBypassAddress(request.ip)) {
        return;
      }

      const token = parseBearerToken(request.headers.authorization);
      if (!token || !auth.tokenSecret) {
        return reply.status(401).send({ error: "authentication required" });
      }

      const verification = verifyAuthToken(token, { secret: auth.tokenSecret });
      if (!verification.valid) {
        return reply.status(401).send({ error: "authentication required" });
      }
    });
  }

  registerAuthRoutes(server, auth);
  registerLibraryRoutes(server, { cache: deps.cache, overrides: deps.overrides, sync: deps.sync, pendingSync: deps.pendingSync });
  if (deps.digikeyEnricher) {
    registerDigiKeyRoutes(server, deps.digikeyEnricher);
  }
  if (deps.client) {
    registerMobileRoutes(server, {
      cache: deps.cache,
      sync: deps.sync,
      client: deps.client,
      enricher: deps.enricher,
      digikeyEnricher: deps.digikeyEnricher,
      pendingSync: deps.pendingSync,
      overrides: deps.overrides,
      history: deps.history
    });
  }
  if (deps.webRoot && existsSync(deps.webRoot)) {
    server.register(fastifyStatic, { root: deps.webRoot, prefix: "/" });
  }
  return server;
}

export async function startLibrary(): Promise<void> {
  dotenv.config();
  const apiKey = process.env.PARTSBOX_API_KEY;
  if (!apiKey) throw new Error("PARTSBOX_API_KEY is required in .env");
  const auth = loadAuthConfig(process.env);

  const here = dirname(fileURLToPath(import.meta.url));
  const dataDir = process.env.LIBRARY_DATA_DIR ?? join(here, "..", "data");
  const webRoot = process.env.LIBRARY_WEB_ROOT ?? join(here, "..", "web", "dist");
  const port = Number.parseInt(process.env.LIBRARY_PORT ?? "39200", 10);
  const host = process.env.LIBRARY_HOST ?? "0.0.0.0";
  const intervalMs = Number.parseInt(process.env.LIBRARY_SYNC_INTERVAL_MS ?? "1800000", 10);
  const pendingIntervalMs = Number.parseInt(process.env.PENDING_SYNC_INTERVAL_MS ?? "60000", 10);

  const cache = new LibraryCache(join(dataDir, "cache.json"));
  await cache.load();
  const overrides = new OverrideStore(join(dataDir, "overrides.json"));
  const client = new PartsBoxApiClient({ apiKey });

  const digikeyClientId = process.env.DIGIKEY_CLIENT_ID;
  const digikeyClientSecret = process.env.DIGIKEY_CLIENT_SECRET;
  const digikeyEnricher = digikeyClientId && digikeyClientSecret
    ? new DigiKeyEnricher({
        clientId: digikeyClientId,
        clientSecret: digikeyClientSecret,
        redirectUri: process.env.DIGIKEY_REDIRECT_URI || "https://localhost",
        tokenCachePath: join(dataDir, "digikey-token.json")
      })
    : undefined;

  const nexarClientId = process.env.NEXAR_CLIENT_ID;
  const nexarClientSecret = process.env.NEXAR_CLIENT_SECRET;
  const nexarEnricher = nexarClientId && nexarClientSecret ? new NexarEnricher({ clientId: nexarClientId, clientSecret: nexarClientSecret }) : undefined;

  const hasEnricher = Boolean(digikeyEnricher || nexarEnricher);
  const enricher = hasEnricher
    ? {
        async enrich(input: any) {
          if (digikeyEnricher && await digikeyEnricher.isAuthenticated()) {
            const res = await digikeyEnricher.enrich(input);
            if (res) return res;
          }
          if (nexarEnricher) {
            return nexarEnricher.enrich(input);
          }
          return null;
        }
      }
    : undefined;

  const sync = new SyncService({ client, cache, overrides });
  const pendingStore = new PendingMutationStore(join(dataDir, "pending-mutations.json"));
  await pendingStore.load();
  const history = new HistoryStore(join(dataDir, "history.json"));
  await history.load();
  const pendingSync = new PendingSyncService({ store: pendingStore, client, cache, sync, history, logger: serverLoggerBridge() });

  const server = buildLibraryServer({ cache, overrides, sync, client, enricher, digikeyEnricher, pendingSync, history, webRoot, auth });
  let bonjour: Bonjour | null = null;
  let bonjourService: Service | null = null;
  server.addHook("onClose", async () => {
    bonjourService?.stop();
    bonjour?.destroy();
  });

  await sync.sync().catch((err) => server.log.error(err));
  const timer = setInterval(() => {
    pendingSync.flush().then(() => sync.sync()).catch((err) => server.log.error(err));
  }, intervalMs);
  timer.unref();
  const pendingTimer = setInterval(() => {
    pendingSync.flush().catch((err) => server.log.error(err));
  }, pendingIntervalMs);
  pendingTimer.unref();

  await server.listen({ host, port });
  // Advertise a proper ".local" hostname as the SRV target so clients can resolve it via
  // mDNS. bonjour-service auto-publishes matching A/AAAA records for this name. Without the
  // ".local" suffix it defaults to a bare host (e.g. "partboxmanager.") with no resolvable
  // record, and an IP literal target is rejected by iOS, so the service is found but
  // "could not resolve its address".
  const bonjourHost = process.env.LIBRARY_BONJOUR_HOST ?? `${hostname()}.local`;
  bonjour = new Bonjour();
  bonjourService = bonjour.publish({
    name: process.env.LIBRARY_BONJOUR_NAME ?? "PartsBox Manager",
    type: "partsbox-manager",
    protocol: "tcp",
    port,
    ...(bonjourHost ? { host: bonjourHost } : {}),
    txt: {
      api: "/api/mobile/sections"
    }
  });
  server.log.info({ service: "_partsbox-manager._tcp", port }, "published Bonjour service");
}

function serverLoggerBridge(): { info: (value: unknown, message?: string) => void; warn: (value: unknown, message?: string) => void } {
  return {
    info: (value, message) => console.info(JSON.stringify({ level: "info", event: message, ...objectValue(value) })),
    warn: (value, message) => console.warn(JSON.stringify({ level: "warn", event: message, ...objectValue(value) }))
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : { value };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("libraryServer.cjs")) {
  startLibrary().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
