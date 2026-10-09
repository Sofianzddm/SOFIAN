import { createHash, createHmac, randomInt, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { useSecureAuthCookies } from "@/lib/nextAuthCookies";

export const RH_SECURE_COOKIE = "rh_secure_ok";
const TTL_SEC = 12 * 60 * 60; // 12 h
const CODE_TTL_MS = 10 * 60 * 1000; // 10 min

function secret() {
  return (
    process.env.NEXTAUTH_SECRET?.trim() ||
    process.env.RH_SECURE_SECRET?.trim() ||
    "glowup-rh-dev-secret"
  );
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function hashOtp(code: string): string {
  return createHash("sha256").update(`${code}:${secret()}`).digest("hex");
}

export function generateOtpCode(): string {
  return String(randomInt(100000, 999999));
}

/** Cookie de session RH renforcée (après OTP). */
export function buildSecureCookieValue(userId: string, expSec?: number): string {
  const exp = expSec ?? Math.floor(Date.now() / 1000) + TTL_SEC;
  const payload = `${userId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function parseSecureCookieValue(
  raw: string | undefined | null
): { userId: string; exp: number } | null {
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [userId, expStr, sig] = parts;
  if (!userId || !expStr || !sig) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return null;
  const payload = `${userId}.${expStr}`;
  const expected = sign(payload);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return { userId, exp };
}

export function secureCookieOptions(maxAge = TTL_SEC) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: useSecureAuthCookies(),
    maxAge,
  };
}

export async function hasRhSecureSession(
  userId: string,
  request?: NextRequest
): Promise<boolean> {
  // Dev / e2e optionnel
  if (process.env.RH_MFA_SKIP === "1") return true;

  let raw: string | undefined;
  if (request) {
    raw = request.cookies.get(RH_SECURE_COOKIE)?.value;
  } else {
    const jar = await cookies();
    raw = jar.get(RH_SECURE_COOKIE)?.value;
  }
  const parsed = parseSecureCookieValue(raw);
  return !!parsed && parsed.userId === userId;
}

export function attachSecureCookie(
  res: NextResponse,
  userId: string
): NextResponse {
  res.cookies.set(
    RH_SECURE_COOKIE,
    buildSecureCookieValue(userId),
    secureCookieOptions()
  );
  return res;
}

export function clearSecureCookie(res: NextResponse): NextResponse {
  res.cookies.set(RH_SECURE_COOKIE, "", { ...secureCookieOptions(0), maxAge: 0 });
  return res;
}

export async function createLoginChallenge(userId: string): Promise<{
  challengeId: string;
  code: string;
  expiresAt: Date;
}> {
  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  // Invalide les challenges ouverts
  await prisma.rhLoginChallenge.updateMany({
    where: { userId, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
  const row = await prisma.rhLoginChallenge.create({
    data: {
      userId,
      codeHash: hashOtp(code),
      expiresAt,
    },
  });
  return { challengeId: row.id, code, expiresAt };
}

export async function verifyLoginChallenge(params: {
  userId: string;
  challengeId: string;
  code: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await prisma.rhLoginChallenge.findFirst({
    where: {
      id: params.challengeId,
      userId: params.userId,
    },
  });
  if (!row) return { ok: false, error: "Code expiré — demande un nouveau code" };
  if (row.consumedAt) return { ok: false, error: "Code déjà utilisé" };
  if (row.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: "Code expiré — demande un nouveau code" };
  }
  if (row.attempts >= 5) {
    return { ok: false, error: "Trop d’essais — demande un nouveau code" };
  }
  await prisma.rhLoginChallenge.update({
    where: { id: row.id },
    data: { attempts: { increment: 1 } },
  });
  const expected = hashOtp(params.code.trim());
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(row.codeHash);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, error: "Code incorrect" };
    }
  } catch {
    return { ok: false, error: "Code incorrect" };
  }
  await prisma.rhLoginChallenge.update({
    where: { id: row.id },
    data: { consumedAt: new Date() },
  });
  return { ok: true };
}
