import { createHash } from "node:crypto";
import { connect, GatewayClient, type ParadConnection } from "parad";
import { resolveParadoxGateway } from "./domainResolver";
import type { InsertUser, Instance, TerminalEvent, TerminalSession, User } from "./types";

type Row = Record<string, unknown>;
type InstancePatch = Partial<Omit<Instance, "id" | "createdBy" | "createdAt" | "updatedAt">>;
type SessionPatch = Partial<Omit<TerminalSession, "id" | "instanceId" | "createdBy" | "command" | "createdAt" | "updatedAt">>;

const DEFAULT_RESOLVER_URL = "https://paradox-domain.onrender.com/active-domain.json";

const iso = (value = new Date()) => value.toISOString();
const asDate = (value: unknown) => (value ? new Date(String(value)) : null);
const asNumber = (value: unknown) => Number(value ?? 0);

export function normalizeParadoxApiBase(gatewayUrl: string) {
  const normalized = gatewayUrl.replace(/\/+$/, "");
  return normalized.endsWith("/v1") ? normalized : `${normalized}/v1`;
}

export function deriveDefaultParadoxCredentials(secret: string) {
  const identityHash = createHash("sha256").update(`terminal-kit:paradox:identity:${secret}`).digest("hex");
  return {
    email: `terminal-kit-${identityHash.slice(0, 20)}@service.paradoxdb.local`,
    username: `terminal-kit-${identityHash.slice(0, 12)}`,
    database: `terminal-kit-controller-${identityHash.slice(0, 12)}`,
    password: createHash("sha256").update(`terminal-kit:paradox:password:${secret}`).digest("base64url"),
    passphrase: createHash("sha256").update(`terminal-kit:paradox:passphrase:${secret}`).digest("base64url"),
  };
}

async function resolveParadoxApiKey(gatewayUrl: string) {
  if (process.env.PARADOX_API_KEY) return process.env.PARADOX_API_KEY;
  const identitySecret = process.env.JWT_SECRET;
  if (!identitySecret) throw new Error("JWT_SECRET is required to provision the default ParadoxDB service identity");
  const credentials = deriveDefaultParadoxCredentials(identitySecret);
  const gateway = new GatewayClient(gatewayUrl);
  try {
    return (await gateway.login(credentials.email, credentials.password)).api_key;
  } catch {
    return (await gateway.registerEmail(credentials.email, credentials.username, credentials.password)).api_key;
  }
}

function asUser(row: Row): User {
  return {
    id: asNumber(row.id), openId: String(row.openId), name: row.name ? String(row.name) : null,
    email: row.email ? String(row.email) : null, loginMethod: row.loginMethod ? String(row.loginMethod) : null,
    role: row.role === "admin" ? "admin" : "user", createdAt: asDate(row.createdAt) ?? new Date(0),
    updatedAt: asDate(row.updatedAt) ?? new Date(0), lastSignedIn: asDate(row.lastSignedIn) ?? new Date(0),
  };
}

function asInstance(row: Row): Instance {
  return {
    id: asNumber(row.id), createdBy: asNumber(row.createdBy), name: String(row.name), instanceUrl: String(row.instanceUrl),
    status: row.status === "online" || row.status === "offline" ? row.status : "pending",
    enrollmentTokenHash: String(row.enrollmentTokenHash), agentTokenHash: row.agentTokenHash ? String(row.agentTokenHash) : null,
    agentTokenCiphertext: row.agentTokenCiphertext ? String(row.agentTokenCiphertext) : null,
    hostname: row.hostname ? String(row.hostname) : null, agentVersion: row.agentVersion ? String(row.agentVersion) : null,
    osPlatform: row.osPlatform ? String(row.osPlatform) : null, architecture: row.architecture ? String(row.architecture) : null,
    cpuCount: asNumber(row.cpuCount), cpuPercent: asNumber(row.cpuPercent), memoryPercent: asNumber(row.memoryPercent), memoryTotalMb: asNumber(row.memoryTotalMb),
    diskPercent: asNumber(row.diskPercent), diskTotalMb: asNumber(row.diskTotalMb), diskFreeMb: asNumber(row.diskFreeMb),
    activeSessions: asNumber(row.activeSessions), lastSeenAt: asDate(row.lastSeenAt), createdAt: asDate(row.createdAt) ?? new Date(0),
    updatedAt: asDate(row.updatedAt) ?? new Date(0),
  };
}

