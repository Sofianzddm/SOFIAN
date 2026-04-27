"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";
import CastingComposer from "@/app/(dashboard)/casting-outreach/CastingComposer";

type InboundStatus = "NEW" | "IN_REVIEW" | "CONVERTED" | "ARCHIVED";

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

  const convert = async () => {
    if (!window.confirm("Cette opportunite sera convertie en Prospection et assignee automatiquement a la Head of Sales. Confirmer ?")) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/inbound/opportunities/${opportunity.id}/convert`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      router.push(`/prospection/${data.prospectionId}`);
    } catch (e: any) {
      window.alert(e?.message || "Erreur conversion");
    } finally {
      setSubmitting(false);
    }
  };

  const archive = async () => {
    const reason = window.prompt("Raison d'archivage (optionnel):", "");
    setSubmitting(true);
    try {
      const res = await fetch(`/api/inbound/opportunities/${opportunity.id}/archive`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason || "" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      router.push("/inbound");
    } catch (e: any) {
      window.alert(e?.message || "Erreur archivage");
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

  return (
    <div className="space-y-4">
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
            <h2 className="font-semibold text-slate-900">Classification IA</h2>
            <p className="mt-2 text-sm text-slate-700">Categorie: <strong>{opportunity.category}</strong></p>
            <p className="text-sm text-slate-700">Priorite: <strong>{opportunity.priority}</strong></p>
            <div className="mt-2">
              <div className="mb-1 text-xs text-slate-500">Confiance IA ({Math.round(opportunity.confidence * 100)}%)</div>
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

          {canAct && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <button
                disabled={submitting}
                onClick={() => setComposerOpen(true)}
                className="mb-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-60"
              >
                Rediger un mail
              </button>
              <button disabled={submitting} onClick={convert} className="w-full rounded-lg bg-[#C8F285] px-3 py-2 text-sm font-semibold text-[#1A1110] disabled:opacity-60">
                Convertir en Prospection
              </button>
              <button disabled={submitting} onClick={archive} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-60">
                Archiver
              </button>
            </div>
          )}
        </aside>
      </div>

      <CastingComposer
        open={composerOpen}
        contact={{
          company: opportunity.extractedBrand || opportunity.senderDomain,
          contacts: [
            {
              id: opportunity.id,
              firstname: opportunity.senderName || "",
              lastname: "",
              email: opportunity.senderEmail,
            },
          ],
          initialSubject: opportunity.draftEmailSubject || opportunity.subject || "",
          initialBodyHtml: opportunity.draftEmailBody || "",
          missionBrief: null,
        }}
        brandColumn={"todo"}
        useHubspot={false}
        onClose={() => setComposerOpen(false)}
        onSaved={(state: "pret" | "en_cours" | "reset", draft?: { subject: string; bodyHtml: string }) => {
          if (state === "reset") return;
          void saveDraft(draft).catch((e: unknown) => {
            const msg = e instanceof Error ? e.message : "Erreur sauvegarde brouillon";
            window.alert(msg);
          });
        }}
        onError={(msg) => window.alert(msg)}
        onSuccess={() => {
          void (async () => {
            const res = await fetch(`/api/inbound/opportunities/${opportunity.id}`, {
              cache: "no-store",
              credentials: "include",
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.opportunity) {
              setOpportunity(data.opportunity as Opportunity);
            }
          })();
        }}
      />
    </div>
  );
}
