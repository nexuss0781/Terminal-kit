# Terminal-Kit Control-Plane API

Terminal-Kit exposes a **backend-first** control-plane API for Nexuss agentic AIs. A client can register and manage remote instances, send a shell command to a named instance or to the **least-loaded instance**, submit interactive stdin, retrieve persisted command history, and subscribe to real-time stdout and stderr.

> The browser page is not the control surface. It is only the enrollment helper that produces the Dockerfile communication protocol. Use this API for orchestration.

## Authentication and discovery

All `/api/v1` operations require the server-only controller credential:

```http
Authorization: Bearer $CONTROLLER_API_KEY
```

Do not place `CONTROLLER_API_KEY` in browser code, prompts, repositories, or generated Dockerfiles. Read it from the calling agent’s protected environment. The machine-readable reference is available at `GET /api/v1/openapi.json` using the same bearer credential.

```bash
export TERMINAL_KIT_URL="https://your-controller.onrender.com"
export CONTROLLER_API_KEY="<server-only-value>"

curl -sS "$TERMINAL_KIT_URL/api/v1/health" \
  -H "Authorization: Bearer $CONTROLLER_API_KEY"
```

## Controller endpoints

| Method and path | Purpose | Request body | Success response |
| --- | --- | --- | --- |
| `GET /api/v1/health` | Read controller liveness and API version. | — | Controller status. |
| `GET /api/v1/openapi.json` | Discover the versioned API contract. | — | OpenAPI-style document. |
| `GET /api/v1/instances` | List all registered instances with status and resource metrics. | — | `data: Instance[]`. |
| `POST /api/v1/instances` | Register an instance and generate/send the Dockerfile communication protocol. | `name`, `instanceUrl` | Instance, Dockerfile, and delivery status. |
| `GET /api/v1/instances/:instanceId` | Read an instance and its persisted command sessions. | — | Instance and session list. |
| `PATCH /api/v1/instances/:instanceId` | Rename an instance. | `name` | Updated instance. |
| `DELETE /api/v1/instances/:instanceId` | Remove an instance and cascaded terminal history. | — | `204 No Content`. |
| `POST /api/v1/commands` | Execute a command on a selected instance or the least-loaded online instance. | `command`, optional `instanceId` | Session ID, chosen instance, and route. |
| `GET /api/v1/sessions/:sessionId` | Retrieve persisted command, state, exit code, and ordered terminal events. | — | Session and event history. |
| `POST /api/v1/sessions/:sessionId/stdin` | Send stdin simulation to an active interactive process. | `input` | Accepted status. |
| `GET /api/v1/sessions/:sessionId/stream` | Subscribe to server-sent `terminal` events for live stdout and stderr. | — | SSE stream. |

## Register a remote instance

```bash
curl -sS -X POST "$TERMINAL_KIT_URL/api/v1/instances" \
  -H "Authorization: Bearer $CONTROLLER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "nexuss-render-worker-1",
    "instanceUrl": "https://nexuss-render-worker-1.onrender.com"
  }'
```

The result contains `data.dockerfile`. Store it only in the private remote-instance deployment path: it embeds a one-time enrollment credential. `deliveryStatus` is `sent` only when the instance URL acknowledges `POST /v1/terminal-kit/bootstrap`; otherwise it is `pending` and the returned Dockerfile is the deployment artifact.

## Execute, monitor, and interact

Use `instanceId` when the agent must target a specific machine. Omit it to route to the **least-loaded instance**, which considers online status, reported CPU, reported memory, and active session count.

```bash
curl -sS -X POST "$TERMINAL_KIT_URL/api/v1/commands" \
  -H "Authorization: Bearer $CONTROLLER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"command":"npm run health-check"}'
```

The call returns a `sessionId`. Subscribe to the session before or immediately after dispatch to receive event records in real time:

```bash
curl -N "$TERMINAL_KIT_URL/api/v1/sessions/$SESSION_ID/stream" \
  -H "Authorization: Bearer $CONTROLLER_API_KEY"
```

For interactive CLI prompts, send the exact string the process expects, including `\n` when an Enter keypress is required:

```bash
curl -sS -X POST "$TERMINAL_KIT_URL/api/v1/sessions/$SESSION_ID/stdin" \
  -H "Authorization: Bearer $CONTROLLER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"input":"yes\n"}'
```

## AI-agent integration pattern

An agent should keep the controller key in its protected runtime environment and should use the session ID as its durable execution handle. The agent can reconnect to the SSE route after a transport interruption; Terminal-Kit first replays persisted events, then emits new `terminal` events as the remote process writes output.

```ts
const response = await fetch(`${process.env.TERMINAL_KIT_URL}/api/v1/commands`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${process.env.CONTROLLER_API_KEY}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({ command: "your-command-here" }),
});

const { data } = await response.json();
// Persist data.sessionId, then consume /api/v1/sessions/{sessionId}/stream.
```

## Remote agent callback contract

The generated Dockerfile contains the remote agent. It is the only component that should call the controller’s `/api/agent/*` callbacks. These callbacks are authenticated by the encrypted per-instance agent credential, not `CONTROLLER_API_KEY`.

| Remote agent callback | Purpose |
| --- | --- |
| `POST /api/agent/enroll` | Exchanges one-time enrollment credential for agent credential. |
| `POST /api/agent/heartbeat` | Reports CPU, memory, and last-seen state. |
| `POST /api/agent/sessions/:sessionId/events` | Persists stdout or stderr output. |
| `POST /api/agent/sessions/:sessionId/complete` | Persists exit status and releases active-session capacity. |
