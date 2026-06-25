import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  pbkdf2Sync
} from "node:crypto";

export interface AuthConfig {
  enabled: boolean;
  passwordHash?: string;
  tokenSecret?: string;
  ttlSeconds: number;
  allowLocalBypass: boolean;
}

export interface SignAuthTokenOptions {
  secret: string;
  now?: number;
  ttlSeconds: number;
}

export interface VerifyAuthTokenOptions {
  secret: string;
  now?: number;
}

export interface VerifyAuthTokenResult {
  valid: boolean;
  reason?: "invalid" | "expired";
  tokenId?: string;
  issuedAt?: number;
  expiresAt?: number;
}

type PasswordHashScheme = "scrypt" | "pbkdf2";

interface ParsedPasswordHash {
  scheme: PasswordHashScheme;
  hash: Buffer;
  salt: Buffer;
  keyLength: number;
  scryptCost?: number;
  scryptBlockSize?: number;
  scryptParallelization?: number;
  pbkdf2Iterations?: number;
  pbkdf2Digest?: string;
}

const DEFAULT_TOKEN_TTL_SECONDS = 86_400;
const DEFAULT_SCRYPT_COST = 16_384;
const DEFAULT_SCRYPT_BLOCK_SIZE = 8;
const DEFAULT_SCRYPT_PARALLELIZATION = 1;
const DEFAULT_PBKDF2_ITERATIONS = 310_000;
const DEFAULT_PBKDF2_DIGEST = "sha256";
const DEFAULT_HASH_KEY_LENGTH = 64;

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === "") return fallback;
  switch (value.trim().toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "on":
      return true;
    case "0":
    case "false":
    case "no":
    case "off":
      return false;
    default:
      return fallback;
  }
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value == null || value.trim() === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`invalid positive integer: ${value}`);
  }
  return parsed;
}

function base64url(input: Buffer | string): string {
  return Buffer.isBuffer(input) ? input.toString("base64url") : Buffer.from(input, "utf8").toString("base64url");
}

function decodeBase64url(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function isSupportedPasswordHash(hash: string): boolean {
  return parsePasswordHash(hash) != null;
}

function parsePasswordHash(hash: string): ParsedPasswordHash | null {
  const parts = hash.split("$");
  const [scheme, ...rest] = parts;
  if (scheme === "scrypt") {
    if (parts.length !== 6) return null;
    const [costRaw, blockSizeRaw, parallelizationRaw, saltRaw, hashRaw] = rest;
    const cost = Number.parseInt(costRaw ?? "", 10);
    const blockSize = Number.parseInt(blockSizeRaw ?? "", 10);
    const parallelization = Number.parseInt(parallelizationRaw ?? "", 10);
    if (![cost, blockSize, parallelization].every((value) => Number.isInteger(value) && value > 0)) return null;
    try {
      return {
        scheme: "scrypt",
        scryptCost: cost,
        scryptBlockSize: blockSize,
        scryptParallelization: parallelization,
        salt: decodeBase64url(saltRaw),
        hash: decodeBase64url(hashRaw),
        keyLength: decodeBase64url(hashRaw).length
      };
    } catch {
      return null;
    }
  }

  if (scheme === "pbkdf2") {
    if (parts.length !== 5) return null;
    const [digest, iterationsRaw, saltRaw, hashRaw] = rest;
    const iterations = Number.parseInt(iterationsRaw ?? "", 10);
    if (!digest || !Number.isInteger(iterations) || iterations <= 0) return null;
    try {
      return {
        scheme: "pbkdf2",
        pbkdf2Digest: digest,
        pbkdf2Iterations: iterations,
        salt: decodeBase64url(saltRaw),
        hash: decodeBase64url(hashRaw),
        keyLength: decodeBase64url(hashRaw).length
      };
    } catch {
      return null;
    }
  }

  return null;
}

function derivePasswordHash(password: string, parsed: ParsedPasswordHash): Buffer {
  if (parsed.scheme === "scrypt") {
    return scryptSync(password, parsed.salt, parsed.keyLength, {
      N: parsed.scryptCost ?? DEFAULT_SCRYPT_COST,
      r: parsed.scryptBlockSize ?? DEFAULT_SCRYPT_BLOCK_SIZE,
      p: parsed.scryptParallelization ?? DEFAULT_SCRYPT_PARALLELIZATION
    });
  }
  return pbkdf2Sync(password, parsed.salt, parsed.pbkdf2Iterations ?? DEFAULT_PBKDF2_ITERATIONS, parsed.keyLength, parsed.pbkdf2Digest ?? DEFAULT_PBKDF2_DIGEST);
}

function timingSafeHexEqual(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}

export function hashPassword(password: string, scheme: PasswordHashScheme = "scrypt"): string {
  const salt = randomBytes(16);
  if (scheme === "pbkdf2") {
    const hash = pbkdf2Sync(password, salt, DEFAULT_PBKDF2_ITERATIONS, DEFAULT_HASH_KEY_LENGTH, DEFAULT_PBKDF2_DIGEST);
    return ["pbkdf2", DEFAULT_PBKDF2_DIGEST, String(DEFAULT_PBKDF2_ITERATIONS), base64url(salt), base64url(hash)].join("$");
  }

  const hash = scryptSync(password, salt, DEFAULT_HASH_KEY_LENGTH, {
    N: DEFAULT_SCRYPT_COST,
    r: DEFAULT_SCRYPT_BLOCK_SIZE,
    p: DEFAULT_SCRYPT_PARALLELIZATION
  });
  return [
    "scrypt",
    String(DEFAULT_SCRYPT_COST),
    String(DEFAULT_SCRYPT_BLOCK_SIZE),
    String(DEFAULT_SCRYPT_PARALLELIZATION),
    base64url(salt),
    base64url(hash)
  ].join("$");
}

export function verifyPasswordHash(password: string, encodedHash: string): boolean {
  const parsed = parsePasswordHash(encodedHash);
  if (!parsed) return false;
  const derived = derivePasswordHash(password, parsed);
  return timingSafeHexEqual(derived, parsed.hash);
}

function signTokenPayload(payloadJson: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadJson).digest("base64url");
}