function asSession(row: Row): TerminalSession {
  return {
    id: String(row.id), instanceId: asNumber(row.instanceId), createdBy: asNumber(row.createdBy), command: String(row.command),
    state: row.state === "running" || row.state === "completed" || row.state === "failed" ? row.state : "queued",
    exitCode: row.exitCode === null || row.exitCode === undefined ? null : asNumber(row.exitCode), startedAt: asDate(row.startedAt),
    completedAt: asDate(row.completedAt), createdAt: asDate(row.createdAt) ?? new Date(0), updatedAt: asDate(row.updatedAt) ?? new Date(0),
  };
}

function asEvent(row: Row): TerminalEvent {
  return {
    id: asNumber(row.id), sessionId: String(row.sessionId), sequence: asNumber(row.sequence),
    kind: row.kind === "stderr" || row.kind === "stdin" || row.kind === "status" ? row.kind : "stdout",
    payload: String(row.payload), createdAt: asDate(row.createdAt) ?? new Date(0),
  };
}

export function createParadoxStore(connection: ParadConnection) {
  const rows = (sql: string, params: unknown[] = []) => connection.execute(sql, params).rows as Row[];
  const one = (sql: string, params: unknown[] = []) => rows(sql, params)[0];

  const initialize = () => {
    connection.execute("PRAGMA foreign_keys = ON");
    connection.execute("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, openId TEXT NOT NULL UNIQUE, name TEXT, email TEXT, loginMethod TEXT, role TEXT NOT NULL DEFAULT 'user', createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, lastSignedIn TEXT NOT NULL)");
    connection.execute("CREATE TABLE IF NOT EXISTS instances (id INTEGER PRIMARY KEY AUTOINCREMENT, createdBy INTEGER NOT NULL, name TEXT NOT NULL, instanceUrl TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', enrollmentTokenHash TEXT NOT NULL, agentTokenHash TEXT, agentTokenCiphertext TEXT, hostname TEXT, agentVersion TEXT, osPlatform TEXT, architecture TEXT, cpuCount INTEGER NOT NULL DEFAULT 0, cpuPercent INTEGER NOT NULL DEFAULT 0, memoryPercent INTEGER NOT NULL DEFAULT 0, memoryTotalMb INTEGER NOT NULL DEFAULT 0, diskPercent INTEGER NOT NULL DEFAULT 0, diskTotalMb INTEGER NOT NULL DEFAULT 0, diskFreeMb INTEGER NOT NULL DEFAULT 0, activeSessions INTEGER NOT NULL DEFAULT 0, lastSeenAt TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, FOREIGN KEY(createdBy) REFERENCES users(id) ON DELETE CASCADE)");
    const columns = rows("PRAGMA table_info(instances)").map(row => String(row.name));
    const addColumn = (name: string, definition: string) => { if (!columns.includes(name)) connection.execute(`ALTER TABLE instances ADD COLUMN ${name} ${definition}`); };
    addColumn("hostname", "TEXT");
    addColumn("agentVersion", "TEXT");
    addColumn("osPlatform", "TEXT");
    addColumn("architecture", "TEXT");
    addColumn("cpuCount", "INTEGER NOT NULL DEFAULT 0");
    addColumn("diskPercent", "INTEGER NOT NULL DEFAULT 0");
    addColumn("diskTotalMb", "INTEGER NOT NULL DEFAULT 0");
    addColumn("diskFreeMb", "INTEGER NOT NULL DEFAULT 0");
    connection.execute("CREATE TABLE IF NOT EXISTS terminalSessions (id TEXT PRIMARY KEY, instanceId INTEGER NOT NULL, createdBy INTEGER NOT NULL, command TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'queued', exitCode INTEGER, startedAt TEXT, completedAt TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, FOREIGN KEY(instanceId) REFERENCES instances(id) ON DELETE CASCADE, FOREIGN KEY(createdBy) REFERENCES users(id) ON DELETE CASCADE)");
    connection.execute("CREATE TABLE IF NOT EXISTS terminalEvents (id INTEGER PRIMARY KEY AUTOINCREMENT, sessionId TEXT NOT NULL, sequence INTEGER NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, createdAt TEXT NOT NULL, FOREIGN KEY(sessionId) REFERENCES terminalSessions(id) ON DELETE CASCADE)");
    connection.execute("CREATE INDEX IF NOT EXISTS instances_createdBy_idx ON instances(createdBy)");
    connection.execute("CREATE INDEX IF NOT EXISTS terminalSessions_instanceId_idx ON terminalSessions(instanceId)");
    connection.execute("CREATE INDEX IF NOT EXISTS terminalEvents_session_idx ON terminalEvents(sessionId, id)");
  };

  const getUserByOpenId = (openId: string) => {
    const row = one("SELECT * FROM users WHERE openId = ?", [openId]);
    return row ? asUser(row) : undefined;
  };
  const getInstanceById = (id: number) => {
    const row = one("SELECT * FROM instances WHERE id = ?", [id]);
    return row ? asInstance(row) : undefined;
  };
  const getSessionById = (id: string) => {
    const row = one("SELECT * FROM terminalSessions WHERE id = ?", [id]);
    return row ? asSession(row) : undefined;
  };

  return {
    close: () => connection.close(),
    push: () => connection.push(),
    initialize,
    upsertUser(values: InsertUser, ownerOpenId?: string) {
      const current = one("SELECT * FROM users WHERE openId = ?", [values.openId]);
      const now = iso(values.lastSignedIn);
      const role = values.role ?? (values.openId === ownerOpenId ? "admin" : current?.role === "admin" ? "admin" : "user");
      if (current) {
        connection.execute("UPDATE users SET name=?, email=?, loginMethod=?, role=?, updatedAt=?, lastSignedIn=? WHERE openId=?", [values.name ?? current.name ?? null, values.email ?? current.email ?? null, values.loginMethod ?? current.loginMethod ?? null, role, now, now, values.openId]);
      } else {
        connection.execute("INSERT INTO users (openId,name,email,loginMethod,role,createdAt,updatedAt,lastSignedIn) VALUES (?,?,?,?,?,?,?,?)", [values.openId, values.name ?? null, values.email ?? null, values.loginMethod ?? null, role, now, now, now]);
      }
      return getUserByOpenId(values.openId)!;
    },
    getUserByOpenId,
    createInstance(values: Pick<Instance, "createdBy" | "name" | "instanceUrl" | "enrollmentTokenHash">) {
      const now = iso();
      connection.execute("INSERT INTO instances (createdBy,name,instanceUrl,enrollmentTokenHash,createdAt,updatedAt) VALUES (?,?,?,?,?,?)", [values.createdBy, values.name, values.instanceUrl, values.enrollmentTokenHash, now, now]);
      return asInstance(one("SELECT * FROM instances WHERE id = last_insert_rowid()")!);
    },
    getInstanceById,
    getInstanceForUser(id: number, userId: number) { const row = one("SELECT * FROM instances WHERE id = ? AND createdBy = ?", [id, userId]); return row ? asInstance(row) : undefined; },
    getInstanceByUrl(instanceUrl: string) { const row = one("SELECT * FROM instances WHERE instanceUrl = ?", [instanceUrl]); return row ? asInstance(row) : undefined; },
    getInstanceByEnrollmentHash(hash: string) { const row = one("SELECT * FROM instances WHERE enrollmentTokenHash = ?", [hash]); return row ? asInstance(row) : undefined; },
    getInstanceByAgentHash(hash: string) { const row = one("SELECT * FROM instances WHERE agentTokenHash = ?", [hash]); return row ? asInstance(row) : undefined; },
    listInstancesForUser(userId: number) { return rows("SELECT * FROM instances WHERE createdBy = ? ORDER BY name", [userId]).map(asInstance); },
    listAllInstances() { return rows("SELECT * FROM instances ORDER BY id").map(asInstance); },
    updateInstance(id: number, values: InstancePatch) {
      const patch = values as Record<string, unknown>;
      const keys = ["name", "instanceUrl", "status", "enrollmentTokenHash", "agentTokenHash", "agentTokenCiphertext", "hostname", "agentVersion", "osPlatform", "architecture", "cpuCount", "cpuPercent", "memoryPercent", "memoryTotalMb", "diskPercent", "diskTotalMb", "diskFreeMb", "activeSessions", "lastSeenAt"].filter(key => patch[key] !== undefined);
      if (keys.length) connection.execute(`UPDATE instances SET ${[...keys.map(key => `${key} = ?`), "updatedAt = ?"].join(", ")} WHERE id = ?`, [...keys.map(key => patch[key] instanceof Date ? iso(patch[key] as Date) : patch[key]), iso(), id]);
      return getInstanceById(id);
    },
    removeInstance(id: number, userId?: number) { connection.execute(userId === undefined ? "DELETE FROM instances WHERE id = ?" : "DELETE FROM instances WHERE id = ? AND createdBy = ?", userId === undefined ? [id] : [id, userId]); },
    markStaleInstancesOffline(maxAgeMs: number) { connection.execute("UPDATE instances SET status = 'offline', updatedAt = ? WHERE status = 'online' AND lastSeenAt IS NOT NULL AND lastSeenAt < ?", [iso(), iso(new Date(Date.now() - maxAgeMs))]); },
    createSession(values: Pick<TerminalSession, "id" | "instanceId" | "createdBy" | "command">) {
      const now = iso();
      connection.execute("INSERT INTO terminalSessions (id,instanceId,createdBy,command,state,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?)", [values.id, values.instanceId, values.createdBy, values.command, "queued", now, now]);
      return getSessionById(values.id)!;
    },
    getSessionById,
    getSessionForUser(id: string, userId: number) { const row = one("SELECT * FROM terminalSessions WHERE id = ? AND createdBy = ?", [id, userId]); return row ? asSession(row) : undefined; },
    listSessionsForInstance(instanceId: number, userId?: number) { return rows(userId === undefined ? "SELECT * FROM terminalSessions WHERE instanceId = ? ORDER BY createdAt DESC" : "SELECT * FROM terminalSessions WHERE instanceId = ? AND createdBy = ? ORDER BY createdAt DESC", userId === undefined ? [instanceId] : [instanceId, userId]).map(asSession); },
    updateSession(id: string, values: SessionPatch) {
      const patch = values as Record<string, unknown>;
      const keys = ["state", "exitCode", "startedAt", "completedAt"].filter(key => patch[key] !== undefined);
      if (keys.length) connection.execute(`UPDATE terminalSessions SET ${[...keys.map(key => `${key} = ?`), "updatedAt = ?"].join(", ")} WHERE id = ?`, [...keys.map(key => patch[key] instanceof Date ? iso(patch[key] as Date) : patch[key]), iso(), id]);
      return getSessionById(id);
    },
    incrementActiveSessions(id: number, increment: number) { connection.execute("UPDATE instances SET activeSessions = MAX(0, activeSessions + ?), updatedAt = ? WHERE id = ?", [increment, iso(), id]); },
    addEvent(values: Omit<TerminalEvent, "id" | "createdAt">) {
      const now = iso();
      connection.execute("INSERT INTO terminalEvents (sessionId,sequence,kind,payload,createdAt) VALUES (?,?,?,?,?)", [values.sessionId, values.sequence, values.kind, values.payload, now]);
      return asEvent(one("SELECT * FROM terminalEvents WHERE id = last_insert_rowid()")!);
    },
    listEvents(sessionId: string) { return rows("SELECT * FROM terminalEvents WHERE sessionId = ? ORDER BY id", [sessionId]).map(asEvent); },
  };
}

