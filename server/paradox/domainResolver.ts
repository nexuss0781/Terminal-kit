const MAX_TTL_MS = 3_600_000;
const DEFAULT_TTL_MS = 60_000;

export type ParadoxGatewayResolution = {
  gatewayUrl: string;
  source: "resolver" | "cache" | "fallback";
  resolverVersion?: string;
  expiresAt: number;
};

type ResolverDocument = {
  schemaVersion?: unknown;
  gatewayUrl?: unknown;
  ttlSeconds?: unknown;
  resolverVersion?: unknown;
};

type ResolveOptions = {
  resolverUrl?: string;
  fallbackGatewayUrl?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

let cachedResolution: ParadoxGatewayResolution | undefined;

function validateGatewayUrl(value: unknown) {
  if (typeof value !== "string") throw new Error("Paradox resolver gatewayUrl must be a string");
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Paradox resolver gatewayUrl must use HTTP or HTTPS");
  return url.toString().replace(/\/$/, "");
}

function ttlMilliseconds(value: unknown) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return DEFAULT_TTL_MS;
  return Math.min(MAX_TTL_MS, Math.floor(seconds * 1000));
}

function fallbackResolution(fallbackGatewayUrl: string | undefined, now: number): ParadoxGatewayResolution | undefined {
  if (!fallbackGatewayUrl) return undefined;
  return { gatewayUrl: validateGatewayUrl(fallbackGatewayUrl), source: "fallback", expiresAt: now + DEFAULT_TTL_MS };
}

export async function resolveParadoxGateway(options: ResolveOptions = {}): Promise<ParadoxGatewayResolution> {
  const now = (options.now ?? Date.now)();
  const resolverUrl = options.resolverUrl ?? process.env.PARADOX_DOMAIN_RESOLVER_URL;
  const fallbackGatewayUrl = options.fallbackGatewayUrl ?? process.env.PARADOX_GATEWAY_URL;
  if (cachedResolution && cachedResolution.expiresAt > now) return { ...cachedResolution, source: "cache" };
  if (!resolverUrl) {
    const fallback = fallbackResolution(fallbackGatewayUrl, now);
    if (fallback) return fallback;
    throw new Error("PARADOX_DOMAIN_RESOLVER_URL is required when no PARADOX_GATEWAY_URL fallback is configured");
  }
  try {
    const response = await (options.fetchImpl ?? fetch)(resolverUrl, { headers: { accept: "application/json", "cache-control": "no-cache" }, signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error(`Paradox domain resolver returned ${response.status}`);
    const document = await response.json() as ResolverDocument;
    if (document.schemaVersion !== 1) throw new Error("Unsupported Paradox domain resolver schema version");
    const resolution: ParadoxGatewayResolution = {
      gatewayUrl: validateGatewayUrl(document.gatewayUrl),
      source: "resolver",
      resolverVersion: typeof document.resolverVersion === "string" ? document.resolverVersion : undefined,
      expiresAt: now + ttlMilliseconds(document.ttlSeconds),
    };
    cachedResolution = resolution;
    return resolution;
  } catch (error) {
    const fallback = fallbackResolution(fallbackGatewayUrl, now);
    if (fallback) return fallback;
    throw error;
  }
}

export function clearParadoxGatewayResolverCache() {
  cachedResolution = undefined;
}
