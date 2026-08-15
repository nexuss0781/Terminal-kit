---
name: terminal-kit
description: Operate Terminal-Kit control planes for AI-directed terminal work. Use when an agent must discover a terminal instance, run a remote Ubuntu command, follow an interactive prompt, send stdin step by step, consume SSE output, or retrieve durable terminal history.
---

# Terminal-Kit Control Plane

## Overview

Use Terminal-Kit as the terminal execution layer for agent work. Preserve the returned `sessionId` as the durable handle for the full terminal transaction.

## Configure the controller

```bash
export TERMINAL_KIT_URL="https://terminalkit.onrender.com"
export TERMINAL_KIT_API_KEY="<CONTROLLER_API_KEY>"
```

Send `Authorization: Bearer <CONTROLLER_API_KEY>` with every `/api/v1/*` request. Use `/api/v1/openapi.json` for discovery. Read `references/api_reference.md` for the full route matrix and payloads.

## Execute terminal work

1. Read `GET /api/v1/inventory`.
2. Select an instance with `status: "online"` and `availability: "active"`, or choose `balanced`, `cpu`, `memory`, or `disk` routing.
3. Start the command with `POST /api/v1/commands`.
4. Save `data.sessionId` immediately.
5. Open `GET /api/v1/sessions/:sessionId/stream` while the session runs.
6. Process `stdout`, `stderr`, `stdin`, and `status` events in arrival order.
7. Read `GET /api/v1/sessions/:sessionId` after completion. Use its `events`, `state`, and `exitCode` as the final record.

```bash
curl -X POST "$TERMINAL_KIT_URL/api/v1/commands" \
  -H "Authorization: Bearer $TERMINAL_KIT_API_KEY" \
  -H "Content-Type: application/json" \
  --data '{"instanceId":1,"command":"pwd && ls -la"}'
```

## Run interactive terminal sessions

Use the prompt-output-input cycle. Send one complete response, read the resulting output, identify the next prompt, then send the next response.

1. Start a command that presents a prompt.
2. Open its SSE stream and wait for the prompt in a `stdout` event.
3. Send one terminal response through `/stdin`.
4. Use `\r` as the Enter key for a line-oriented pseudo-terminal command.
5. Wait for the returned output and next prompt.
6. Repeat until the final `status` event reports completion.

```bash
curl -X POST "$TERMINAL_KIT_URL/api/v1/sessions/<SESSION_ID>/stdin" \
  -H "Authorization: Bearer $TERMINAL_KIT_API_KEY" \
  -H "Content-Type: application/json" \
  --data '{"input":"alpha\r"}'
```

| Step | Controller call | Verify before the next step |
|---|---|---|
| Start | `POST /commands` | Receive `sessionId`. |
| Observe | `GET /sessions/:id/stream` | Receive the current prompt in `stdout`. |
| Input | `POST /sessions/:id/stdin` | Receive `{ "accepted": true }`. |
| Continue | SSE or `GET /sessions/:id` | Confirm echoed result and next prompt. |
| Complete | `GET /sessions/:id` | Confirm `state` and `exitCode`. |

## Interpret terminal state

| Field | Values | Use |
|---|---|---|
| `status` | `pending`, `online`, `offline`, `blocked` | Instance lifecycle state. |
| `availability` | `active`, `idle`, `unknown` | Endpoint probe state. |
| `state` | `queued`, `running`, `completed`, `failed` | Terminal session lifecycle. |
| `kind` | `stdout`, `stderr`, `stdin`, `status` | Persisted terminal event category. |

Use `online + active` instances for direct command execution. Refresh a selected instance with `POST /api/v1/instances/:id/availability` when current routing state is needed.

## Preserve the transaction record

Retain the `sessionId`, `instanceId`, exact command, ordered events, final `state`, `exitCode`, `completedAt`, and concise output summary. Return the result in this form:

```text
Terminal-Kit session <sessionId> completed on instance <instanceId>.
Exit code: <exitCode>
Result: <concise output summary>
Interactive inputs: <ordered list when used>
```
