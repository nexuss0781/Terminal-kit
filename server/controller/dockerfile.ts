type AgentDockerfileOptions = {
  controllerUrl: string;
  instanceName: string;
  enrollmentToken: string;
};

function escapeDockerValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function generateAgentDockerfile({ controllerUrl, instanceName, enrollmentToken }: AgentDockerfileOptions): string {
  const controller = escapeDockerValue(controllerUrl.replace(/\/$/, ""));
  const name = escapeDockerValue(instanceName);
  const enrollment = escapeDockerValue(enrollmentToken);

  return `# TERMINAL_KIT_PROTOCOL_VERSION=1
FROM node:22-alpine
RUN apk add --no-cache util-linux
WORKDIR /app
ENV CONTROLLER_URL="${controller}" \\
    INSTANCE_NAME="${name}" \\
    ENROLLMENT_TOKEN="${enrollment}" \\
    PORT=8080
RUN cat <<'AGENT' > /app/agent.mjs
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { cpus, freemem, loadavg, totalmem } from "node:os";
import { readFile, writeFile } from "node:fs/promises";

const controllerUrl = (process.env.CONTROLLER_URL || "").replace(/\\/$/, "");
const instanceName = process.env.INSTANCE_NAME || "";
const enrollmentToken = process.env.ENROLLMENT_TOKEN || "";
const port = Number(process.env.PORT || 8080);
let agentToken = process.env.AGENT_TOKEN || "";
let instanceId = "";
let controllerQueue = Promise.resolve();
const sessions = new Map();

async function readText(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}

async function readJson(req) {
  const body = await readText(req);
  return body ? JSON.parse(body) : {};
}

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function authorized(req) {
  return Boolean(agentToken) && req.headers.authorization === "Bearer " + agentToken;
}

function metrics() {
  const totalMemory = totalmem();
  const usedMemory = totalMemory - freemem();
  const cpuCount = Math.max(1, cpus().length);
  return {
    cpuPercent: Math.min(100, Math.round((loadavg()[0] / cpuCount) * 100)),
    memoryPercent: Math.round((usedMemory / totalMemory) * 100),
    memoryTotalMb: Math.round(totalMemory / 1024 / 1024),
  };
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function notifyController(path, body, retries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      if (!controllerUrl || !agentToken) throw new Error("Agent is not enrolled");
      const response = await fetch(controllerUrl + path, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + agentToken },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error("Controller returned " + response.status);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < retries) await wait(attempt * 500);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Controller delivery failed");
}

function queueController(path, body) {
  const report = controllerQueue.then(() => notifyController(path, body));
  controllerQueue = report.catch(error => console.error("Terminal-Kit controller delivery failed:", error.message));
  return report;
}

async function enroll() {
  if (!agentToken) agentToken = await readFile("/app/.agent-token", "utf8").catch(() => "");
  if (!controllerUrl || !instanceName || !enrollmentToken || agentToken) return;
  const response = await fetch(controllerUrl + "/api/agent/enroll", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ instanceName, enrollmentToken, instanceUrl: process.env.INSTANCE_PUBLIC_URL || "" }),
  });
  if (!response.ok) throw new Error("Enrollment failed with " + response.status);
  const data = await response.json();
  agentToken = data.agentToken;
  instanceId = String(data.instanceId);
  await writeFile("/app/.agent-token", agentToken, { mode: 0o600 });
}

async function heartbeat() {
  if (!agentToken) return;
  await queueController("/api/agent/heartbeat", { instanceId, ...metrics() });
}

function launchSession({ sessionId, command }) {
  const child = spawn("script", ["-qfec", command, "/dev/null"], { stdio: ["pipe", "pipe", "pipe"] });
  const session = { child, sequence: 0 };
  sessions.set(sessionId, session);
  const emit = (kind, chunk) => queueController("/api/agent/sessions/" + sessionId + "/events", {
    kind,
    payload: chunk.toString(),
    sequence: ++session.sequence,
  });
  child.stdout.on("data", chunk => { void emit("stdout", chunk); });
  child.stderr.on("data", chunk => { void emit("stderr", chunk); });
  child.on("error", error => { void emit("stderr", error.message); });
  child.on("close", code => {
    sessions.delete(sessionId);
    void queueController("/api/agent/sessions/" + sessionId + "/complete", { exitCode: code ?? 1 });
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://" + req.headers.host);
  if (req.method === "GET" && url.pathname === "/v1/terminal-kit/health") return send(res, 200, { status: "online", ...metrics() });
  if (req.method === "POST" && url.pathname === "/v1/terminal-kit/bootstrap") {
    if (req.headers["x-terminal-kit-enrollment"] !== enrollmentToken) return send(res, 401, { error: "Invalid enrollment credential" });
    const dockerfile = await readText(req);
    if (!dockerfile.includes("TERMINAL_KIT_PROTOCOL_VERSION=1")) return send(res, 400, { error: "Unsupported Dockerfile communication protocol" });
    return send(res, 202, { accepted: true, protocol: "TERMINAL_KIT_PROTOCOL_VERSION=1" });
  }
  if (!authorized(req)) return send(res, 401, { error: "Unauthorized" });
  if (req.method === "POST" && url.pathname === "/v1/terminal-kit/sessions") {
    const body = await readJson(req);
    if (!body.sessionId || !body.command) return send(res, 400, { error: "sessionId and command are required" });
    launchSession(body);
    return send(res, 202, { accepted: true });
  }
  const inputMatch = url.pathname.match(/^\\/v1\\/terminal-kit\\/sessions\\/([^/]+)\\/stdin$/);
  if (req.method === "POST" && inputMatch) {
    const body = await readJson(req);
    const session = sessions.get(inputMatch[1]);
    if (!session) return send(res, 404, { error: "Session not found" });
    session.child.stdin.write(String(body.input ?? ""));
    return send(res, 202, { accepted: true });
  }
  return send(res, 404, { error: "Not found" });
});

async function start() {
  await enroll();
  await heartbeat();
  setInterval(() => { void heartbeat(); }, 30000).unref();
  server.listen(port, "0.0.0.0");
}

start().catch(error => { console.error(error); process.exit(1); });
AGENT
EXPOSE 8080
CMD ["node", "/app/agent.mjs"]
`;
}
