# Live Deployment Verification

The deployed controller was verified at `https://terminalkit.onrender.com`.

- The root page loads the Instance Enrollment sign-in screen.
- `https://terminalkit.onrender.com/api/controller/health` returns `{"status":"online"}`.

Set `PUBLIC_CONTROLLER_URL` to `https://terminalkit.onrender.com` in Render, then trigger one redeploy so generated remote-instance Dockerfiles call this live controller address.

## Persistence Incident Evidence

The source revision `7a8eda20` builds without the legacy `requireDb` path. The reported Render stack trace contains that retired path, so it indicates that the live service is running an older deployment artifact rather than a failure originating in the current ParadoxDB controller store. A Render-dashboard inspection was not available from the connected browser session; the service must be redeployed from the current `main` revision before gateway-level ParadoxDB failures can be assessed.
