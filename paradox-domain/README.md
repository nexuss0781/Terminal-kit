# paradox-domain

`paradox-domain` is a tiny **Render Static Site** resolver for ParadoxDB. It publishes the **currently active ParadoxDB gateway URL** at one stable location. Every integration points only to this resolver; when ParadoxDB moves, rebuild the static site with the new gateway value rather than changing every client.

## Resolver contract

`GET /active-domain.json` returns:

```json
{
  "schemaVersion": 1,
  "gatewayUrl": "https://paradox-db.example.com/v1",
  "ttlSeconds": 60,
  "resolverVersion": "1"
}
```

`gatewayUrl` must be an absolute HTTP(S) URL. `ttlSeconds` controls how long an integration may reuse a validated result. The endpoint is intentionally served with `Cache-Control: no-store` so deployment changes are visible immediately; clients still use the document TTL to prevent a network request before every database operation.

## Build locally

```bash
cd paradox-domain
PARADOX_GATEWAY_URL="https://your-paradox-gateway.example.com/v1" \
PARADOX_RESOLVER_TTL_SECONDS=60 \
PARADOX_RESOLVER_VERSION="2026-08-14" \
node build.mjs
```

The build writes `dist/active-domain.json`. Set the stable published URL in every integration environment:

```text
PARADOX_DOMAIN_RESOLVER_URL=https://your-static-resolver.example.com/active-domain.json
```

When ParadoxDB is redeployed at a new domain, update only `PARADOX_GATEWAY_URL` in the Static Site environment, then select **Save, rebuild, and deploy**. Clients resolve the new endpoint after the existing TTL expires or after a cold start.

## Deploy on Render

The standalone [`render.yaml`](./render.yaml) declares this folder as a Static Site. In the Render setup form, select **Static Site**, set **Root Directory** to `paradox-domain`, **Build Command** to `node build.mjs`, and **Publish Directory** to `dist`. Configure `PARADOX_GATEWAY_URL` in the Static Site environment, then deploy.

> Render environment variables are applied during the static-site build. Changing `PARADOX_GATEWAY_URL` requires **Save, rebuild, and deploy** to publish a new `active-domain.json`. This site publishes the active gateway location only; it does not contain a ParadoxDB API key or database passphrase.

## Endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /active-domain.json` | Active ParadoxDB gateway contract for integrations. |
| `GET /` | Small usage message for the static resolver. |