export type ParadoxStore = ReturnType<typeof createParadoxStore>;
let storePromise: Promise<ParadoxStore> | undefined;

export async function getParadoxStore() {
  if (!storePromise) {
    storePromise = (async () => {
      const gateway = await resolveParadoxGateway({ resolverUrl: process.env.PARADOX_DOMAIN_RESOLVER_URL ?? DEFAULT_RESOLVER_URL });
      const identitySecret = process.env.JWT_SECRET;
      if (!identitySecret) throw new Error("JWT_SECRET is required for default ParadoxDB persistence");
      const credentials = deriveDefaultParadoxCredentials(identitySecret);
      const apiBase = normalizeParadoxApiBase(gateway.gatewayUrl);
      const apiKey = await resolveParadoxApiKey(apiBase);
      const passphrase = process.env.PARADOX_PASSPHRASE ?? credentials.passphrase;
      const project = process.env.PARADOX_PROJECT ?? "terminal-kit";
      const database = process.env.PARADOX_DATABASE_NAME ?? credentials.database;
      const dbPath = process.env.PARADOX_DB_PATH ?? `/tmp/${database}.db`;
      const url = `parad://${encodeURIComponent(apiKey)}@local/${encodeURIComponent(project)}/${encodeURIComponent(database)}?passphrase=${encodeURIComponent(passphrase)}&gateway=${encodeURIComponent(apiBase)}`;
      const store = createParadoxStore(await connect({ url, dbPath, autoSync: true, pullOnStartup: true }));
      store.initialize();
      return store;
    })().catch(error => { storePromise = undefined; throw error; });
  }
  return storePromise;
}

export async function closeParadoxStore() {
  if (!storePromise) return;
  const store = await storePromise;
  store.close();
  storePromise = undefined;
}
