"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2 } from "lucide-react";

const LICORICE = "#1A1110";
const OLD_ROSE = "#C08B8B";
const TEA_GREEN = "#C8F285";
const OLD_LACE = "#F5EBE0";

type Props = {
  connectedAt: string | null;
  defaultRecipient: string;
};

type TestResult =
  | { type: "success"; to: string; signatureFound: boolean; signatureLength: number }
  | { type: "error"; message: string };

export default function GmailSettingsClient({ connectedAt, defaultRecipient }: Props) {
  const [recipient, setRecipient] = useState(defaultRecipient);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  const sendTest = async () => {
    const to = recipient.trim();
    if (!to) {
      setResult({ type: "error", message: "Renseigne une adresse." });
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/auth/gmail/test", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        to?: string;
        signatureFound?: boolean;
        signatureLength?: number;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setResult({ type: "error", message: json.error || "Échec de l'envoi" });
      } else {
        setResult({
          type: "success",
          to: json.to || to,
          signatureFound: Boolean(json.signatureFound),
          signatureLength: json.signatureLength || 0,
        });
      }
    } catch (e) {
      setResult({
        type: "error",
        message: e instanceof Error ? e.message : "Erreur réseau",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6" style={{ fontFamily: "Switzer, system-ui, sans-serif" }}>
      <header>
        <h1
          className="text-3xl font-semibold tracking-tight"
          style={{ color: LICORICE, fontFamily: "Spectral, serif" }}
        >
          Connexion Gmail Leyna
        </h1>
      </header>

      <section
        className="rounded-2xl border p-6 bg-white space-y-4"
        style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}
      >
        {connectedAt ? (
          <>
            <span
              className="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium"
              style={{ backgroundColor: TEA_GREEN, color: LICORICE }}
            >
              ✅ Boite Gmail connectée
            </span>
            <p className="text-sm" style={{ color: LICORICE }}>
              Connectée le {new Date(connectedAt).toLocaleString("fr-FR")}
            </p>
            <Link
              href="/api/auth/gmail"
              className="inline-flex items-center rounded-xl border px-4 py-2 text-sm"
              style={{ borderColor: OLD_ROSE, color: LICORICE, backgroundColor: OLD_LACE }}
            >
              Reconnecter
            </Link>
          </>
        ) : (
          <Link
            href="/api/auth/gmail"
            className="inline-flex items-center rounded-xl px-4 py-2 text-sm font-medium"
            style={{ backgroundColor: TEA_GREEN, color: LICORICE }}
          >
            🔗 Connecter la boite de Leyna
          </Link>
        )}
      </section>

      {connectedAt && (
        <section
          className="rounded-2xl border p-6 bg-white space-y-4"
          style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}
        >
          <div>
            <h2
              className="text-lg font-semibold"
              style={{ color: LICORICE, fontFamily: "Spectral, serif" }}
            >
              Tester la signature Gmail
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Envoie un mail bidon depuis Leyna vers l&apos;adresse de ton choix pour
              vérifier que la signature Gmail s&apos;ajoute bien aux mails sortants.
              Aucun client n&apos;est contacté.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="email"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="ton-email@exemple.com"
              className="flex-1 rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}
              disabled={sending}
            />
            <button
              type="button"
              onClick={() => void sendTest()}
              disabled={sending}
              className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
              style={{ backgroundColor: TEA_GREEN, color: LICORICE }}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {sending ? "Envoi…" : "Envoyer un test"}
            </button>
          </div>

          {result?.type === "success" && (
            <div
              className="rounded-lg border p-3 text-sm"
              style={{
                borderColor: `color-mix(in srgb, ${TEA_GREEN} 60%, transparent)`,
                backgroundColor: `color-mix(in srgb, ${TEA_GREEN} 18%, transparent)`,
                color: LICORICE,
              }}
            >
              ✅ Mail envoyé à <strong>{result.to}</strong>.{" "}
              {result.signatureFound ? (
                <>
                  Signature Gmail détectée ({result.signatureLength} caractères) et
                  ajoutée au mail. Vérifie ta boite réception.
                </>
              ) : (
                <>
                  ⚠️ Aucune signature trouvée côté Gmail. Vérifie qu&apos;une
                  signature est bien configurée dans Gmail → Paramètres → Général
                  → Signature pour <strong>leyna@glowupagence.fr</strong>.
                </>
              )}
            </div>
          )}

          {result?.type === "error" && (
            <div
              className="rounded-lg border p-3 text-sm"
              style={{
                borderColor: "#FCA5A5",
                backgroundColor: "#FEE2E2",
                color: "#7F1D1D",
              }}
            >
              ❌ {result.message}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
