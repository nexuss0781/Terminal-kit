# ParadoxDB Resolver Live Verification

Checked on 2026-08-14.

| URL | Result |
| --- | --- |
| `https://paradox-domain.onrender.com/` | Landing page is live but currently contains only a one-line endpoint hint. |
| `https://paradox-domain.onrender.com/active-domain.json` | Resolver contract is live with schema version `1`, a 60-second TTL, and gateway `https://paradoxdb.onrender.com`. |

The static-site update should improve only the root landing page. The `active-domain.json` document remains the machine-readable integration endpoint.
