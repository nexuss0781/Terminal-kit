# ParadoxDB Active-Domain Resolution

ParadoxDB can be deployed at a different domain over time. Terminal-Kit therefore does not need to hard-code a gateway domain. Instead, integrations resolve `PARADOX_DOMAIN_RESOLVER_URL` first, read its `active-domain.json`, validate the returned gateway URL, and then connect to the active ParadoxDB endpoint.

The deployable resolver lives at [`paradox-domain/`](../paradox-domain/). It is a standalone Render Static Site, separate from the Terminal-Kit controller. Its build reads `PARADOX_GATEWAY_URL` and emits the current `active-domain.json` document.

## Integration algorithm

| Step | Behavior |
| --- | --- |
| 1. Resolve | Request the configured `PARADOX_DOMAIN_RESOLVER_URL`. |
| 2. Validate | Require resolver schema version `1` and an absolute HTTP(S) `gatewayUrl`. |
| 3. Cache | Reuse the validated gateway for the resolver-provided `ttlSeconds`, capped at one hour. |
| 4. Fall back | If the resolver is unavailable, use `PARADOX_GATEWAY_URL` only when explicitly configured. |
| 5. Fail safely | If neither a resolver result nor fallback exists, refuse to create a ParadoxDB connection. |

This approach lets an operator move ParadoxDB by setting a new `PARADOX_GATEWAY_URL` on the `paradox-domain` Static Site and selecting **Save, rebuild, and deploy**; every correctly configured integration observes the new gateway after its TTL expires.
