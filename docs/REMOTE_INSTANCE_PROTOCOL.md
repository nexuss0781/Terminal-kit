# Remote Instance Dockerfile Communication Protocol

Terminal-Kit creates a dedicated Dockerfile for every instance registration. It is the **Dockerfile as communication protocol**: it contains the selected instance name, central controller URL, and a cryptographically generated one-time enrollment credential. The registered instance uses the credential exactly once to obtain its runtime agent token.

## Registration handshake

| Stage | Controller action | Instance action |
| --- | --- | --- |
| 1. Register | The dashboard accepts the instance name and public URL. | The URL is retained in the controller registry with `pending` status. |
| 2. Deliver | The controller sends the generated Dockerfile to `POST /v1/terminal-kit/bootstrap` at the supplied URL and opens the same file for download. | A running agent validates the protocol marker and enrollment header before acknowledging delivery. |
| 3. Deploy | The downloaded Dockerfile is deployed as the remote instance’s container image. | The agent enrolls against `/api/agent/enroll` and receives a private agent token. |
| 4. Operate | The controller requests commands, sends stdin, records output, and runs health checks. | The agent streams stdout and stderr, accepts stdin, reports completion, and posts heartbeat metrics. |

## Deploying a remote instance on Render

Create a **private** repository with the generated file named exactly `Dockerfile`, then create a Render Docker web service from that repository. Render supports Docker-backed Blueprint services and Dockerfiles, with the container command taken from the Dockerfile unless overridden. [1]

Set `INSTANCE_PUBLIC_URL` on the remote service to its final public HTTPS URL. The generated Dockerfile already includes `CONTROLLER_URL`, `INSTANCE_NAME`, and the private enrollment credential. Do not change those generated values. The agent listens on port `8080`, so make sure Render routes the service to that container port.

The remote agent’s public protocol routes are as follows:

| Route | Method | Authentication | Purpose |
| --- | --- | --- | --- |
| `/v1/terminal-kit/bootstrap` | `POST` | One-time enrollment credential in `x-terminal-kit-enrollment` | Verifies receipt of the Dockerfile communication protocol. |
| `/v1/terminal-kit/health` | `GET` | Agent bearer token | Returns online status plus CPU and memory metrics. |
| `/v1/terminal-kit/sessions` | `POST` | Agent bearer token | Starts a shell command in a pseudo-terminal session. |
| `/v1/terminal-kit/sessions/:sessionId/stdin` | `POST` | Agent bearer token | Sends stdin simulation to the running process. |

> The generated agent uses the `script` utility to create a pseudo-terminal. This enables interactive CLI prompts and keyboard-style stdin interactions. It does **not** grant the controller access to the host outside the remote agent container.

For safe operation, expose an agent only over HTTPS, keep the generated Dockerfile private, and rotate the instance by deleting and registering it again if the enrollment file is exposed. The controller stores the long-lived agent credential encrypted and stores only credential hashes for lookup.

## Reference

[1]: https://render.com/docs/blueprint-spec "Render Blueprint YAML Reference"
