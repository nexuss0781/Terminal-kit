# Terminal-Kit API Reference

Terminal-Kit is a backend-first terminal control plane for Nexuss agentic AIs. It discovers terminal instances, selects an Active instance, executes commands, exchanges interactive input, streams output, and preserves the complete terminal transaction.

## API families

| Family | Base path | Intended caller | Authentication |
|---|---|---|---|
| Controller API | `/api/v1` | AI agents and integrations | `Authorization: Bearer <CONTROLLER_API_KEY>` |
| Agent protocol | `/api/agent` | Deployed Terminal-Kit agents | Agent bearer token or bootstrap proof |
| Agent service | `/v1/terminal-kit` | Controller-to-agent transport | Agent bearer token where required |
| Administrator API | `/api/admin` | Browser fleet console | Password-created session cookie |
| Controller health | `/api/controller/health` | Service monitoring | None |

> Use the **controller API** for AI work. It returns a durable `sessionId` for every terminal command.

## Controller API setup

```bash
export TERMINAL_KIT_URL="https://terminalkit.onrender.com"
export TERMINAL_KIT_API_KEY="<CONTROLLER_API_KEY>"
```

Every `/api/v1/*` request requires:

```http
Authorization: Bearer <CONTROLLER_API_KEY>
Content-Type: application/json
```

Successful controller responses use `{ "data": ... }`. Errors use:

```json
{
  "error": {
    "status": 409,
    "message": "No Active instance is available for command execution"
  }
}
```

## Controller endpoint map

| Method | Path | Body | Result |
|---|---|---|---|
| `GET` | `/api/v1/openapi.json` | — | Machine-readable OpenAPI discovery document. |
| `GET` | `/api/v1/health` | — | Controller service and runtime state. |
| `GET` | `/api/v1/instances` | — | All registered instances. |
| `GET` | `/api/v1/inventory` | — | Probed fleet health, resources, and capacity. |
| `POST` | `/api/v1/instances` | `{ "name", "instanceUrl" }` | Provisioning record and generated Dockerfile. |
| `GET` | `/api/v1/instances/:id` | — | Instance and persisted session summaries. |
| `PATCH` | `/api/v1/instances/:id` | `{ "name" }` | Renamed instance. |
| `DELETE` | `/api/v1/instances/:id` | — | `204 No Content`. |
| `POST` | `/api/v1/instances/:id/block` | — | Instance marked `blocked`. |
| `POST` | `/api/v1/instances/:id/unblock` | — | Instance restored and availability refreshed. |
| `POST` | `/api/v1/instances/:id/availability` | — | Fresh endpoint availability result. |
| `POST` | `/api/v1/commands` | `{ "command", "instanceId"?, "resourcePreference"? }` | `202` plus `sessionId`. |
| `GET` | `/api/v1/sessions/:id` | — | Session and ordered terminal events. |
| `POST` | `/api/v1/sessions/:id/stdin` | `{ "input" }` | Delivers terminal input. |
| `GET` | `/api/v1/sessions/:id/stream` | — | `terminal` SSE event stream. |

`resourcePreference` accepts `balanced`, `cpu`, `memory`, and `disk`.

## Discover and select an instance

```bash
curl "$TERMINAL_KIT_URL/api/v1/inventory" \
  -H "Authorization: Bearer $TERMINAL_KIT_API_KEY"
```

Select `status: "online"` and `availability: "active"` for a named target. Omit `instanceId` when controller-selected routing is preferred.

An instance contains identity, resources, and health fields:

| Group | Fields |
|---|---|
| Identity | `id`, `name`, `instanceUrl`, `hostname`, `agentVersion`, `osPlatform`, `architecture` |
| Routing | `status`, `availability`, `availabilityHttpStatus`, `availabilityCheckedAt` |
| Resources | `cpuCount`, `cpuPercent`, `memoryPercent`, `memoryTotalMb`, `diskPercent`, `diskTotalMb`, `diskFreeMb`, `activeSessions` |
| Time | `lastSeenAt`, `createdAt`, `updatedAt` |

`status` values are `pending`, `online`, `offline`, and `blocked`. `availability` values are `active`, `idle`, and `unknown`.[1]

## Execute a command

Run on a selected instance:

```bash
curl -X POST "$TERMINAL_KIT_URL/api/v1/commands" \
  -H "Authorization: Bearer $TERMINAL_KIT_API_KEY" \
  -H "Content-Type: application/json" \
  --data '{"instanceId":1,"command":"uname -a && printf ready"}'
```

Run with controller-selected routing:

```bash
curl -X POST "$TERMINAL_KIT_URL/api/v1/commands" \
  -H "Authorization: Bearer $TERMINAL_KIT_API_KEY" \
  -H "Content-Type: application/json" \
  --data '{"command":"nproc && free -m","resourcePreference":"cpu"}'
```

The response is:

```json
{
  "data": {
    "sessionId": "9NeRGQ73SspbTFxrknVn",
    "instanceId": 1,
    "route": "selected instance"
  }
}
```

Persist `sessionId` immediately. It is the handle for streaming, input, history, and final status.

## Stream and complete an interactive terminal session

Open the session stream:

