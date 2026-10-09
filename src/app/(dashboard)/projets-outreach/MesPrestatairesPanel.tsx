"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw, Mail } from "lucide-react";
import RichEmailEditor from "@/components/email/RichEmailEditor";
import {
  PRESTATAIRE_STATUTS,
  PRESTATAIRE_STATUT_LABEL,
  PRESTATAIRE_CANAUX,
  PRESTATAIRE_CANAL_LABEL,
  PRESTATAIRE_CATEGORIE_LABEL,
  type PrestataireStatut,
  type PrestataireCategorie,
} from "@/lib/projets-outreach";
import { PoAvatar } from "./PoUi";

type MineRow = {
  id: string;
  nom: string;
  categorie: string;
  statut: string;
  canal: string | null;
  contactInfo: string | null;
  notes: string | null;
  dernierContactAt: string | null;
  prochaineRelanceAt: string | null;
  responsableKind: "USER" | "TALENT";
  responsableName: string;
  campaignId: string;
  campaignTitle: string;
  talentName: string;
  talentPhoto: string | null;
  assignedToMe: boolean;
  prestataireCrmId: string | null;
  draftEmailSubject?: string | null;
  draftEmailBody?: string | null;
  sentAt?: string | null;
  crmEmails?: string[];
};

const STATUT_FILTERS: { id: "" | PrestataireStatut; label: string }[] = [
  { id: "", label: "Tous" },
  ...PRESTATAIRE_STATUTS.map((s) => ({ id: s, label: PRESTATAIRE_STATUT_LABEL[s] })),
];

function dateInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function MesPrestatairesPanel({
  campaignId,
  showProjectLink = true,
  /** Sur un projet : managers voient tous les prestas (pas seulement « assignés à moi »). */
  scopeAll = false,
}: {
  campaignId?: string;
  showProjectLink?: boolean;
  scopeAll?: boolean;
} = {}) {
  const [rows, setRows] = useState<MineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [statut, setStatut] = useState<"" | PrestataireStatut>("");
  const [mailRow, setMailRow] = useState<MineRow | null>(null);
  const [mailSubject, setMailSubject] = useState("");
  const [mailBody, setMailBody] = useState("");
  const [mailEmails, setMailEmails] = useState<string[]>([]);
  const [mailBusy, setMailBusy] = useState(false);
  const [resolvedScope, setResolvedScope] = useState<"mine" | "all">(
    scopeAll ? "all" : "mine"
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statut) params.set("statut", statut);
      if (campaignId) {
        params.set("campaignId", campaignId);
      }
      if (scopeAll && campaignId) {
        params.set("scope", "all");
      }
      const q = params.toString() ? `?${params}` : "";
      const res = await fetch(`/api/projets-outreach/mes-prestataires${q}`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Chargement impossible.");
      setResolvedScope(data.scope === "all" ? "all" : "mine");
      setRows(Array.isArray(data.prestataires) ? data.prestataires : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [statut, campaignId, scopeAll]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(id: string, campaignId: string, body: Record<string, unknown>) {
    setSavingId(id);
    setError(null);
    try {
      const res = await fetch(
        `/api/projets-outreach/${campaignId}/prestataires/${id}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Mise à jour impossible.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSavingId(null);
    }
  }

  function openMail(r: MineRow) {
    setMailRow(r);
    setMailSubject(r.draftEmailSubject || `Partenariat — ${r.campaignTitle}`);
    setMailBody(r.draftEmailBody || "");
    setMailEmails(r.crmEmails && r.crmEmails.length > 0 ? [...r.crmEmails] : []);
  }

  async function saveAndSendMail(send: boolean) {
    if (!mailRow) return;
    setMailBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const saveRes = await fetch(
        `/api/projets-outreach/${mailRow.campaignId}/prestataires/${mailRow.id}/mail`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            draftEmailSubject: mailSubject,
            draftEmailBody: mailBody,
          }),
        }
      );
      const saveData = await saveRes.json().catch(() => ({}));
      if (!saveRes.ok) throw new Error(saveData.error || "Brouillon impossible.");

      if (send) {
        const sendRes = await fetch(
          `/api/projets-outreach/${mailRow.campaignId}/prestataires/${mailRow.id}/mail`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subject: mailSubject,
              bodyHtml: mailBody,
              emails: mailEmails,
            }),
          }
        );
        const sendData = await sendRes.json().catch(() => ({}));
        if (!sendRes.ok) throw new Error(sendData.error || "Envoi impossible.");
        setSuccess(
          `Mail envoyé (${sendData.succeeded ?? 0} destinataire(s)) depuis ${sendData.fromEmail || "Gmail"}.`
        );
        setMailRow(null);
        await load();
      } else {
        setSuccess("Brouillon enregistré.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setMailBusy(false);
    }
  }

  return (
    <div className="mt-5 space-y-3">
      <div className="flex flex-wrap items-center gap-[7px]">
        {STATUT_FILTERS.map((f) => (
          <button
            key={f.id || "all"}
            type="button"
            className={`po-chip ${statut === f.id ? "po-chip-active" : ""}`}
            onClick={() => setStatut(f.id)}
          >
            {f.label}
          </button>
        ))}
        <button
          type="button"
          className="po-btn po-btn-icon ml-auto"
          onClick={() => void load()}
          aria-label="Rafraîchir"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {error ? (
        <div className="po-card po-card-pad text-[13px] text-[var(--po-prio-high-fg)]">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="po-card po-card-pad text-[13px]" style={{ color: "#1F7A45", borderColor: "#B7E0C6", background: "#F1FAF4" }}>
          {success}
        </div>
      ) : null}

      {loading ? (
        <div className="po-empty flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
        </div>
      ) : rows.length === 0 ? (
        <div className="po-empty">
          {resolvedScope === "all"
            ? `Aucun presta${statut ? ` « ${PRESTATAIRE_STATUT_LABEL[statut]} »` : ""} sur ce projet pour l’instant. Ajoute-en depuis le CRM.`
            : `Aucune prospection presta assignée à toi${
                campaignId ? " sur ce projet" : ""
              } pour l’instant.`}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((r) => {
            const busy = savingId === r.id;
            const overdue =
              r.prochaineRelanceAt &&
              new Date(r.prochaineRelanceAt).getTime() < Date.now() &&
              r.statut !== "CONFIRME" &&
              r.statut !== "ANNULE";
            return (
              <div key={r.id} className="po-card po-card-pad">
                <div className="flex items-start gap-3">
                  <PoAvatar name={r.talentName} photo={r.talentPhoto} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {r.prestataireCrmId ? (
                        <Link
                          href={`/prestataires/${r.prestataireCrmId}`}
                          className="text-[15px] font-bold text-[var(--po-ink)] underline-offset-2 hover:underline"
                          title="Ouvrir le CRM prestataire"
                        >
                          {r.nom}
                        </Link>
                      ) : (
                        <span className="text-[15px] font-bold text-[var(--po-ink)]">
                          {r.nom}
                        </span>
                      )}
                      {r.prestataireCrmId ? (
                        <Link
                          href={`/prestataires/${r.prestataireCrmId}`}
                          className="po-badge"
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            background: "#E7F6EC",
                            color: "#1F7A45",
                            textDecoration: "none",
                          }}
                        >
                          CRM →
                        </Link>
                      ) : null}
                      <span
                        className="po-badge"
                        style={{ fontSize: 11, fontWeight: 600 }}
                      >
                        {PRESTATAIRE_CATEGORIE_LABEL[
                          r.categorie as PrestataireCategorie
                        ] || r.categorie}
                      </span>
                      {overdue ? (
                        <span
                          className="po-badge"
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            background: "#FBEAEA",
                            color: "#B42318",
                          }}
                        >
                          Relance due
                        </span>
                      ) : null}
                      {!r.assignedToMe ? (
                        <span
                          className="po-badge"
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            background: "#F4F0FC",
                            color: "#5B3F9E",
                          }}
                        >
                          {r.responsableKind === "TALENT"
                            ? `Via talent ${r.responsableName}`
                            : `Resp. ${r.responsableName}`}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-[12.5px] text-[var(--po-tertiary)]">
                      {r.talentName}
                      {showProjectLink ? (
                        <>
                          {" · "}
                          <Link
                            href={`/projets-outreach/${r.campaignId}`}
                            className="underline"
                            style={{ color: "var(--po-accent)" }}
                          >
                            {r.campaignTitle}
                          </Link>
                        </>
                      ) : null}
                    </div>

                    <div
                      className="mt-3 grid gap-2"
                      style={{
                        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                      }}
                    >
                      <label className="text-[11.5px] font-semibold text-[var(--po-muted)]">
                        Statut
                        <select
                          className="po-input mt-1"
                          value={r.statut}
                          disabled={busy}
                          onChange={(e) =>
                            void patch(r.id, r.campaignId, {
                              statut: e.target.value,
                            })
                          }
                        >
                          {PRESTATAIRE_STATUTS.map((s) => (
                            <option key={s} value={s}>
                              {PRESTATAIRE_STATUT_LABEL[s]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-[11.5px] font-semibold text-[var(--po-muted)]">
                        Canal
                        <select
                          className="po-input mt-1"
                          value={r.canal || ""}
                          disabled={busy}
                          onChange={(e) =>
                            void patch(r.id, r.campaignId, {
                              canal: e.target.value || null,
                            })
                          }
                        >
                          <option value="">—</option>
                          {PRESTATAIRE_CANAUX.map((c) => (
                            <option key={c} value={c}>
                              {PRESTATAIRE_CANAL_LABEL[c]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-[11.5px] font-semibold text-[var(--po-muted)]">
                        Prochaine relance
                        <input
                          type="date"
                          className="po-input mt-1"
                          value={dateInputValue(r.prochaineRelanceAt)}
                          disabled={busy}
                          onChange={(e) =>
                            void patch(r.id, r.campaignId, {
                              prochaineRelanceAt: e.target.value || null,
                            })
                          }
                        />
                      </label>
                      <label className="text-[11.5px] font-semibold text-[var(--po-muted)]">
                        Contact
                        <input
                          className="po-input mt-1"
                          defaultValue={r.contactInfo || ""}
                          disabled={busy}
                          placeholder="@, tel, email…"
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v !== (r.contactInfo || "")) {
                              void patch(r.id, r.campaignId, {
                                contactInfo: v,
                              });
                            }
                          }}
                        />
                      </label>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="po-btn po-btn-primary"
                        style={{ fontSize: 12, padding: "6px 10px" }}
                        disabled={busy}
                        onClick={() => openMail(r)}
                      >
                        <Mail className="h-3.5 w-3.5" />
                        Rédiger / envoyer
                      </button>
                      <button
                        type="button"
                        className="po-btn po-btn-secondary"
                        style={{ fontSize: 12, padding: "6px 10px" }}
                        disabled={busy}
                        onClick={() =>
                          void patch(r.id, r.campaignId, { markContacted: true })
                        }
                      >
                        {busy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : null}
                        Marquer contacté
                      </button>
                      {r.sentAt ? (
                        <span className="text-[12px] text-[var(--po-muted)]">
                          Envoyé le {new Date(r.sentAt).toLocaleDateString("fr-FR")}
                        </span>
                      ) : null}
                      {r.dernierContactAt ? (
                        <span className="text-[12px] text-[var(--po-muted)]">
                          Dernier contact :{" "}
                          {new Date(r.dernierContactAt).toLocaleDateString("fr-FR")}
                        </span>
                      ) : null}
                      <label className="ml-0 w-full min-w-0 flex-1 text-[11.5px] font-semibold text-[var(--po-muted)] sm:ml-auto sm:min-w-[200px] sm:w-auto">
                        Notes
                        <input
                          className="po-input mt-1"
                          defaultValue={r.notes || ""}
                          disabled={busy}
                          placeholder="Suivi…"
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v !== (r.notes || "")) {
                              void patch(r.id, r.campaignId, { notes: v });
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {mailRow ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 80,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => !mailBusy && setMailRow(null)}
        >
          <div
            className="po-card"
            style={{
              width: "min(720px, 100%)",
              maxHeight: "90vh",
              overflow: "auto",
              padding: 20,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3" style={{ marginBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                  Mail — {mailRow.nom}
                </h3>
                <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--po-muted)" }}>
                  Destinataires = contacts CRM. Complète la fiche si besoin.
                </p>
              </div>
              <button
                type="button"
                className="po-btn po-btn-secondary"
                disabled={mailBusy}
                onClick={() => setMailRow(null)}
              >
                Fermer
              </button>
            </div>

            <label className="text-[11.5px] font-semibold text-[var(--po-muted)]" style={{ display: "block", marginBottom: 10 }}>
              Destinataires (emails, séparés par virgule)
              <input
                className="po-input mt-1"
                value={mailEmails.join(", ")}
                onChange={(e) =>
                  setMailEmails(
                    e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                  )
                }
                placeholder="hotel@…, contact@…"
              />
            </label>

            <label className="text-[11.5px] font-semibold text-[var(--po-muted)]" style={{ display: "block", marginBottom: 10 }}>
              Objet
              <input
                className="po-input mt-1"
                value={mailSubject}
                onChange={(e) => setMailSubject(e.target.value)}
              />
            </label>

            <div style={{ marginBottom: 12 }}>
              <div className="text-[11.5px] font-semibold text-[var(--po-muted)]" style={{ marginBottom: 6 }}>
                Corps
              </div>
              <RichEmailEditor
                initialHtml={mailBody}
                onChangeHtml={setMailBody}
                minHeight={220}
              />
            </div>

            <div className="flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                className="po-btn po-btn-secondary"
                disabled={mailBusy}
                onClick={() => void saveAndSendMail(false)}
              >
                {mailBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Enregistrer brouillon
              </button>
              <button
                type="button"
                className="po-btn po-btn-primary"
                disabled={mailBusy || !mailBody.trim()}
                onClick={() => void saveAndSendMail(true)}
              >
                {mailBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Envoyer
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
