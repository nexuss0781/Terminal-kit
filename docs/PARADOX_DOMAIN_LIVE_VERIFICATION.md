# ParadoxDB Resolver Live Verification

Checked on 2026-08-14.

| URL | Result |
| --- | --- |
| `https://paradox-domain.onrender.com/` | Landing page is live but currently contains only a one-line endpoint hint. |
| `https://paradox-domain.onrender.com/active-domain.json` | Resolver contract is live with schema version `1`, a 60-second TTL, and gateway `https://paradoxdb.onrender.com`. |

The static-site update should improve only the root landing page. The `active-domain.json` document remains the machine-readable integration endpoint.

## Post-deployment verification

After the `f321ead` deployment, the root page presents the concise **One stable address.** purpose statement, a short explanation of gateway discovery, and a direct link to the resolver document. The static site remains focused on resolver purpose and integration usage.

The post-deployment `active-domain.json` check confirms schema version `1`, the gateway `https://paradoxdb.onrender.com`, and a 60-second TTL remain available to integrations.