```bash
curl -N "$TERMINAL_KIT_URL/api/v1/sessions/<SESSION_ID>/stream" \
  -H "Authorization: Bearer $TERMINAL_KIT_API_KEY"
```

Every message has `event: terminal` and JSON data:

```text
event: terminal
data: {"sessionId":"...","sequence":1,"kind":"stdout","payload":"PROMPT>","createdAt":"2026-08-15T04:12:04.339Z"}
```

Follow this exact interaction cycle:

1. Receive the prompt in a `stdout` event.
2. Send one complete terminal response.
3. Read the returned `stdout` event.
4. Wait for the next prompt.
5. Send the next response.
6. Finish when the session reports `completed` or `failed`.

For a line-oriented pseudo-terminal prompt, send `\r` as the Enter key:

```bash
curl -X POST "$TERMINAL_KIT_URL/api/v1/sessions/<SESSION_ID>/stdin" \
  -H "Authorization: Bearer $TERMINAL_KIT_API_KEY" \
  -H "Content-Type: application/json" \
  --data '{"input":"alpha\r"}'
```

Read the durable result at any time:

```bash
curl "$TERMINAL_KIT_URL/api/v1/sessions/<SESSION_ID>" \
  -H "Authorization: Bearer $TERMINAL_KIT_API_KEY"
```

`TerminalSession` has `id`, `instanceId`, `command`, `state`, `exitCode`, `startedAt`, `completedAt`, `createdAt`, and `updatedAt`. `state` is `queued`, `running`, `completed`, or `failed`. `TerminalEvent` has `id`, `sessionId`, `sequence`, `kind`, `payload`, and `createdAt`; `kind` is `stdout`, `stderr`, `stdin`, or `status`.[1]

## Instance lifecycle

```bash
# Refresh availability
curl -X POST "$TERMINAL_KIT_URL/api/v1/instances/1/availability" \
  -H "Authorization: Bearer $TERMINAL_KIT_API_KEY"

# Block new command routing
curl -X POST "$TERMINAL_KIT_URL/api/v1/instances/1/block" \
  -H "Authorization: Bearer $TERMINAL_KIT_API_KEY"

# Restore command routing
curl -X POST "$TERMINAL_KIT_URL/api/v1/instances/1/unblock" \
  -H "Authorization: Bearer $TERMINAL_KIT_API_KEY"
```

## Agent protocol

The deployed Docker agent owns the terminal process. The controller creates and retains the per-instance agent credential during enrollment.

### Controller-to-agent service

| Method | Path | Authentication | Purpose |
|---|---|---|---|
| `GET` | `/v1/terminal-kit/health` | None | Agent identity, endpoint, protocol version, and metrics. |
| `POST` | `/v1/terminal-kit/bootstrap` | Bootstrap header | Bootstrap challenge. |
| `POST` | `/v1/terminal-kit/sessions` | Agent bearer token | Starts `{ "sessionId", "command" }`. |
| `POST` | `/v1/terminal-kit/sessions/:id/stdin` | Agent bearer token | Delivers `{ "input" }`. |

### Agent-to-controller callbacks

| Method | Path | Authentication | Purpose |
|---|---|---|---|
| `POST` | `/api/agent/auto-enroll` | Bootstrap proof | Self-registers the deployed agent. |
| `POST` | `/api/agent/enroll` | Enrollment token | Completes provisioning enrollment. |
| `POST` | `/api/agent/heartbeat` | Agent bearer token | Updates identity and resources. |
| `POST` | `/api/agent/sessions/:id/events` | Agent bearer token | Persists `stdout` or `stderr`. |
| `POST` | `/api/agent/sessions/:id/complete` | Agent bearer token | Records exit code and completes the session. |

## Administrator API

The browser administration API uses an HTTP-only signed session created through password login.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/admin/login` | Creates a session from `{ "password" }`. |
| `POST` | `/api/admin/logout` | Clears the session. |
| `GET` | `/api/admin/session` | Returns authentication state. |
| `GET` | `/api/admin/inventory` | Returns probed fleet inventory. |
| `GET` | `/api/admin/instances/:id` | Returns an instance and all transaction sessions with events. |
| `PATCH` | `/api/admin/instances/:id` | Renames an instance. |
| `POST` | `/api/admin/instances/:id/block` | Blocks an instance. |
| `POST` | `/api/admin/instances/:id/unblock` | Unblocks and probes an instance. |
| `POST` | `/api/admin/instances/:id/availability` | Refreshes availability. |
| `DELETE` | `/api/admin/instances/:id` | Deletes an instance. |
| `GET` | `/api/admin/provisioning/dockerfile` | Downloads the self-enrolling Dockerfile. |

## End-to-end AI workflow

1. Read `/api/v1/inventory`.
2. Select an `online` and `active` instance, or select a routing preference.
3. Start the command with `/api/v1/commands`.
4. Save `sessionId`.
5. Subscribe to `/api/v1/sessions/:id/stream`.
6. For every prompt, send one input with `/stdin`, read the returned output, then continue.
7. Read `/api/v1/sessions/:id` and use its `state`, `exitCode`, and ordered events as the final transaction record.

## References

[1]: https://github.com/nexuss0781/Terminal-kit/blob/main/server/paradox/types.ts "Terminal-Kit domain types"
