"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Mail, Plus, Trash2, User as UserIcon } from "lucide-react";

const LICORICE = "#1A1110";
const OLD_ROSE = "#C08B8B";
const TEA_GREEN = "#C8F285";
const OLD_LACE = "#F5EBE0";

type Props = {
  defaultRecipient: string;
};

type AccountUser = {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  role: string;
};

type GmailAccount = {
  id: string;
  email: string;
  displayName: string | null;
  userId: string | null;
  user: AccountUser | null;
  connectedAt: string;
  updatedAt: string;
};

type TestResult =
  | { type: "success"; to: string; fromEmail: string; signatureFound: boolean; signatureLength: number }
  | { type: "error"; message: string };

export default function GmailSettingsClient({ defaultRecipient }: Props) {
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<GmailAccount[]>([]);
  const [users, setUsers] = useState<AccountUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [connectEmail, setConnectEmail] = useState("");

  const [recipient, setRecipient] = useState(defaultRecipient);
  const [testFromEmail, setTestFromEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/gmail/accounts", { credentials: "include" });
      const json = (await res.json().catch(() => ({}))) as {
        accounts?: GmailAccount[];
        users?: AccountUser[];
        error?: string;
      };
      if (!res.ok) {
        setError(json.error || "Erreur lors du chargement des boîtes.");
        return;
      }
      setAccounts(json.accounts || []);
      setUsers(json.users || []);
      if (!testFromEmail && (json.accounts || []).length > 0) {
        setTestFromEmail(json.accounts![0].email);
      }
    } catch {
      setError("Erreur réseau.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function linkUser(accountId: string, userId: string | null) {
    const res = await fetch("/api/gmail/accounts", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: accountId, userId }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      window.alert(json.error || "Erreur lors de la liaison.");
    }
    refresh();
  }

  async function disconnect(account: GmailAccount) {
    const ok = window.confirm(
      `Déconnecter la boîte ${account.email} ? Les envois depuis cette boîte ne fonctionneront plus tant qu'elle n'est pas reconnectée.`
    );
    if (!ok) return;
    const res = await fetch(`/api/gmail/accounts?id=${encodeURIComponent(account.id)}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      window.alert(json.error || "Erreur lors de la déconnexion.");
    }
    refresh();
  }

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
        body: JSON.stringify({ to, fromEmail: testFromEmail || undefined }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        to?: string;
        fromEmail?: string;
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
          fromEmail: json.fromEmail || testFromEmail,
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

  const connectHref = connectEmail.trim()
    ? `/api/auth/gmail?email=${encodeURIComponent(connectEmail.trim())}`
    : "/api/auth/gmail";

  return (
    <div className="space-y-6" style={{ fontFamily: "Switzer, system-ui, sans-serif" }}>
      <header>
        <h1
          className="text-3xl font-semibold tracking-tight"
          style={{ color: LICORICE, fontFamily: "Spectral, serif" }}
        >
          Boîtes Gmail connectées
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Connecte les boîtes @glowupagence.fr de l&apos;équipe pour envoyer les mails
          directement depuis la plateforme. Chaque boîte peut être liée à son
          utilisateur : son prénom/nom devient le nom d&apos;expéditeur.
        </p>
      </header>

      <section
        className="rounded-2xl border p-6 bg-white space-y-4"
        style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2
            className="text-lg font-semibold"
            style={{ color: LICORICE, fontFamily: "Spectral, serif" }}
          >
            Boîtes connectées
          </h2>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="email"
              value={connectEmail}
              onChange={(e) => setConnectEmail(e.target.value)}
              placeholder="ines@glowupagence.fr (optionnel)"
              className="rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}
            />
            <a
              href={connectHref}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium"
              style={{ backgroundColor: TEA_GREEN, color: LICORICE }}
            >
              <Plus className="h-4 w-4" /> Connecter une boîte
            </a>
          </div>
        </div>

        {error && (
          <div
            className="rounded-lg border p-3 text-sm"
            style={{ borderColor: "#FCA5A5", backgroundColor: "#FEE2E2", color: "#7F1D1D" }}
          >
            ❌ {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
          </div>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-slate-600">
            Aucune boîte connectée pour le moment. Clique sur « Connecter une boîte »,
            connecte-toi au compte Google voulu et autorise l&apos;accès.
          </p>
        ) : (
          <div className="space-y-3">
            {accounts.map((a) => (
              <div
                key={a.id}
                className="flex flex-col gap-3 rounded-xl border p-4 md:flex-row md:items-center md:justify-between"
                style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 25%, transparent)` }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: OLD_LACE }}
                  >
                    <Mail className="h-5 w-5" style={{ color: LICORICE }} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium" style={{ color: LICORICE }}>
                      {a.email}
                    </p>
                    <p className="text-xs text-slate-500">
                      Connectée le {new Date(a.connectedAt).toLocaleDateString("fr-FR")} ·
                      expéditeur : {a.displayName || (a.user ? `${a.user.prenom} ${a.user.nom}` : "auto")}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2">
                    <UserIcon className="h-4 w-4 text-slate-400" />
                    <select
                      value={a.userId || ""}
                      onChange={(e) => linkUser(a.id, e.target.value || null)}
                      className="rounded-lg border px-2 py-1.5 text-sm"
                      style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}
                    >
                      <option value="">Aucun utilisateur lié</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.prenom} {u.nom} ({u.email})
                        </option>
                      ))}
                    </select>
                  </div>
                  <a
                    href={`/api/auth/gmail?email=${encodeURIComponent(a.email)}`}
                    className="rounded-lg border px-3 py-1.5 text-sm"
                    style={{ borderColor: OLD_ROSE, color: LICORICE, backgroundColor: OLD_LACE }}
                  >
                    Reconnecter
                  </a>
                  <button
                    type="button"
                    onClick={() => disconnect(a)}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-700 hover:bg-red-100"
                  >
                    <Trash2 className="h-4 w-4" /> Déconnecter
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {accounts.length > 0 && (
        <section
          className="rounded-2xl border p-6 bg-white space-y-4"
          style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}
        >
          <div>
            <h2
              className="text-lg font-semibold"
              style={{ color: LICORICE, fontFamily: "Spectral, serif" }}
            >
              Tester une boîte
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Envoie un mail bidon depuis la boîte choisie vers l&apos;adresse de ton
              choix pour vérifier l&apos;envoi et la signature Gmail. Aucun client
              n&apos;est contacté.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              value={testFromEmail}
              onChange={(e) => setTestFromEmail(e.target.value)}
              className="rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}
              disabled={sending}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.email}>
                  Depuis {a.email}
                </option>
              ))}
            </select>
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
              ✅ Mail envoyé à <strong>{result.to}</strong> depuis{" "}
              <strong>{result.fromEmail}</strong>.{" "}
              {result.signatureFound ? (
                <>
                  Signature Gmail détectée ({result.signatureLength} caractères) et
                  ajoutée au mail. Vérifie ta boîte de réception.
                </>
              ) : (
                <>
                  ⚠️ Aucune signature trouvée côté Gmail. Vérifie qu&apos;une
                  signature est bien configurée dans Gmail → Paramètres → Général
                  → Signature pour <strong>{result.fromEmail}</strong>.
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
