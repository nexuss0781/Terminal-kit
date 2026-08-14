# ParadoxDB Gateway Path Verification

Checked on 2026-08-14.

| URL | Result |
| --- | --- |
| `https://paradoxdb.onrender.com/health` | Returns `{"status":"ok"}`. |
| `https://paradoxdb.onrender.com/v1/health` | Returns `404 Not Found`. |

The current resolver value `https://paradoxdb.onrender.com` is therefore the correct live gateway base for this deployment. Versioned application routes are added by clients where required.

The authenticated projects route at `https://paradoxdb.onrender.com/v1/projects` responds with `Missing X-API-Key header`, confirming that the ParadoxDB SDK must use `https://paradoxdb.onrender.com/v1` as its API base.
