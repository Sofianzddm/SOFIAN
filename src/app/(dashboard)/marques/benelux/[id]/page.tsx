"use client";

/**
 * Fiche entreprise BENELUX — pendant « light » de la fiche marque FR pour
 * l'annuaire de prospection BENELUX (données 100 % séparées du CRM FR).
 * Identité + contacts (champs carto, statut outreach par contact) et accès
 * direct au pipeline /outreach pré-filtré sur l'entreprise.
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Globe,
  MapPin,
  Mail,
  Users,
  Loader2,
  Linkedin,
  Send,
  Star,
  StickyNote,
  Building2,
  Trash2,
} from "lucide-react";

const INK = "#16110F";
const ROSE = "#C08B8B";

type OutreachInfo = {
  id: string;
  status: "TO_CONTACT" | "WAITING" | "TO_RECONTACT" | "STOPPED";
  cycleCount: number;
  lastSentAt: string | null;
  nextRecontactAt: string | null;
  lastRepliedAt: string | null;
};

type BeneluxContact = {
  id: string;
  prenom: string;
  nom: string | null;
  email: string | null;
  poste: string | null;
  language: string;
  principal: boolean;
  source: string | null;
  perimetre: string | null;
  localisation: string | null;
  priorite: string | null;
  linkedinUrl: string | null;
  outreachExcluded: boolean;
  outreachTargets: OutreachInfo[];
};

type CompanyDetail = {
  id: string;
  nom: string;
  secteur: string | null;
  siteWeb: string | null;
  ville: string | null;
  notes: string | null;
  createdAt: string;
  contacts: BeneluxContact[];
  _count: { contacts: number; outreachTargets: number };
};

const STATUS_LABELS: Record<OutreachInfo["status"], { label: string; bg: string; fg: string }> = {
  TO_CONTACT: { label: "À contacter", bg: "#ECFDF5", fg: "#047857" },
  WAITING: { label: "En attente", bg: "#FEF9C3", fg: "#854D0E" },
  TO_RECONTACT: { label: "À recontacter", bg: "#EFF6FF", fg: "#1D4ED8" },
  STOPPED: { label: "Stoppé", bg: "#F3F4F6", fg: "#6B7280" },
};

function formatDate(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function BeneluxCompanyPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDeleteContact = async (contact: BeneluxContact) => {
    const name = [contact.prenom, contact.nom].filter(Boolean).join(" ") || "ce contact";
    if (
      !confirm(
        `Supprimer ${name} ?\n\nLe contact et son suivi de prospection seront définitivement supprimés.`
      )
    ) {
      return;
    }
    setDeletingId(contact.id);
    try {
      const res = await fetch(`/api/benelux-outreach/contacts/${contact.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        alert(data?.error || "Erreur lors de la suppression.");
        return;
      }
      setCompany((prev) =>
        prev
          ? {
              ...prev,
              contacts: prev.contacts.filter((c) => c.id !== contact.id),
              _count: {
                ...prev._count,
                contacts: Math.max(0, prev._count.contacts - 1),
                outreachTargets: Math.max(
                  0,
                  prev._count.outreachTargets - contact.outreachTargets.length
                ),
              },
            }
          : prev
      );
    } catch {
      alert("Erreur lors de la suppression.");
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/benelux-outreach/companies/${params.id}`);
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.error || "Erreur de chargement");
          return;
        }
        setCompany(data.company);
      } catch {
        if (!cancelled) setError("Erreur de chargement");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center">
        <p className="text-sm text-gray-500 mb-4">{error || "Entreprise introuvable."}</p>
        <Link
          href="/marques"
          className="inline-flex items-center gap-2 text-sm font-semibold hover:underline"
          style={{ color: INK }}
        >
          <ArrowLeft className="w-4 h-4" />
          Retour à l'annuaire
        </Link>
      </div>
    );
  }

  const domain = company.siteWeb
    ? company.siteWeb.replace(/^https?:\/\//, "").split("/")[0]
    : null;
  const inCycle = company._count.outreachTargets;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Topbar */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => router.push("/marques")}
          className="inline-flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Annuaire BENELUX
        </button>
        <Link
          href={`/outreach?market=BENELUX&q=${encodeURIComponent(company.nom)}`}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-semibold rounded-lg text-white hover:opacity-90 transition-opacity"
          style={{ backgroundColor: INK }}
        >
          <Send className="w-3.5 h-3.5" />
          Voir dans l'outreach
        </Link>
      </div>

      {/* Identité */}
      <div className="rounded-2xl bg-white ring-1 ring-black/[0.06] shadow-[0_1px_2px_rgba(16,12,10,0.04)] p-6 mb-6">
        <div className="flex flex-wrap items-start gap-4">
          <div
            className="rounded-xl flex items-center justify-center shrink-0 text-lg font-bold text-white w-14 h-14"
            style={{ background: `linear-gradient(135deg, ${ROSE}, #9C6B6B)` }}
          >
            {company.nom.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold" style={{ color: INK }}>
                {company.nom}
              </h1>
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide"
                style={{ backgroundColor: "#FEF3C7", color: "#92400E" }}
                title="Entreprise prospect BENELUX (séparée des marques FR)"
              >
                🇧🇪 BENELUX
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[13px] text-gray-500">
              {company.secteur && (
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" />
                  {company.secteur}
                </span>
              )}
              {company.ville && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  {company.ville}
                </span>
              )}
              {domain && (
                <a
                  href={company.siteWeb!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 hover:underline"
                >
                  <Globe className="w-3.5 h-3.5" />
                  {domain}
                </a>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                {company._count.contacts} contact{company._count.contacts > 1 ? "s" : ""}
                {inCycle > 0 &&
                  ` · ${inCycle} suivi${inCycle > 1 ? "s" : ""} en prospection`}
              </span>
            </div>
          </div>
        </div>
        {company.notes && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex items-start gap-2 text-[13px] text-gray-600">
            <StickyNote className="w-4 h-4 shrink-0 mt-0.5 text-gray-400" />
            <p className="whitespace-pre-wrap">{company.notes}</p>
          </div>
        )}
      </div>

      {/* Contacts */}
      <div className="rounded-2xl bg-white ring-1 ring-black/[0.06] shadow-[0_1px_2px_rgba(16,12,10,0.04)] overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold" style={{ color: INK }}>
            Contacts
          </h2>
        </div>
        {company.contacts.length === 0 ? (
          <p className="px-5 py-8 text-sm text-gray-400 text-center">
            Aucun contact enregistré pour cette entreprise.
          </p>
        ) : (
          <div className="divide-y divide-gray-50">
            {company.contacts.map((c) => {
              const target = c.outreachTargets[0];
              const status = target ? STATUS_LABELS[target.status] : null;
              const fullName = [c.prenom, c.nom].filter(Boolean).join(" ");
              return (
                <div key={c.id} className="px-5 py-3.5 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[220px]">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold" style={{ color: INK }}>
                        {fullName || "Contact"}
                      </span>
                      {c.principal && (
                        <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                      )}
                      <span
                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase"
                        style={{ backgroundColor: "#F3F4F6", color: "#6B7280" }}
                      >
                        {c.language === "en" ? "🇬🇧 EN" : "🇫🇷 FR"}
                      </span>
                      {c.priorite && (
                        <span
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold"
                          style={{ backgroundColor: "#FFF1F2", color: "#BE123C" }}
                        >
                          {c.priorite}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs text-gray-500">
                      {c.poste && <span>{c.poste}</span>}
                      {c.perimetre && <span>{c.perimetre}</span>}
                      {c.localisation && <span>{c.localisation}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    {c.email ? (
                      <a
                        href={`mailto:${c.email}`}
                        className="inline-flex items-center gap-1 hover:underline"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        {c.email}
                      </a>
                    ) : (
                      <span className="italic text-gray-400">email à noter</span>
                    )}
                    {c.linkedinUrl && (
                      <a
                        href={c.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-[#0A66C2] transition-colors"
                        title="Profil LinkedIn"
                      >
                        <Linkedin className="w-4 h-4" />
                      </a>
                    )}
                    {status && (
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
                        style={{ backgroundColor: status.bg, color: status.fg }}
                        title={
                          target?.lastSentAt
                            ? `Dernier mail : ${formatDate(target.lastSentAt)}`
                            : undefined
                        }
                      >
                        {status.label}
                      </span>
                    )}
                    <button
                      onClick={() => handleDeleteContact(c)}
                      disabled={deletingId === c.id}
                      className="p-1.5 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                      title="Supprimer ce contact"
                    >
                      {deletingId === c.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
