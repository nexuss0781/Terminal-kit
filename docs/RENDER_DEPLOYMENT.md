# Terminal-Kit Render Deployment

Terminal-Kit is a **Render-hosted central terminal control plane**. One Render Web Service hosts the password-protected administrator console and the bearer-protected API for Nexuss AIs. Remote terminal agents join automatically after their provisioning Dockerfile is deployed.

The production deployment does not require Manus OAuth, a browser-held controller key, manually entered instance URLs, manually entered instance names, SQL credentials, Telegram credentials, a ParadoxDB API key, or a ParadoxDB passphrase.

## Required Render Variables

Create a Render **Web Service** from `nexuss0781/Terminal-kit` on branch `main`. Use the repository root and committed `render.yaml` commands.

| Variable | Purpose | Configuration |
| --- | --- | --- |
| `ADMIN_PASSWORD` | Signs the system administrator into the web console. | Set a long, unique value in Render. |
| `CONTROLLER_API_KEY` | Protects `/api/v1/*` for Nexuss AIs and other programmatic clients. | Set a long, unique bearer token in Render. It is not entered in the browser console. |
| `PUBLIC_CONTROLLER_URL` | Embeds the controller’s public HTTPS address in each provisioning Dockerfile. | `https://terminalkit.onrender.com` |
| `JWT_SECRET` | Derives the default ParadoxDB service identity and database encryption passphrase. | Render generates this once; do not change it. |
| `INSTANCE_CREDENTIAL_KEY` | Encrypts issued remote-agent credentials. | Render generates this once; do not change it. |

> Keep `JWT_SECRET` and `INSTANCE_CREDENTIAL_KEY` stable. Rotating either after agents have enrolled can make encrypted data or agent credentials unreadable.

The Blueprint configures the active ParadoxDB resolver automatically:

```text
PARADOX_DOMAIN_RESOLVER_URL=https://paradox-domain.onrender.com/active-domain.json
PARADOX_PROJECT=terminal-kit
```

## Administrator Workflow

Open the controller URL and sign in with `ADMIN_PASSWORD`. The console shows total online CPU, available RAM, free disk, active sessions, and every tracked instance. Click **Download provisioning Dockerfile** and deploy that file to a Render Web Service or another Docker host.

The agent detects `RENDER_EXTERNAL_URL` when running as a Render Web Service and reports that public endpoint to the controller automatically. For another hosting provider or a custom domain, set the agent service’s `INSTANCE_PUBLIC_URL` to its reachable HTTPS endpoint. The agent then sends its endpoint, hostname, operating system, architecture, CPU, RAM, disk, and health heartbeat to Terminal-Kit. Its initial name is generated from its hostname and can be renamed later in the console.

## Nexuss AI API Workflow

Nexuss AIs call the versioned bearer-protected API. They can list the full fleet, read aggregate capacity, select a preferred resource profile, and execute a command:

```bash
curl -H "Authorization: Bearer $CONTROLLER_API_KEY" \
  https://terminalkit.onrender.com/api/v1/inventory

curl -X POST \
  -H "Authorization: Bearer $CONTROLLER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"command":"uname -a","resourcePreference":"memory"}' \
  https://terminalkit.onrender.com/api/v1/commands
```

Valid `resourcePreference` values are `balanced`, `cpu`, `memory`, and `disk`. An explicit `instanceId` still takes precedence when an AI needs to target one known instance.

The unauthenticated liveness endpoint remains:

```text
GET https://terminalkit.onrender.com/api/controller/health
```
