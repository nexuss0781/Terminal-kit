# Terminal-Kit Route Matrix

Default controller URL: `https://terminalkit.onrender.com`.

## Controller API

Send `Authorization: Bearer <CONTROLLER_API_KEY>` with every `/api/v1/*` request.

| Method | Path | Body | Purpose |
|---|---|---|---|
| `GET` | `/api/v1/openapi.json` | — | Endpoint discovery. |
| `GET` | `/api/v1/health` | — | Controller state. |
| `GET` | `/api/v1/instances` | — | Registered instances. |
| `GET` | `/api/v1/inventory` | — | Probed fleet state and capacity. |
| `POST` | `/api/v1/instances` | `{ name, instanceUrl }` | Provisioning record and Dockerfile. |
| `GET` | `/api/v1/instances/:id` | — | Instance and session summaries. |
| `PATCH` | `/api/v1/instances/:id` | `{ name }` | Rename. |
| `DELETE` | `/api/v1/instances/:id` | — | Remove. |
| `POST` | `/api/v1/instances/:id/block` | — | Block routing. |
| `POST` | `/api/v1/instances/:id/unblock` | — | Unblock and refresh. |
| `POST` | `/api/v1/instances/:id/availability` | — | Refresh endpoint availability. |
| `POST` | `/api/v1/commands` | `{ command, instanceId?, resourcePreference? }` | Start a terminal session. |
| `GET` | `/api/v1/sessions/:id` | — | Session and ordered events. |
| `POST` | `/api/v1/sessions/:id/stdin` | `{ input }` | Deliver terminal input. |
| `GET` | `/api/v1/sessions/:id/stream` | — | SSE `terminal` events. |

`resourcePreference`: `balanced`, `cpu`, `memory`, `disk`.

## Interactive sequence

1. `POST /commands` returns `202` and `data.sessionId`.
2. `GET /sessions/:id/stream` emits `terminal` events.
3. Read the prompt from `stdout`.
4. `POST /sessions/:id/stdin` with one complete input; use `\r` for a line-oriented Enter key.
5. Read the echoed output and next prompt.
6. Repeat one input at a time.
7. Read `GET /sessions/:id` for the final persisted record.

## Agent protocol

The agent receives commands at `/v1/terminal-kit/sessions` and input at `/v1/terminal-kit/sessions/:id/stdin`. It sends self-enrollment, heartbeat, output, and completion callbacks to `/api/agent/*`. Agent output callbacks accept `stdout` and `stderr`; the controller persists `stdin` and `status` events.
