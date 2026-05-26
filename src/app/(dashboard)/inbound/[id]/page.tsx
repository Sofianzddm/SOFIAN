"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";
import Image from "next/image";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapUnderline from "@tiptap/extension-underline";
import EmailComposer, {
  type BrandResearch,
  type Talent,
} from "@/app/(dashboard)/casting-outreach/EmailComposer";
import { getInstagramProfileUrl } from "@/lib/social-links";

type InboundStatus = "NEW" | "READY" | "IN_REVIEW" | "CONVERTED" | "ARCHIVED";

type PresskitTalent = {
  id: string;
  prenom: string;
  nom: string;
  photo: string | null;
  niches: string[];
  instagram?: string | null;
  igFollowers: number;
  igEngagement: number;
  ttFollowers: number;
  ttEngagement: number;
};

type Opportunity = {
  id: string;
  talentName: string;
  talentEmail: string;
  talentId?: string | null;
  senderEmail: string;
  senderName?: string | null;
  senderDomain: string;
  subject: string;
  bodyExcerpt: string;
  category: string;
  confidence: number;
  priority: string;
  status: InboundStatus;
  receivedAt: string;
  extractedBrand?: string | null;
  extractedBudget?: string | null;
  extractedDeadline?: string | null;
  extractedDeliverables?: string | null;
  briefSummary?: string | null;
  draftEmailSubject?: string | null;
  draftEmailBody?: string | null;
  convertedAt?: string | null;
  convertedBy?: { prenom: string; nom: string } | null;
  archivedAt?: string | null;
  archivedReason?: string | null;
  convertedToProspectionId?: string | null;
};

const ALLOWED = ["CASTING_MANAGER", "HEAD_OF_SALES", "ADMIN"];

