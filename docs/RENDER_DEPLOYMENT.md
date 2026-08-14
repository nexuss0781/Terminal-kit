# Terminal-Kit Render Deployment

Terminal-Kit is hosted entirely on **Render**: one Render Web Service serves the protected controller API and the small instance-enrollment page. The application does not require Manus, its OAuth service, a SQL database, Telegram credentials, a ParadoxDB API key, or a ParadoxDB passphrase.

## Required Render Variables

Create a **Web Service** from `nexuss0781/Terminal-kit` on branch `main`. Use the repository root and the committed `render.yaml` build/start commands.

| Variable | Value |
| --- | --- |
| `CONTROLLER_API_KEY` | A private high-entropy bearer token. It protects `/api/v1/*` and is entered in the enrollment page when registering an instance. |
| `PUBLIC_CONTROLLER_URL` | The exact Render HTTPS URL, for example `https://terminalkit.onrender.com`. |
| `JWT_SECRET` | Generate a value in Render once and retain it permanently. It derives the controller’s ParadoxDB identity and encrypted database passphrase. |
| `INSTANCE_CREDENTIAL_KEY` | Generate a value in Render once and retain it permanently. It encrypts remote instance credentials. |

> Do not rotate `JWT_SECRET` or `INSTANCE_CREDENTIAL_KEY` after deployment. Changing either one can make existing persisted data or enrolled instance credentials unreadable.

The Blueprint supplies these defaults:

```text
PARADOX_DOMAIN_RESOLVER_URL=https://paradox-domain.onrender.com/active-domain.json
PARADOX_PROJECT=terminal-kit
```

Terminal-Kit resolves the active ParadoxDB gateway through the static resolver, derives its own service identity from `JWT_SECRET`, and provisions the encrypted controller database automatically.

## Deploy and Verify

Deploy the `main` branch, then open the public Render URL. Enter the controller API key, instance name, and public instance URL to generate or deliver the remote Dockerfile communication protocol. The same key can also be used directly with the versioned controller API:

```bash
curl -H "Authorization: Bearer $CONTROLLER_API_KEY" \
  https://terminalkit.onrender.com/api/v1/instances
```

The public liveness endpoint is available without credentials:

```text
GET https://terminalkit.onrender.com/api/controller/health
```
