// Reads the repo's .env into process.env without overriding variables already set.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function loadEnv(root = new URL("..", import.meta.url).pathname) {
  const envFile = join(root, ".env");
  if (!existsSync(envFile)) return;
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
}
