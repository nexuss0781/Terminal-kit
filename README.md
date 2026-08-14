# Terminal-Kit

**Terminal-Kit is the backend control plane for Nexuss agentic AIs.** It registers remote terminal instances, securely enrolls an instance agent, routes commands, accepts interactive stdin, streams real-time terminal output, records history, and balances work across online instances.

The browser interface is deliberately minimal. It exists only to collect an instance name and URL, then generate and deliver the **Dockerfile as communication protocol**. AI agents should use the authenticated versioned API directly.

## Start here

| Need | Location |
| --- | --- |
| Programmatic controller API | [`docs/API.md`](docs/API.md) |
| Render controller deployment | [`docs/RENDER_DEPLOYMENT.md`](docs/RENDER_DEPLOYMENT.md) |
| Remote instance protocol and Dockerfile deployment | [`docs/REMOTE_INSTANCE_PROTOCOL.md`](docs/REMOTE_INSTANCE_PROTOCOL.md) |
| Machine-readable discovery | `GET /api/v1/openapi.json` |

## Control-plane entry points

| Endpoint family | Consumer | Purpose |
| --- | --- | --- |
| `/api/v1/*` | Nexuss agentic AIs and trusted automation | Versioned authenticated controller API: instances, command sessions, stdin, history, and SSE output. |
| `/api/agent/*` | Generated remote instance agent | Enrollment, heartbeat, resource metrics, stdout/stderr callbacks, and process completion. |
| `/api/controller/health` | Hosting health check | Unauthenticated Render liveness check. |

## Local validation

```bash
pnpm test
pnpm check
pnpm build
```
