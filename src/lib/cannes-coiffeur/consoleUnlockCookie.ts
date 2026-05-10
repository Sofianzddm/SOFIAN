import { createHash, createHmac, timingSafeEqual } from "crypto";

export const COIFFEUR_CONSOLE_UNLOCK_COOKIE = "coiffeur_console_unlock";

function hmacSecret(): string {
  return (process.env.CANNES_COIFFEUR_CONSOLE_COOKIE_SECRET || process.env.NEXTAUTH_SECRET || "").trim();
}

export function consoleUnlockSecretConfigured(): boolean {
  return hmacSecret().length > 0;
}

export function unlockCookieMaxAgeSec(): number {
  const d = Number(process.env.CANNES_COIFFEUR_CONSOLE_UNLOCK_DAYS ?? "30");
  const days = Number.isFinite(d) && d > 0 ? Math.min(Math.floor(d), 365) : 30;
  return 60 * 60 * 24 * days;
}

export function mintUnlockToken(userId: string): { token: string; maxAgeSec: number } {
  const maxAgeSec = unlockCookieMaxAgeSec();
  const exp = Math.floor(Date.now() / 1000) + maxAgeSec;
  const payload = `${encodeURIComponent(userId)}:${exp}`;
  const sig = createHmac("sha256", hmacSecret()).update(payload).digest("hex");
  return { token: `${payload}.${sig}`, maxAgeSec };
}

export function verifyUnlockToken(token: string | undefined, expectedUserId: string): boolean {
  if (!token || !hmacSecret()) return false;
  const lastDot = token.lastIndexOf(".");
  if (lastDot <= 0 || lastDot >= token.length - 1) return false;
  const payload = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);
  const expectedSig = createHmac("sha256", hmacSecret()).update(payload).digest("hex");
  if (sig.length !== expectedSig.length) return false;
  try {
    if (!timingSafeEqual(Buffer.from(sig, "utf8"), Buffer.from(expectedSig, "utf8"))) return false;
  } catch {
    return false;
  }
  const colon = payload.indexOf(":");
  if (colon <= 0) return false;
  let uid: string;
  try {
    uid = decodeURIComponent(payload.slice(0, colon));
  } catch {
    return false;
  }
  const exp = Number(payload.slice(colon + 1));
  if (uid !== expectedUserId || !Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  return true;
}

/** Comparaison résistante aux timings (longueurs fixées côté digest). */
export function verifyConsolePasswordInput(input: string, expectedFromEnv: string): boolean {
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expectedFromEnv, "utf8").digest();
  return timingSafeEqual(a, b);
}

export function isConsolePasswordConfigured(): boolean {
  return Boolean(process.env.CANNES_COIFFEUR_CONSOLE_PASSWORD?.trim());
}
