/** Erreurs Neon / pool Prisma intermittentes (P1001, P1017, timeout…). */
export function isTransientPrismaError(err: unknown): boolean {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code?: string }).code || "")
      : "";
  if (
    code === "P1001" ||
    code === "P1002" ||
    code === "P1017" ||
    code === "P2024"
  ) {
    return true;
  }
  const m = (err instanceof Error ? err.message : String(err || "")).toLowerCase();
  return (
    m.includes("can't reach database") ||
    m.includes("cant reach database") ||
    m.includes("reach database server") ||
    m.includes("database server is running") ||
    m.includes("server has closed the connection") ||
    m.includes("connection reset") ||
    m.includes("connection pool") ||
    m.includes("timed out fetching a new connection") ||
    m.includes("neon.tech")
  );
}

/** Message UI court — évite le pavé « Invalid `prisma…` invocation ». */
export function rhPrismaUserMessage(err: unknown): string {
  if (isTransientPrismaError(err)) {
    return "Base temporairement indisponible — réessaie dans quelques secondes";
  }
  if (err instanceof Error && err.message) {
    // Coupe le bruit Prisma validation
    const msg = err.message;
    if (msg.includes("Invalid `prisma")) {
      return "Erreur d’enregistrement — réessaie ; si ça continue, contacte Sofian";
    }
    return msg.length > 180 ? `${msg.slice(0, 177)}…` : msg;
  }
  return "Erreur";
}

export async function withPrismaRetry<T>(
  fn: () => Promise<T>,
  opts?: { attempts?: number; delayMs?: number }
): Promise<T> {
  const attempts = opts?.attempts ?? 3;
  const delayMs = opts?.delayMs ?? 400;
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!isTransientPrismaError(e) || i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw last;
}
