# Terminal-Kit Render Deployment

Terminal-Kit uses **ParadoxDB by default**. It creates a dedicated controller identity and encrypted controller database automatically, discovers the active ParadoxDB gateway from the static resolver, and synchronizes its state through ParadoxDB. No SQL database, Telegram credential, ParadoxDB API key, or ParadoxDB passphrase needs to be configured in Render.

## Configure in Render

Create a **Web Service** from `nexuss0781/Terminal-kit` on branch `main`. Use the root directory and let the committed `render.yaml` supply the build and start commands.

| Variable | Value |
| --- | --- |
| `CONTROLLER_API_KEY` | The existing private Terminal-Kit controller bearer key. It protects `/api/v1/*` and seeds the controller’s public API access. |
| `PUBLIC_CONTROLLER_URL` | Set this only after the first deployment to the Render URL, for example `https://terminal-kit-controller.onrender.com`; then redeploy once. |

Render generates and retains `JWT_SECRET` and `INSTANCE_CREDENTIAL_KEY` from the Blueprint. `JWT_SECRET` deterministically seeds the dedicated ParadoxDB service identity, encrypted database name, and encryption passphrase; keep it unchanged after the first deployment.

> **Credential strategy:** Terminal-Kit derives its own ParadoxDB service identity at runtime from `JWT_SECRET`, creates the service identity through the resolved gateway if it does not exist, and keeps the resulting ParadoxDB key in process memory only. Supplying `PARADOX_API_KEY` or `PARADOX_PASSPHRASE` is optional only when you intentionally need to override this default strategy.

The Blueprint sets these defaults automatically:

```text
PARADOX_DOMAIN_RESOLVER_URL=https://paradox-domain.onrender.com/active-domain.json
PARADOX_PROJECT=terminal-kit
```

The resolver returns the active ParadoxDB domain. Terminal-Kit normalizes it to the versioned API base internally and does not expose any ParadoxDB or Telegram credentials to the browser or remote instances.

## Deploy sequence

First deploy the controller. After Render assigns its public URL, set `PUBLIC_CONTROLLER_URL` to that exact HTTPS URL and redeploy. Verify:

```text
GET https://<controller-domain>/api/controller/health
```

Then register remote instances through the included minimal registration page or the protected `/api/v1` API. Each generated instance Dockerfile is a secret because it carries a one-time enrollment credential.
