/**
 * Vérification email légère (sans service externe) :
 * 1. syntaxe
 * 2. enregistrements MX
 * 3. sonde SMTP RCPT TO (si le réseau le permet — souvent bloqué sur Vercel)
 * 4. détection catch-all (adresse aléatoire acceptée → indéterminé)
 */

import { resolveMx, resolveTxt } from "node:dns/promises";
import net from "node:net";

export type EmailVerifyStatus =
  | "valid"
  | "invalid"
  | "catch_all"
  | "no_mx"
  | "unknown";

export type EmailVerifyResult = {
  email: string;
  status: EmailVerifyStatus;
  /** Libellé FR pour l'UI. */
  label: string;
  hasMx: boolean;
  mxHosts: string[];
  smtpChecked: boolean;
  catchAll: boolean | null;
  detail: string | null;
  /** Qui a produit le résultat (allegrow prioritaire si configuré). */
  provider?: "allegrow" | "local";
  /** Allegrow a rejeté la clé / le plan — la route peut fallback local. */
  allegrowAuthDenied?: boolean;
};

function normalizeEmail(raw: string): string | null {
  const e = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e;
}

async function lookupMx(domain: string): Promise<string[]> {
  try {
    const records = await resolveMx(domain);
    return records
      .sort((a, b) => a.priority - b.priority)
      .map((r) => r.exchange)
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** Lit une ligne SMTP (peut être multi-ligne 250-…). */
function readSmtpLine(
  socket: net.Socket,
  timeoutMs: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = "";
    const onData = (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      const lines = buf.split(/\r?\n/).filter((l) => l.length > 0);
      if (lines.length === 0) return;
      const last = lines[lines.length - 1];
      // Fin de réponse : code suivi d'un espace (pas d'un tiret).
      if (/^\d{3} /.test(last)) {
        cleanup();
        resolve(buf.trim());
      }
    };
    const onErr = (err: Error) => {
      cleanup();
      reject(err);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("SMTP timeout"));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      socket.off("data", onData);
      socket.off("error", onErr);
    };
    socket.on("data", onData);
    socket.on("error", onErr);
  });
}

async function smtpProbe(
  mxHost: string,
  email: string,
  timeoutMs = 8000
): Promise<{ code: number; raw: string } | null> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: mxHost, port: 25 });
    let settled = false;
    const finish = (v: { code: number; raw: string } | null) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      resolve(v);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);

    (async () => {
      try {
        socket.setTimeout(timeoutMs);
        await readSmtpLine(socket, timeoutMs);
        socket.write("EHLO glowupagence.fr\r\n");
        await readSmtpLine(socket, timeoutMs);
        socket.write("MAIL FROM:<verify@glowupagence.fr>\r\n");
        await readSmtpLine(socket, timeoutMs);
        socket.write(`RCPT TO:<${email}>\r\n`);
        const rcpt = await readSmtpLine(socket, timeoutMs);
        const code = parseInt(rcpt.slice(0, 3), 10) || 0;
        socket.write("QUIT\r\n");
        clearTimeout(timer);
        finish({ code, raw: rcpt });
      } catch {
        clearTimeout(timer);
        finish(null);
      }
    })();

    socket.on("error", () => {
      clearTimeout(timer);
      finish(null);
    });
  });
}

function statusLabel(status: EmailVerifyStatus): string {
  switch (status) {
    case "valid":
      return "Probablement valide";
    case "invalid":
      return "Invalide / rejeté";
    case "catch_all":
      return "Catch-all (indéterminé)";
    case "no_mx":
      return "Pas de serveur mail";
    default:
      return "Indéterminé";
  }
}

export async function verifyEmailAddress(raw: string): Promise<EmailVerifyResult> {
  const email = normalizeEmail(raw);
  if (!email) {
    return {
      email: raw.trim(),
      status: "invalid",
      label: statusLabel("invalid"),
      hasMx: false,
      mxHosts: [],
      smtpChecked: false,
      catchAll: null,
      detail: "Format email invalide",
    };
  }

  const domain = email.split("@")[1];
  const mxHosts = await lookupMx(domain);
  if (mxHosts.length === 0) {
    return {
      email,
      status: "no_mx",
      label: statusLabel("no_mx"),
      hasMx: false,
      mxHosts: [],
      smtpChecked: false,
      catchAll: null,
      detail: `Aucun MX pour ${domain}`,
    };
  }

  // Sonde SMTP sur le premier MX.
  const mx = mxHosts[0];
  const probe = await smtpProbe(mx, email);
  if (!probe) {
    // Port 25 souvent bloqué (Vercel / ISP) — on garde le signal MX.
    let spfHint: string | null = null;
    try {
      const txt = await resolveTxt(domain);
      const flat = txt.map((r) => r.join("")).join(" ");
      if (/v=spf1/i.test(flat)) spfHint = "SPF présent";
    } catch {
      /* ignore */
    }
    return {
      email,
      status: "unknown",
      label: statusLabel("unknown"),
      hasMx: true,
      mxHosts,
      smtpChecked: false,
      catchAll: null,
      detail: `MX OK (${mx})${spfHint ? ` · ${spfHint}` : ""} — sonde SMTP indisponible depuis ce serveur`,
    };
  }

  if (probe.code >= 500) {
    return {
      email,
      status: "invalid",
      label: statusLabel("invalid"),
      hasMx: true,
      mxHosts,
      smtpChecked: true,
      catchAll: false,
      detail: `SMTP ${probe.code}`,
    };
  }

  if (probe.code >= 200 && probe.code < 300) {
    // Catch-all ? tester une adresse absurde.
    const fake = `no-mailbox-${Date.now().toString(36)}@${domain}`;
    const fakeProbe = await smtpProbe(mx, fake);
    const isCatchAll =
      Boolean(fakeProbe) &&
      fakeProbe!.code >= 200 &&
      fakeProbe!.code < 300;

    if (isCatchAll) {
      return {
        email,
        status: "catch_all",
        label: statusLabel("catch_all"),
        hasMx: true,
        mxHosts,
        smtpChecked: true,
        catchAll: true,
        detail: `${domain} accepte toutes les adresses — impossible de confirmer la boîte`,
      };
    }

    return {
      email,
      status: "valid",
      label: statusLabel("valid"),
      hasMx: true,
      mxHosts,
      smtpChecked: true,
      catchAll: false,
      detail: `SMTP ${probe.code} via ${mx}`,
    };
  }

  return {
    email,
    status: "unknown",
    label: statusLabel("unknown"),
    hasMx: true,
    mxHosts,
    smtpChecked: true,
    catchAll: null,
    detail: `SMTP ${probe.code}`,
  };
}
