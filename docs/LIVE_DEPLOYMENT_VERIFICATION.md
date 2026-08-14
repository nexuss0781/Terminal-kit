# Live Deployment Verification

The deployed controller was verified at `https://terminalkit.onrender.com`.

- The root page previously loaded a standalone manual enrollment form. The self-enrollment release replaces it with a password-only administrator entry point; the browser no longer accepts a controller key, instance name, or instance URL.
- `https://terminalkit.onrender.com/api/controller/health` returns `{"status":"online"}`.
- `GET /api/v1/instances` with the configured controller bearer key returns `200` and an empty persisted registry (`{"data":[]}`).

Set `PUBLIC_CONTROLLER_URL` to `https://terminalkit.onrender.com` in Render, then trigger one redeploy so generated remote-instance Dockerfiles call this live controller address.

## Persistence Incident Evidence

The source revision `7a8eda20` builds without the legacy `requireDb` path. The reported Render stack trace contains that retired path, so it indicates that the live service is running an older deployment artifact rather than a failure originating in the current ParadoxDB controller store. A Render-dashboard inspection was not available from the connected browser session; the service must be redeployed from the current `main` revision before gateway-level ParadoxDB failures can be assessed.

The standalone enrollment refactor was published to `main` as revision `5c4f3dd`. The completed Render deployment was verified: the OAuth dependency is absent from the live enrollment path and the protected controller can read its ParadoxDB-backed registry.

## Self-Enrollment Release

The self-enrollment control-plane revision was published to `main` as `674b7ad`. At the first live check, Render was still waking the service and displayed its application-loading page; this is not a controller error. The follow-up check confirmed that `https://terminalkit.onrender.com/` now serves the password-only **Administrator access** page. It offers Dockerfile-only provisioning and contains no controller API key, instance-name, or instance-URL input.

The public liveness endpoint continues to return `{"status":"online"}`. The new versioned API route correctly rejects unauthenticated requests with `401 Unauthorized`, confirming that the controller bearer-token boundary remains active.
