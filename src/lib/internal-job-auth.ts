import type { NextRequest } from "next/server";

/** Auth interne worker/cron (Bearer CRON_SECRET et/ou INTERNAL_JOB_SECRET). */
export function isInternalJobAuth(request: NextRequest): boolean {
  const auth = request.headers.get("authorization") || "";
  const secrets = [
    process.env.CRON_SECRET?.trim(),
    process.env.INTERNAL_JOB_SECRET?.trim(),
  ].filter((s): s is string => Boolean(s));
  // Accepte l’un OU l’autre : le VPS n’a parfois que INTERNAL_JOB_SECRET.
  if (secrets.some((secret) => auth === `Bearer ${secret}`)) return true;
  if (request.headers.get("x-glowup-job-kick") === "1" && secrets.length === 0) {
    return process.env.NODE_ENV !== "production";
  }
  return false;
}

export function appBaseUrl(): string {
  if (process.env.VERCEL_URL?.trim()) {
    return `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, "")}`;
  }
  return (
    process.env.APP_URL?.replace(/\/$/, "") ||
    process.env.NEXTAUTH_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:3000"
  );
}

export function internalJobHeaders(): Record<string, string> {
  const secret =
    process.env.CRON_SECRET?.trim() ||
    process.env.INTERNAL_JOB_SECRET?.trim() ||
    "";
  return {
    "Content-Type": "application/json",
    ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    "x-glowup-job-kick": "1",
  };
}