export default function InboundDetailPage() {
  const { data: session, status } = useSession();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerSubject, setComposerSubject] = useState("");
  const [sendingFromLeyna, setSendingFromLeyna] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [talents, setTalents] = useState<PresskitTalent[]>([]);
  const [loadingTalents, setLoadingTalents] = useState(false);
  const [talentsError, setTalentsError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [brandResearch, setBrandResearch] = useState<BrandResearch | null>(null);
  const [isResearching, setIsResearching] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [emailLanguage, setEmailLanguage] = useState<"fr" | "en">("fr");

  const role = (session?.user as { role?: string } | undefined)?.role || "";
  const forbidden = status !== "loading" && !ALLOWED.includes(role);

  useEffect(() => {
    if (forbidden || !params?.id || status === "loading") return;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/inbound/opportunities/${params.id}`, {
          cache: "no-store",
          credentials: "include",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erreur");
        setOpportunity(data.opportunity || null);
      } catch {
        setOpportunity(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [params?.id, forbidden, status]);

  const bodyText = useMemo(() => {
    if (!opportunity) return "";
    if (showAll) return opportunity.bodyExcerpt;
    return opportunity.bodyExcerpt.slice(0, 800);
  }, [opportunity, showAll]);

  const composerEditor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit, TiptapUnderline],
    content: "<p></p>",
    editorProps: {
      attributes: {
        class:
          "min-h-[220px] max-h-[50vh] overflow-y-auto rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none",
      },
    },
  });

  useEffect(() => {
    if (!composerOpen || !opportunity) return;
    setComposerSubject(opportunity.draftEmailSubject || opportunity.subject || "");
    composerEditor?.commands.setContent(opportunity.draftEmailBody || "<p></p>");
    setSelectedIds(new Set());
    setBrandResearch(null);
  }, [composerOpen, opportunity, composerEditor]);

  useEffect(() => {
    if (!composerOpen) return;
    let cancelled = false;
    setLoadingTalents(true);
    setTalentsError(null);
    fetch("/api/talents?presskit=true", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(typeof j.message === "string" ? j.message : "Chargement des talents impossible.");
        }
        return res.json();
      })
      .then((data: { talents?: PresskitTalent[] }) => {
        if (!cancelled) {
          setTalents(Array.isArray(data.talents) ? data.talents : []);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setTalentsError(e instanceof Error ? e.message : "Erreur réseau.");
      })
      .finally(() => {
        if (!cancelled) setLoadingTalents(false);
      });
    return () => {
      cancelled = true;
    };
  }, [composerOpen]);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3200);
  };

  const selectedTalentsRaw = useMemo(
    () => talents.filter((t) => selectedIds.has(t.id)),
    [talents, selectedIds]
  );

  const selectedTalents: Talent[] = useMemo(
    () =>
      selectedTalentsRaw.map((t) => ({
        id: t.id,
        prenom: t.prenom,
        nom: t.nom,
        niches: t.niches,
      })),
    [selectedTalentsRaw]
  );

  const toggleTalent = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const insertTalentInMail = useCallback(
    (talent: PresskitTalent) => {
      if (!composerEditor) return;
      const instagramUrl = getInstagramProfileUrl(talent.instagram);
      const label = `${talent.prenom} ${talent.nom}`.trim();
      if (instagramUrl) {
        composerEditor.commands.insertContent(
          `<a href="${instagramUrl}" target="_blank">${label}</a> `
        );
      } else {
        composerEditor.commands.insertContent(`${label} `);
      }
    },
    [composerEditor]
  );

  const insertSelectedTalentsInMail = useCallback(() => {
    if (!composerEditor || selectedTalentsRaw.length === 0) return;
    for (const talent of selectedTalentsRaw) {
      const instagramUrl = getInstagramProfileUrl(talent.instagram);
      const label = `${talent.prenom} ${talent.nom}`.trim();
      if (instagramUrl) {
        composerEditor.commands.insertContent(
          `<a href="${instagramUrl}" target="_blank">${label}</a><br/>`
        );
      } else {
        composerEditor.commands.insertContent(`${label}<br/>`);
      }
    }
  }, [composerEditor, selectedTalentsRaw]);

  const runBrandResearch = useCallback(async () => {
    if (!opportunity) return;
    const brandName = (opportunity.extractedBrand || opportunity.senderDomain || "").trim();
    if (!brandName) {
      showToast("Nom de marque manquant pour la recherche.", "error");
      return;
    }
    setIsResearching(true);
    try {
      const res = await fetch("/api/casting/brand-research", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Recherche impossible.");
      }
      setBrandResearch(data as BrandResearch);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Erreur réseau.", "error");
    } finally {
      setIsResearching(false);
    }
  }, [opportunity]);

  const runGenerateEmail = useCallback(async () => {
    if (!opportunity || !brandResearch) return;
    if (selectedTalentsRaw.length === 0) {
      showToast("Sélectionne au moins un talent.", "error");
      return;
    }
    setIsGenerating(true);
    try {
      const res = await fetch("/api/casting/generate-email", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: emailLanguage,
          brandName: opportunity.extractedBrand || opportunity.senderDomain,
          brandResearch,
          talents: selectedTalentsRaw.map((t) => {
            const followers = Math.max(t.igFollowers || 0, t.ttFollowers || 0);
            const eng = t.igEngagement > 0 ? t.igEngagement : t.ttEngagement > 0 ? t.ttEngagement : undefined;
            return {
              name: `${t.prenom} ${t.nom}`.trim(),
              niche: (t.niches || []).join(", ") || "—",
              followers,
              igFollowers: t.igFollowers || 0,
              ttFollowers: t.ttFollowers || 0,
              instagram: t.instagram ?? null,
              ...(typeof eng === "number" ? { engagementRate: eng } : {}),
            };
          }),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Génération impossible.");
      }
      const nextSubject = typeof data.subject === "string" ? data.subject : "";
      const nextBody = typeof data.body === "string" ? data.body : "";
      setComposerSubject(nextSubject);
      composerEditor?.commands.setContent(nextBody.startsWith("<") ? nextBody : `<p>${nextBody.replace(/\n/g, "<br/>")}</p>`);
      showToast("Brouillon généré", "success");
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Erreur réseau.", "error");
    } finally {
      setIsGenerating(false);
    }
  }, [opportunity, brandResearch, selectedTalentsRaw, emailLanguage, composerEditor]);

  if (status === "loading" || loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#C08B8B]" />
      </div>
    );
  }
  if (forbidden) return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm">Acces refuse.</div>;
  if (!opportunity) return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm">Opportunite introuvable.</div>;

  const canAct = opportunity.status === "NEW" || opportunity.status === "IN_REVIEW";
  const canDelete = opportunity.status !== "CONVERTED";

  const removeOpportunity = async () => {
    if (!window.confirm("Supprimer definitivement cette opportunite inbound ?")) return;
    if (!window.confirm("Cette action est irreversible. Confirmer la suppression ?")) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/inbound/opportunities/${opportunity.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erreur suppression");
      router.push("/inbound");
    } catch (e: any) {
      window.alert(e?.message || "Erreur suppression");
    } finally {
      setSubmitting(false);
    }
  };

  const saveDraft = async (draft?: { subject: string; bodyHtml: string }) => {
    const res = await fetch(`/api/inbound/opportunities/${opportunity.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        draftEmailSubject: draft?.subject ?? "",
        draftEmailBody: draft?.bodyHtml ?? "",
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Erreur sauvegarde brouillon");
    if (data?.opportunity) setOpportunity(data.opportunity as Opportunity);
  };

  const sendFromLeyna = async () => {
    if (!opportunity) return;
    const subject = composerSubject.trim();
    const bodyHtml = composerEditor?.getHTML() || "";
    if (!subject) {
      showToast("Objet obligatoire.", "error");
      return;
    }
    if (!bodyHtml.trim()) {
      showToast("Corps du mail obligatoire.", "error");
      return;
    }

    setSendingFromLeyna(true);
    try {
      await saveDraft({ subject, bodyHtml });

      const sendRes = await fetch(`/api/inbound/opportunities/${opportunity.id}/send`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, htmlBody: bodyHtml }),
      });
      const sendJson = await sendRes.json().catch(() => ({}));
      if (!sendRes.ok) {
        if (sendJson.error === "gmail_not_connected") {
          throw new Error(
            "La boite Gmail de Leyna n'est pas connectée. Demandez à l'admin de la connecter dans Settings → Gmail"
          );
        }
        throw new Error(typeof sendJson.error === "string" ? sendJson.error : "Envoi Gmail impossible.");
      }

      showToast("✅ Envoyé depuis leyna@glowupagence.fr", "success");
      setComposerOpen(false);
      setOpportunity((prev) => (prev ? { ...prev, status: "READY" } : prev));
      window.setTimeout(() => {
        router.push("/inbound");
      }, 700);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Erreur envoi.", "error");
    } finally {
      setSendingFromLeyna(false);
    }
  };

  return (
    <div className="space-y-4">
      {toast && (
        <div
          className="fixed bottom-6 right-6 z-[220] rounded-xl border px-4 py-3 text-sm shadow-lg"
          style={{
            backgroundColor: toast.type === "success" ? "#C8F285" : "#FEE2E2",
            borderColor: toast.type === "success" ? "#1A1110" : "#FCA5A5",
            color: "#1A1110",
          }}
        >
          {toast.message}
        </div>
      )}
      <Link href="/inbound" className="text-sm text-slate-500 hover:text-slate-800">← Retour aux opportunites inbound</Link>

      {opportunity.status === "CONVERTED" && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          Convertie en prospection le {opportunity.convertedAt ? new Date(opportunity.convertedAt).toLocaleString("fr-FR") : "—"}
          {opportunity.convertedBy ? ` par ${opportunity.convertedBy.prenom} ${opportunity.convertedBy.nom}` : ""}.
        </div>
      )}
      {opportunity.status === "ARCHIVED" && (
        <div className="rounded-lg border border-slate-300 bg-slate-100 p-3 text-sm text-slate-700">
          Archivee le {opportunity.archivedAt ? new Date(opportunity.archivedAt).toLocaleString("fr-FR") : "—"}.
          {opportunity.archivedReason ? ` Raison: ${opportunity.archivedReason}` : ""}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <section className="xl:col-span-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="space-y-1 text-sm text-slate-600">
            <div><strong>From:</strong> {opportunity.senderName || "—"} &lt;{opportunity.senderEmail}&gt;</div>
            <div><strong>To:</strong> {opportunity.talentName} ({opportunity.talentEmail})</div>
            <div><strong>Date:</strong> {new Date(opportunity.receivedAt).toLocaleString("fr-FR")}</div>
          </div>
          <h1 className="mt-3 text-xl font-semibold text-slate-900">{opportunity.subject}</h1>
          <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700 whitespace-pre-wrap">
            {bodyText}
          </div>
          {opportunity.bodyExcerpt.length > 800 && (
            <button type="button" className="mt-2 text-xs text-slate-600 underline" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Voir moins" : "Voir plus"}
            </button>
          )}
          <p className="mt-3 text-xs text-slate-500">
            Mail original consultable dans la boite de {opportunity.talentName}.
          </p>
        </section>

        <aside className="xl:col-span-2 space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="font-semibold text-slate-900">Classification</h2>
            <p className="mt-2 text-sm text-slate-700">Categorie: <strong>{opportunity.category}</strong></p>
            <p className="text-sm text-slate-700">Priorite: <strong>{opportunity.priority}</strong></p>
            <div className="mt-2">
              <div className="mb-1 text-xs text-slate-500">Confiance ({Math.round(opportunity.confidence * 100)}%)</div>
              <div className="h-2 rounded bg-slate-100">
                <div className="h-2 rounded bg-[#C08B8B]" style={{ width: `${Math.round(opportunity.confidence * 100)}%` }} />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="font-semibold text-slate-900">Donnees extraites</h2>
            <div className="mt-2 space-y-1 text-sm text-slate-700">
              <p><strong>Marque:</strong> {opportunity.extractedBrand || opportunity.senderDomain}</p>
              {opportunity.briefSummary ? <p><strong>Brief:</strong> {opportunity.briefSummary}</p> : null}
              {opportunity.extractedBudget ? <p><strong>Budget:</strong> {opportunity.extractedBudget}</p> : null}
              {opportunity.extractedDeadline ? <p><strong>Deadline:</strong> {opportunity.extractedDeadline}</p> : null}
              {opportunity.extractedDeliverables ? <p><strong>Deliverables:</strong> {opportunity.extractedDeliverables}</p> : null}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="font-semibold text-slate-900">Talent contacte</h2>
            <p className="mt-2 text-sm text-slate-700">{opportunity.talentName}</p>
            {opportunity.talentId ? (
              <Link href={`/talents/${opportunity.talentId}`} className="text-xs text-slate-500 underline">Voir la fiche talent</Link>
            ) : null}
          </div>

          {(canAct || canDelete) && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              {canAct && (
                <button
                  disabled={submitting}
                  onClick={() => setComposerOpen(true)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-60"
                >
                  Rediger un mail
                </button>
              )}
              {canDelete && (
                <button
                  disabled={submitting}
                  onClick={removeOpportunity}
                  className={`${canAct ? "mt-2" : ""} w-full rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 disabled:opacity-60`}
                >
                  Supprimer definitivement
                </button>
              )}
            </div>
          )}
        </aside>
      </div>

      {composerOpen && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-6xl max-h-[90vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Rédiger un mail</h3>
              <button
                type="button"
                onClick={() => setComposerOpen(false)}
                className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700"
              >
                Fermer
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="space-y-2 lg:col-span-1">
                <h4 className="text-sm font-semibold text-slate-800">Talents</h4>
                {talentsError && <p className="text-xs text-red-600">{talentsError}</p>}
                <div className="max-h-[62vh] space-y-2 overflow-y-auto pr-1">
                  {loadingTalents ? (
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Chargement...
                    </div>
                  ) : (
                    talents.map((t) => {
                      const selected = selectedIds.has(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => toggleTalent(t.id)}
                          className="w-full rounded-xl border p-2 text-left"
                          style={{ borderColor: selected ? "#C8F285" : "#E2E8F0", backgroundColor: selected ? "#F7FEE7" : "#fff" }}
                        >
                          <div className="flex items-start gap-2">
                            <div className="relative h-12 w-12 overflow-hidden rounded-lg bg-slate-200">
                              {t.photo ? <Image src={t.photo} alt="" fill className="object-cover" sizes="48px" /> : null}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-slate-900">{t.prenom} {t.nom}</p>
                              <p className="truncate text-xs text-slate-500">{(t.niches || []).join(", ") || "—"}</p>
                              <p className="text-[11px] text-slate-600">IG {t.igFollowers || 0} · TT {t.ttFollowers || 0}</p>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  insertTalentInMail(t);
                                }}
                                className="mt-1 text-[11px] text-slate-700 underline"
                              >
                                Insérer dans le mail
                              </button>
                              {t.instagram ? (
                                <a
                                  href={getInstagramProfileUrl(t.instagram) || "#"}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-[11px] text-blue-600 underline"
                                >
                                  Instagram
                                </a>
                              ) : null}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
              <div className="lg:col-span-2">
                <div className="mb-3 flex justify-end">
                  <button
                    type="button"
                    onClick={insertSelectedTalentsInMail}
                    disabled={selectedTalentsRaw.length === 0}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-50"
                  >
                    Insérer tous les talents sélectionnés
                  </button>
                </div>
                <EmailComposer
                  subject={composerSubject}
                  onSubjectChange={setComposerSubject}
                  language={emailLanguage}
                  onLanguageChange={setEmailLanguage}
                  brandName={opportunity.extractedBrand || opportunity.senderDomain}
                  brandResearch={brandResearch}
                  onBrandResearch={() => {
                    void runBrandResearch();
                  }}
                  isResearching={isResearching}
                  talentsSelected={selectedTalents}
                  isGenerating={isGenerating}
                  onGenerate={() => {
                    void runGenerateEmail();
                  }}
                  editor={composerEditor}
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  void saveDraft({
                    subject: composerSubject,
                    bodyHtml: composerEditor?.getHTML() || "",
                  }).catch((e: unknown) => {
                    const msg = e instanceof Error ? e.message : "Erreur sauvegarde brouillon";
                    showToast(msg, "error");
                  });
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                disabled={sendingFromLeyna}
              >
                Enregistrer brouillon
              </button>
              <button
                type="button"
                onClick={() => void sendFromLeyna()}
                disabled={sendingFromLeyna}
                className="rounded-lg bg-[#C8F285] px-3 py-2 text-sm font-semibold text-[#1A1110] disabled:opacity-60"
              >
                {sendingFromLeyna ? "Envoi en cours..." : "🚀 Envoyer depuis Leyna"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
