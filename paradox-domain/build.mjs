import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const outputDirectory = join(root, "dist");

function requiredGatewayUrl(value) {
  if (!value)
    throw new Error(
      "PARADOX_GATEWAY_URL is required to build the active-domain resolver"
    );
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error("PARADOX_GATEWAY_URL must be an absolute HTTP(S) URL");
  return url.toString().replace(/\/$/, "");
}

function resolverTtl(value) {
  const ttl = Number(value ?? "60");
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > 3600) {
    throw new Error(
      "PARADOX_RESOLVER_TTL_SECONDS must be an integer from 1 to 3600"
    );
  }
  return ttl;
}

const document = {
  schemaVersion: 1,
  gatewayUrl: requiredGatewayUrl(process.env.PARADOX_GATEWAY_URL),
  ttlSeconds: resolverTtl(process.env.PARADOX_RESOLVER_TTL_SECONDS),
  resolverVersion: process.env.PARADOX_RESOLVER_VERSION || "1",
};

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await writeFile(
  join(outputDirectory, "active-domain.json"),
  `${JSON.stringify(document, null, 2)}\n`
);
await writeFile(
  join(outputDirectory, "index.html"),
  "<!doctype html><title>ParadoxDB active-domain resolver</title><p>Use <code>/active-domain.json</code>.</p>\n"
);
console.log(`Built active-domain.json for ${document.gatewayUrl}`);