export function signAuthToken(options: SignAuthTokenOptions): string {
  const now = options.now ?? Date.now();
  const payload = {
    v: 1,
    id: randomBytes(16).toString("base64url"),
    iat: now,
    exp: now + options.ttlSeconds * 1000
  };
  const payloadJson = JSON.stringify(payload);
  const payloadPart = base64url(payloadJson);
  const signaturePart = signTokenPayload(payloadPart, options.secret);
  return ["pbm", payloadPart, signaturePart].join(".");
}

export function verifyAuthToken(token: string, options: VerifyAuthTokenOptions): VerifyAuthTokenResult {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "pbm") {
    return { valid: false, reason: "invalid" };
  }

  const [, payloadPart, signaturePart] = parts;
  let payload: { v?: number; id?: string; iat?: number; exp?: number };
  try {
    payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as typeof payload;
  } catch {
    return { valid: false, reason: "invalid" };
  }

  if (payload.v !== 1 || typeof payload.id !== "string" || typeof payload.iat !== "number" || typeof payload.exp !== "number") {
    return { valid: false, reason: "invalid" };
  }

  const expectedSignature = signTokenPayload(payloadPart, options.secret);
  const actualSignature = decodeBase64url(signaturePart);
  const expectedSignatureBuffer = decodeBase64url(expectedSignature);
  if (!timingSafeHexEqual(actualSignature, expectedSignatureBuffer)) {
    return { valid: false, reason: "invalid" };
  }

  const now = options.now ?? Date.now();
  if (now >= payload.exp) {
    return { valid: false, reason: "expired", tokenId: payload.id, issuedAt: payload.iat, expiresAt: payload.exp };
  }

  return { valid: true, tokenId: payload.id, issuedAt: payload.iat, expiresAt: payload.exp };
}

export function parseBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  return match ? match[1].trim() : null;
}

export function isLocalBypassAddress(address: string | null | undefined): boolean {
  if (!address) return false;
  const normalized = address.trim().toLowerCase();
  if (normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1") return true;
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(normalized)) {
    const octets = normalized.split(".").map((part) => Number.parseInt(part, 10));
    if (octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return false;
    if (octets[0] === 10) return true;
    if (octets[0] === 127) return true;
    if (octets[0] === 169 && octets[1] === 254) return true;
    if (octets[0] === 192 && octets[1] === 168) return true;
    if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true;
    return false;
  }
  if (normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }
  return false;
}

export function loadAuthConfig(env: Record<string, string | undefined>): AuthConfig {
  const passwordHash = env.AUTH_PASSWORD_HASH?.trim() || undefined;
  const enabled = parseBoolean(env.AUTH_ENABLED, Boolean(passwordHash));
  const ttlSeconds = parsePositiveInt(env.AUTH_TOKEN_TTL_SECONDS, DEFAULT_TOKEN_TTL_SECONDS);
  const allowLocalBypass = parseBoolean(env.AUTH_ALLOW_LOCAL_BYPASS, false);
  const tokenSecret = env.AUTH_TOKEN_SECRET?.trim() || undefined;

  if (!enabled) {
    return { enabled: false, ttlSeconds, allowLocalBypass, passwordHash, tokenSecret };
  }

  if (!passwordHash) {
    throw new Error("AUTH_PASSWORD_HASH is required when auth is enabled");
  }
  if (!isSupportedPasswordHash(passwordHash)) {
    throw new Error("AUTH_PASSWORD_HASH must be a supported scrypt or pbkdf2 encoded hash");
  }
  if (!tokenSecret || tokenSecret.length < 32) {
    throw new Error("AUTH_TOKEN_SECRET is required and must be at least 32 characters when auth is enabled");
  }

  return { enabled: true, passwordHash, tokenSecret, ttlSeconds, allowLocalBypass };
}
