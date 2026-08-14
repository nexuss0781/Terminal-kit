# Terminal-Kit Deployment on Render

Terminal-Kit deploys as a Node web service using the root-level `render.yaml`. The controller is a **backend-first control plane**; the included frontend is restricted to instance registration and Dockerfile communication delivery. The Blueprint builds the controller with the lockfile, runs the checked-in database migrations before each deploy, starts the Express server, and uses `/api/controller/health` as its health check. Render Blueprints are root-level YAML definitions for service configuration, and native Node services use explicit build and start commands. [1] [2]

> **Use a continuously running Render web-service plan for the controller and every remote instance.** The controller maintains terminal event streams and runs periodic instance health checks. The generated agent also sends heartbeat and terminal callbacks while a session is running.

## Controller environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | MySQL-compatible connection string used by the controller registry, terminal sessions, and ordered terminal events. Configure this as a Render secret rather than committing it. |
| `JWT_SECRET` | Yes | Authentication signing secret required by the existing application authentication layer. The Blueprint can generate it. |
| `INSTANCE_CREDENTIAL_KEY` | Yes | Separate secret used to encrypt remote agent credentials at rest. The Blueprint can generate it. |
| `CONTROLLER_API_KEY` | Yes | Server-only bearer credential required by Nexuss agentic AIs for every `/api/v1/*` control-plane call. Set it through Render’s protected environment settings. |
| `PUBLIC_CONTROLLER_URL` | Yes in production | Public `https://…onrender.com` URL of the controller. It is embedded into generated Dockerfiles so agents can enroll and post output. |
| `VITE_APP_ID` | Yes when the supplied OAuth login is enabled | Client application identifier for the existing sign-in flow. |
| `OAUTH_SERVER_URL` | Yes when the supplied OAuth login is enabled | Backend URL for the existing sign-in flow. |
| `VITE_OAUTH_PORTAL_URL` | Yes when the supplied OAuth login is enabled | Browser sign-in portal URL for the existing sign-in flow. |
| `OWNER_OPEN_ID` | Optional | Existing template owner identifier. When supplied, the matching authenticated user is promoted to the built-in administrator role. |
| `BUILT_IN_FORGE_API_URL` | Optional | Existing template integration endpoint. Terminal-Kit does not require it for instance orchestration. |
| `BUILT_IN_FORGE_API_KEY` | Optional | Existing template integration credential. Terminal-Kit does not require it for instance orchestration. |
| `VITE_ANALYTICS_ENDPOINT` | Optional | Existing template client analytics endpoint. Provide it only if you keep the bundled analytics snippet. |
| `VITE_ANALYTICS_WEBSITE_ID` | Optional | Existing template client analytics website identifier. Provide it only if you keep the bundled analytics snippet. |
| `NODE_ENV` | Yes | Set to `production` by `render.yaml`. |

## Controller deployment

First, push this project, including `render.yaml` and the `drizzle/` migration directory, to a private Git repository. Create a new Blueprint in Render from that repository. Provide the variables marked as secrets through the service’s Environment page; Render supports declaring placeholders with `sync: false` in a Blueprint so the secret value is supplied in the dashboard rather than committed. [3]

After the controller first deploys, copy its public HTTPS URL into `PUBLIC_CONTROLLER_URL` and redeploy once. Ensure that the configured **MySQL-compatible** database is reachable from the controller before the migration step runs; the project schema uses the MySQL Drizzle driver, so a Render PostgreSQL database is not interchangeable. Configure the same `CONTROLLER_API_KEY` in the protected runtime of each trusted Nexuss agent that will call `/api/v1/*`. The controller starts on Render’s assigned `PORT`; the application does not hard-code a production port.

## Remote instance deployment

Register an instance from the controller dashboard by entering its exact public Render URL and name. Terminal-Kit generates a **Dockerfile as communication protocol**, attempts delivery to `${INSTANCE_URL}/v1/terminal-kit/bootstrap`, and opens the same protected Dockerfile for download. The instance acknowledges delivery only after its agent image is running; when the endpoint is not yet deployed, the dashboard displays the generated Dockerfile so you can deploy it manually.

To deploy the downloaded file, create a small private repository containing the downloaded file as `Dockerfile`, then create a Render Docker web service from that repository. The agent image exposes port `8080`, enrolls once using the embedded enrollment credential, measures CPU and memory, receives command-execution requests, and streams stdout and stderr back to the controller. It runs commands inside a pseudo-terminal using `script`, allowing stdin simulation for interactive command-line prompts and keyboard-style input.

> Treat every generated Dockerfile as a secret. It contains a one-time enrollment credential for the named instance. Do not commit it to a public repository or share it outside the intended deployment path.

The controller persists each command, ordered terminal event, timestamp, and exit status. New unpinned command executions route only to online instances, choosing the least-loaded candidate from CPU, memory, and active-session metrics. Selecting a named instance in the command composer deliberately overrides this routing behavior.

## References

[1]: https://render.com/docs/blueprint-spec "Render Blueprint YAML Reference"
[2]: https://render.com/docs/deploy-node-express-app "Render: Deploy a Node Express App"
[3]: https://render.com/docs/configure-environment-variables "Render Environment Variables and Secrets"
