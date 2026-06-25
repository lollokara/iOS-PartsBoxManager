#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { join } from "node:path";

const port = process.env.LIBRARY_PORT ?? "39200";
const skipBuild = process.argv.includes("--skip-build");

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env: process.env });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

function localIPv4Addresses() {
  return Object.values(networkInterfaces())
    .flatMap((items) => items ?? [])
    .filter((item) => item.family === "IPv4" && !item.internal)
    .map((item) => item.address);
}

if (!existsSync(".env")) {
  console.warn("No .env file found. Create one with PARTSBOX_API_KEY before starting the server.");
}

if (!skipBuild && !existsSync(join("web", "dist", "app.js"))) {
  console.log("Building web assets...");
  await run("npm", ["run", "build:web"]);
}

console.log(`Starting PartsBox mobile server on port ${port}`);
console.log("Bonjour service: _partsbox-manager._tcp");
for (const address of localIPv4Addresses()) {
  console.log(`LAN URL: http://${address}:${port}`);
}

const child = spawn("npm", ["run", "dev:library"], {
  stdio: "inherit",
  env: process.env
});

process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exitCode = code ?? 0;
});
