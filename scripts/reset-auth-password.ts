import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { hashPassword } from "../src/auth.js";

const envPath = ".env";
const defaultTtlSeconds = "315360000";

function randomPassword(): string {
  return `pbm-${randomBytes(12).toString("base64url")}`;
}

function randomSecret(): string {
  return randomBytes(32).toString("base64url");
}

function upsertEnvValue(text: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(text)) {
    return text.replace(pattern, line);
  }
  const separator = text.endsWith("\n") || text.length === 0 ? "" : "\n";
  return `${text}${separator}${line}\n`;
}

const password = randomPassword();
const hash = hashPassword(password);
let envText = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";

envText = upsertEnvValue(envText, "AUTH_ENABLED", "true");
envText = upsertEnvValue(envText, "AUTH_PASSWORD_HASH", hash);
envText = upsertEnvValue(envText, "AUTH_TOKEN_SECRET", randomSecret());
envText = upsertEnvValue(envText, "AUTH_TOKEN_TTL_SECONDS", defaultTtlSeconds);
envText = upsertEnvValue(envText, "AUTH_ALLOW_LOCAL_BYPASS", "false");

writeFileSync(envPath, envText, "utf8");

console.log("New PartsBox Manager password:");
console.log(password);
console.log("");
console.log("Updated .env auth settings. Restart the server, then log in again.");
