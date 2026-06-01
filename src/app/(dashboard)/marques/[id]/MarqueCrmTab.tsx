"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Mail, Send, Handshake, Gift, Target, Inbox } from "lucide-react";

type TimelineItem = {
  id: string;
  type: string;
  label: string;
  sublabel?: string;
  date: string;
  href?: string;
  meta?: Record<string, unknown>;
};

type CrmCounts = {
  collaborations: number;
  negociations: number;
  demandesGift: number;
  inboundOpportunities: number;
  contactMissions: number;
  opportunitesMarque: number;
  demandesEntrantes: number;
  quotes: number;
};

const TYPE_LABELS: Record<string, string> = {
  INBOUND: "Inbound",
  PIPELINE: "Pipeline",
  NEGO: "Négo",
  COLLAB: "Collab",
  GIFT: "Gift",
  OPPORTUNITE: "Opportunité",
  DEMANDE_ENTRANTE: "Demande entrante",
};

const TYPE_ICONS: Record<string, typeof Inbox> = {
  INBOUND: Inbox,
  PIPELINE: Send,
  NEGO: Target,
  COLLAB: Handshake,
  GIFT: Gift,
  OPPORTUNITE: Mail,
  DEMANDE_ENTRANTE: Inbox,
};

export function MarqueCrmTab({ marqueId }: { marqueId: string }) {
  const [loading, setLoading] = useState(true);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [counts, setCounts] = useState<CrmCounts | null>(null);
  const [mergeSourceId, setMergeSourceId] = useState("");
  const [mergeStatus, setMergeStatus] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/marques/${marqueId}/crm`);
        if (res.ok) {
          const data = await res.json();
          setTimeline(data.timeline || []);
          setCounts(data.counts || null);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [marqueId]);

  const handleMerge = async () => {
    if (!mergeSourceId.trim()) return;
    if (!confirm("Fusionner cette marque dans la fiche actuelle ? Action irréversible.")) return;
    setMerging(true);
    setMergeStatus(null);
    try {
      const res = await fetch(`/api/marques/${marqueId}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceMarqueId: mergeSourceId.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur fusion");
      setMergeStatus("Fusion réussie. Recharge la page pour voir le résultat.");
      setMergeSourceId("");
    } catch (e) {
      setMergeStatus(e instanceof Error ? e.message : "Erreur");
    } finally {
      setMerging(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-glowup-rose" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {counts && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Inbounds", n: counts.inboundOpportunities },
            { label: "Pipeline", n: counts.contactMissions },
            { label: "Négos", n: counts.negociations },
            { label: "Collabs", n: counts.collaborations },
            { label: "Gifts", n: counts.demandesGift },
            { label: "Opportunités", n: counts.opportunitesMarque },
            { label: "Demandes", n: counts.demandesEntrantes },
            { label: "Devis", n: counts.quotes },
          ].map((s) => (
            <div key={s.label} className="p-3 bg-gray-50 rounded-xl text-center">
              <p className="text-2xl font-bold text-glowup-licorice">{s.n}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">
          Timeline (toutes sources)
        </h3>
        {timeline.length === 0 ? (
          <p className="text-gray-500 text-sm">Aucune activité liée pour l&apos;instant.</p>
        ) : (
          <ul className="space-y-2">
            {timeline.map((item) => {
              const Icon = TYPE_ICONS[item.type] || Inbox;
              const inner = (
                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                  <div className="p-2 bg-white rounded-lg border border-gray-100">
                    <Icon className="w-4 h-4 text-glowup-rose" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-glowup-lace text-glowup-licorice">
                        {TYPE_LABELS[item.type] || item.type}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(item.date).toLocaleString("fr-FR")}
                      </span>
                    </div>
                    <p className="font-medium text-glowup-licorice truncate">{item.label}</p>
                    {item.sublabel && (
                      <p className="text-sm text-gray-500 truncate">{item.sublabel}</p>
                    )}
                  </div>
                </div>
              );
              return (
                <li key={item.id}>
                  {item.href ? (
                    <Link href={item.href}>{inner}</Link>
                  ) : (
                    inner
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-gray-100 pt-6">
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-2">
          Fusionner un doublon
        </h3>
        <p className="text-sm text-gray-500 mb-3">
          Colle l&apos;ID de la fiche doublon à absorber dans celle-ci (ADMIN / HEAD).
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={mergeSourceId}
            onChange={(e) => setMergeSourceId(e.target.value)}
            placeholder="ID marque source (doublon)"
            className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm"
          />
          <button
            type="button"
            onClick={handleMerge}
            disabled={merging || !mergeSourceId.trim()}
            className="px-4 py-2 bg-glowup-licorice text-white rounded-xl text-sm disabled:opacity-50"
          >
            {merging ? "Fusion…" : "Fusionner"}
          </button>
        </div>
        {mergeStatus && <p className="text-sm mt-2 text-gray-600">{mergeStatus}</p>}
      </div>
    </div>
  );
}
