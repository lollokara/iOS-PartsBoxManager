import { readFileSync } from "node:fs";
import { hashPassword } from "../src/auth.js";

function parseAlgorithm(argv: string[]): "scrypt" | "pbkdf2" {
  if (argv.includes("--pbkdf2")) return "pbkdf2";
  if (argv.includes("--scrypt") || argv.length === 0) return "scrypt";
  return "scrypt";
}

function main(): void {
  if (process.stdin.isTTY) {
    console.error("Pipe the password on stdin. Example:");
    console.error("  printf '%s' 'your-password' | npm run auth:hash");
    process.exitCode = 1;
    return;
  }

  const password = readFileSync(0, "utf8").trimEnd();
  if (!password) {
    console.error("No password received on stdin.");
    process.exitCode = 1;
    return;
  }

  const algorithm = parseAlgorithm(process.argv.slice(2));
  process.stdout.write(`${hashPassword(password, algorithm)}\n`);
}

main();
