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
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="A stable discovery endpoint for the active ParadoxDB gateway.">
    <title>ParadoxDB Domain Resolver</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #09120f; color: #e8f2ed; }
      body { display: grid; min-height: 100vh; margin: 0; place-items: center; padding: 1.5rem; box-sizing: border-box; }
      main { width: min(100%, 42rem); padding: clamp(1.75rem, 5vw, 3.5rem); border: 1px solid #234335; border-radius: 1.25rem; background: #0e1b15; box-shadow: 0 1.5rem 5rem #0008; }
      .eyebrow { color: #75eea7; font: 700 .72rem/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .12em; text-transform: uppercase; }
      h1 { max-width: 12ch; margin: .8rem 0 1rem; font-size: clamp(2rem, 7vw, 4rem); line-height: .96; letter-spacing: -.06em; }
      p { max-width: 58ch; color: #aec5b8; line-height: 1.6; }
      section { margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid #234335; }
      h2 { margin: 0 0 .6rem; font-size: 1rem; }
      code, a { color: #8cf5b6; }
      code { display: inline-block; padding: .2rem .45rem; border-radius: .35rem; background: #13291e; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
      a { text-underline-offset: .2em; }
    </style>
  </head>
  <body>
    <main>
      <div class="eyebrow">ParadoxDB infrastructure</div>
      <h1>One stable address.</h1>
      <p>This static site helps integrations discover the active ParadoxDB gateway, even when the database service moves to a new domain.</p>
      <section>
        <h2>Usage</h2>
        <p>Set your integration’s resolver URL to <code>/active-domain.json</code>, fetch it before connecting, and use the returned <code>gatewayUrl</code>.</p>
        <a href="/active-domain.json">Open the active resolver document</a>
      </section>
    </main>
  </body>
</html>
`
);
console.log(`Built active-domain.json for ${document.gatewayUrl}`);
