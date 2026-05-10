import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const SECRET = process.env.CANNES_COIFFEUR_TOKEN_SECRET ?? "change-me-in-env";

export function generateCancellationToken(): string {
  return randomBytes(24).toString("hex");
}

export function signToken(token: string): string {
  const hmac = createHmac("sha256", SECRET);
  hmac.update(token);
  return hmac.digest("hex").slice(0, 16);
}

export function buildPublicToken(token: string): string {
  return `${token}.${signToken(token)}`;
}

export function parsePublicToken(publicToken: string): { token: string; valid: boolean } {
  const [token, signature] = publicToken.split(".");
  if (!token || !signature) return { token: "", valid: false };

  const expected = signToken(token);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return { token, valid: false };

  return { token, valid: timingSafeEqual(sigBuf, expBuf) };
}
