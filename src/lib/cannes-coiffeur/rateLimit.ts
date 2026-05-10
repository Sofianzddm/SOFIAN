interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitEntry>();

interface RateLimitOptions {
  key: string;
  max: number;
  windowMs: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function checkRateLimit(opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const entry = buckets.get(opts.key);

  if (!entry || entry.resetAt < now) {
    const resetAt = now + opts.windowMs;
    buckets.set(opts.key, { count: 1, resetAt });
    return { allowed: true, remaining: opts.max - 1, resetAt };
  }

  if (entry.count >= opts.max) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count += 1;
  return { allowed: true, remaining: opts.max - entry.count, resetAt: entry.resetAt };
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

export function isRateLimitBypassed(ip: string): boolean {
  const raw = process.env.CANNES_COIFFEUR_RATE_LIMIT_BYPASS_IPS?.trim();
  if (!raw) return false;
  const allow = raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  return allow.includes(ip);
}

export function cleanupExpiredBuckets(): void {
  const now = Date.now();
  for (const [key, entry] of buckets.entries()) {
    if (entry.resetAt < now) buckets.delete(key);
  }
}

if (typeof setInterval !== "undefined") {
  setInterval(cleanupExpiredBuckets, 5 * 60 * 1000);
}
