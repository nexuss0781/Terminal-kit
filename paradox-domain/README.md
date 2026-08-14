# paradox-domain

`paradox-domain` is a tiny Docker-deployable static resolver for ParadoxDB. It publishes the **currently active ParadoxDB gateway URL** at one stable location. Every integration points only to this resolver; when ParadoxDB moves, redeploy this container with the new gateway value rather than changing every client.

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

## Build and run

```bash
docker build -t paradox-domain ./paradox-domain

docker run --rm -p 8080:8080 \
  -e PARADOX_GATEWAY_URL="https://your-paradox-gateway.example.com/v1" \
  -e PARADOX_RESOLVER_TTL_SECONDS=60 \
  -e PARADOX_RESOLVER_VERSION="2026-08-14" \
  paradox-domain
```

Set the stable public URL in every integration environment:

```text
PARADOX_DOMAIN_RESOLVER_URL=https://your-static-resolver.example.com/active-domain.json
```

When ParadoxDB is redeployed at a new domain, update only `PARADOX_GATEWAY_URL` and redeploy this container. Clients resolve the new endpoint after the existing TTL expires or after a cold start.

## Deploy on Render

The standalone [`render.yaml`](./render.yaml) deploys this folder as a Docker web service. In Render, select the `paradox-domain` directory as the service root, then provide `PARADOX_GATEWAY_URL` in the protected environment settings. The container exposes port `8080` and Render checks `GET /healthz`.

> This service publishes the active gateway location only; it does not contain a ParadoxDB API key or database passphrase.

## Endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /active-domain.json` | Active ParadoxDB gateway contract for integrations. |
| `GET /healthz` | Container liveness endpoint. |
