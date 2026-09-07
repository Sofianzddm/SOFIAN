"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { LevelBadge, StatusPill, EmptyState } from "@/components/decision-center/ui";
import { DC_DOMAIN_LABELS, DC_RISK_LABELS, DC_RISK_TYPE_LABELS } from "@/lib/decision-center/labels";

type Req = {
  id: string;
  reference: string;
  title: string;
  domain: string;
  requesterName: string | null;
  deadline: string | null;
  context: string;
  question: string;
  optionA: string;
  optionB: string | null;
  optionC: string | null;
  recommendation: string;
  amount: number | null;
  currency: string;
  amountTaxMode: string;
  recurring: boolean;
  riskLevel: string;
  riskTypes: string[];
  status: string;
  finalDecision: string | null;
  finalOption: string | null;
  comments: { id: string; body: string; authorName: string; createdAt: string }[];
  policyLevel: string | null;
};

export default function DecisionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [req, setReq] = useState<Req | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [info, setInfo] = useState("");

  async function reload() {
    const res = await fetch(`/api/decision-center/requests/${id}`);
    if (res.ok) setReq((await res.json()).request);
  }

  useEffect(() => {
    void reload();
    fetch("/api/decision-center/session")
      .then((r) => r.json())
      .then((s) => setRole(s.dcRole));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function decide(action: string, extra?: string) {
    const res = await fetch(`/api/decision-center/requests/${id}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, comment: extra }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Action refusée");
      return;
    }
    toast.success("Décision enregistrée");
    void reload();
  }

  async function addComment() {
    if (!comment.trim()) return;
    await fetch(`/api/decision-center/requests/${id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: comment }),
    });
    setComment("");
    void reload();
  }

  async function execute() {
    const res = await fetch(`/api/decision-center/requests/${id}/execute`, { method: "POST" });
    if (!res.ok) {
      toast.error("Impossible de marquer comme exécuté");
      return;
    }
    toast.success("Marqué comme exécuté");
    void reload();
  }

  if (!req) return <EmptyState title="Chargement" hint="Dossier…" />;

  const isCeo = role === "CEO";
  const pending = req.status === "SUBMITTED" || req.status === "NEEDS_INFORMATION";

  return (
    <div className="space-y-6">
      <button className="text-sm text-gray-500" onClick={() => router.back()}>
        ← Retour
      </button>

      <section className="card space-y-3">
        <p className="text-xs text-gray-500">{req.reference}</p>
        <div className="flex flex-wrap items-center gap-2">
          {req.policyLevel && <LevelBadge level={req.policyLevel} />}
          <h1 className="text-2xl font-semibold text-glowup-licorice">{req.title}</h1>
          <StatusPill status={req.status} />
        </div>
        <p className="text-sm text-gray-500">
          {DC_DOMAIN_LABELS[req.domain as keyof typeof DC_DOMAIN_LABELS]} · {req.requesterName}
          {req.deadline ? ` · ${new Date(req.deadline).toLocaleString("fr-FR")}` : ""}
        </p>

        <div>
          <p className="text-xs uppercase text-gray-500">Contexte</p>
          <p className="text-sm whitespace-pre-wrap">{req.context}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-gray-500">Décision</p>
          <p className="font-medium">{req.question}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-gray-500">Options</p>
          <p>A — {req.optionA}</p>
          {req.optionB && <p>B — {req.optionB}</p>}
          {req.optionC && <p>C — {req.optionC}</p>}
        </div>
        <div className="rounded-lg bg-glowup-lace px-4 py-3">
          <p className="text-xs uppercase text-gray-500">Recommandation de l’owner</p>
          <p className="font-medium text-glowup-licorice">{req.recommendation}</p>
        </div>
        {req.amount != null && (
          <p className="text-sm">
            Impact : {req.amount} {req.currency} {req.amountTaxMode}{" "}
            {req.recurring ? "récurrent" : "ponctuel"}
          </p>
        )}
        <p className="text-sm">
          Risque : {DC_RISK_LABELS[req.riskLevel as keyof typeof DC_RISK_LABELS]}
          {req.riskTypes.length
            ? ` · ${req.riskTypes.map((t) => DC_RISK_TYPE_LABELS[t as keyof typeof DC_RISK_TYPE_LABELS]).join(" · ")}`
            : ""}
        </p>
        {req.finalDecision && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
            {req.finalDecision}
          </div>
        )}
      </section>

      {isCeo && pending && (
        <section className="card space-y-3">
          <h2 className="font-semibold">DECISION SOFIAN</h2>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={() => void decide("APPROVE_RECO")}>
              Approuver recommandation
            </button>
            <button className="btn btn-secondary" onClick={() => void decide("CHOOSE_A")}>
              Choisir A
            </button>
            {req.optionB && (
              <button className="btn btn-secondary" onClick={() => void decide("CHOOSE_B")}>
                Choisir B
              </button>
            )}
            {req.optionC && (
              <button className="btn btn-secondary" onClick={() => void decide("CHOOSE_C")}>
                Choisir C
              </button>
            )}
            <button className="btn btn-danger" onClick={() => void decide("REJECT")}>
              Refuser
            </button>
          </div>
          <textarea
            className="input min-h-20"
            placeholder="Précision à demander…"
            value={info}
            onChange={(e) => setInfo(e.target.value)}
          />
          <button
            className="btn btn-outline"
            onClick={() => void decide("REQUEST_INFO", info)}
          >
            Demander précision
          </button>
        </section>
      )}

      {req.status === "APPROVED" && (role === "CEO" || role === "EXECUTIVE_ASSISTANT") && (
        <button className="btn btn-secondary" onClick={() => void execute()}>
          Marquer comme exécuté
        </button>
      )}

      <section className="card space-y-3">
        <h2 className="font-semibold">Fil</h2>
        {req.comments.map((c) => (
          <div key={c.id} className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
            <p className="text-xs text-gray-500">
              {c.authorName} · {new Date(c.createdAt).toLocaleString("fr-FR")}
            </p>
            <p>{c.body}</p>
          </div>
        ))}
        <div className="flex gap-2">
          <input className="input" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Commentaire" />
          <button className="btn btn-secondary" onClick={() => void addComment()}>
            Envoyer
          </button>
        </div>
      </section>
    </div>
  );
}
