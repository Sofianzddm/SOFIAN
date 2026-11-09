"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Loader2, AlertTriangle, Gift, Plus } from "lucide-react";

const FILTERS = [
  { value: "TOUS", label: "Tous" },
  { value: "EN_ATTENTE", label: "En attente" },
  { value: "EN_COURS", label: "En cours" },
  { value: "ATTENTE_MARQUE", label: "Attente marque" },
  { value: "ACCEPTE", label: "Accepté" },
  { value: "ENVOYE", label: "Envoyé" },
  { value: "ARCHIVES", label: "Archivés" },
] as const;

const TYPE_LABELS: Record<string, string> = {
  PRODUIT: "Produit",
  EXPERIENCE: "Expérience",
  SERVICE: "Service",
  HOTEL: "Hôtel",
  AUTRE: "Autre",
};

const PRIORITE_STYLE: Record<string, string> = {
  BASSE: "text-zinc-600 bg-zinc-50 border-zinc-200",
  NORMALE: "text-blue-700 bg-blue-50 border-blue-200",
  HAUTE: "text-orange-700 bg-orange-50 border-orange-200",
  URGENTE: "text-red-700 bg-red-50 border-red-200",
};

const PRIORITE_LABEL: Record<string, string> = {
  BASSE: "Basse",
  NORMALE: "Normale",
  HAUTE: "Haute",
  URGENTE: "Urgente",
};

const STATUT_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  BROUILLON: { label: "Brouillon", color: "#52525b", bg: "#f4f4f5" },
  EN_ATTENTE: { label: "En attente", color: "#a16207", bg: "#fef9c3" },
  EN_COURS: { label: "En cours", color: "#1d4ed8", bg: "#dbeafe" },
  ATTENTE_MARQUE: { label: "Attente marque", color: "#6d28d9", bg: "#f5f3ff" },
  ACCEPTE: { label: "Accepté", color: "#047857", bg: "#d1fae5" },
  REFUSE: { label: "Refusé", color: "#b91c1c", bg: "#fee2e2" },
  ENVOYE: { label: "Envoyé", color: "#4338ca", bg: "#e0e7ff" },
  RECU: { label: "Reçu", color: "#15803d", bg: "#dcfce7" },
  ANNULE: { label: "Annulé", color: "#52525b", bg: "#f4f4f5" },
};

export default function GiftsPage() {
  const { data: session } = useSession();
  const [demandes, setDemandes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtreStatut, setFiltreStatut] = useState("TOUS");
  const [searchTerm, setSearchTerm] = useState("");

  const user = session?.user as { role?: string };
  const isTM = user?.role === "TM";
  const isAM = user?.role === "CM" || user?.role === "ADMIN";
  const canCreate =
    !!user?.role &&
    ["TM", "CM", "ADMIN", "HEAD_OF_INFLUENCE"].includes(user.role);

  useEffect(() => {
    fetchDemandes();
  }, [filtreStatut]);

  const fetchDemandes = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      params.append("statut", filtreStatut);
      const res = await fetch(`/api/gifts?${params.toString()}`);
      if (!res.ok) throw new Error("Erreur de chargement");
      const data = await res.json();
      setDemandes(data);
    } catch (err) {
      console.error(err);
      setError("Erreur lors du chargement des demandes");
    } finally {
      setLoading(false);
    }
  };

  const demandesFiltrees = demandes.filter((d) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      d.reference.toLowerCase().includes(searchLower) ||
      `${d.talent.prenom} ${d.talent.nom}`.toLowerCase().includes(searchLower) ||
      d.description.toLowerCase().includes(searchLower)
    );
  });

  const stats = [
    { label: "Total", value: demandes.length, dot: "#71717a" },
    {
      label: "En attente",
      value: demandes.filter((d) => d.statut === "EN_ATTENTE").length,
      dot: "#eab308",
    },
    {
      label: "En cours",
      value: demandes.filter(
        (d) => d.statut === "EN_COURS" || d.statut === "ATTENTE_MARQUE"
      ).length,
      dot: "#3b82f6",
    },
    {
      label: "Accepté",
      value: demandes.filter(
        (d) => d.statut === "ACCEPTE" || d.statut === "ENVOYE"
      ).length,
      dot: "#10b981",
    },
    {
      label: "Reçu",
      value: demandes.filter((d) => d.statut === "RECU").length,
      dot: "#8b5cf6",
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-7 w-7 animate-spin text-violet-700" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1080px] flex-col gap-7 pb-16 pt-2">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 text-2xl font-semibold tracking-tight text-zinc-900">
            Demandes de Gifts
          </h1>
          <p className="m-0 text-sm text-zinc-500">
            {isTM
              ? "Demandez des produits ou services pour vos talents. L'Account Manager prendra en charge votre demande."
              : "Gérez toutes les demandes de gifts des Talent Managers."}
          </p>
        </div>
        {canCreate && (
          <Link
            href="/gifts/new"
            className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg bg-violet-700 px-4 text-sm font-medium text-white transition-colors hover:bg-violet-800"
          >
            <Plus className="h-4 w-4" />
            Nouvelle demande
          </Link>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className={`flex flex-col gap-2 px-6 py-5 ${
              i < stats.length - 1 ? "border-r border-zinc-100" : ""
            }`}
          >
            <div className="flex items-center gap-2 text-[13px] text-zinc-500">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: s.dot }}
              />
              {s.label}
            </div>
            <div className="text-[28px] font-semibold tracking-tight text-zinc-900">
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Rechercher par référence, talent ou description…"
          className="h-[38px] min-w-[240px] flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-violet-600 focus:ring-[3px] focus:ring-violet-600/15"
        />
        <div className="inline-flex flex-wrap gap-0.5 rounded-lg bg-zinc-100 p-[3px]">
          {FILTERS.map((f) => {
            const on = filtreStatut === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setFiltreStatut(f.value)}
                className={`h-8 rounded-md px-3 text-[13px] font-medium transition-colors ${
                  on
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "bg-transparent text-zinc-500 hover:text-zinc-700"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Liste */}
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-red-500" />
          <p className="text-sm font-medium text-red-700">{error}</p>
        </div>
      ) : demandesFiltrees.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-violet-50">
            <Gift className="h-6 w-6 text-violet-700" />
          </div>
          <p className="text-sm text-zinc-500">
            {searchTerm
              ? "Aucune demande ne correspond."
              : isTM
              ? "Créez votre première demande de gift pour vos talents."
              : "Aucune demande de gift pour le moment."}
          </p>
          {canCreate && !searchTerm && (
            <Link
              href="/gifts/new"
              className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg bg-violet-700 px-4 text-sm font-medium text-white hover:bg-violet-800"
            >
              <Plus className="h-4 w-4" />
              Nouvelle demande
            </Link>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {demandesFiltrees.map((demande) => (
            <DemandeCard key={demande.id} demande={demande} isAM={isAM} />
          ))}
        </div>
      )}
    </div>
  );
}

function DemandeCard({ demande, isAM }: { demande: any; isAM: boolean }) {
  const villeLivraison = demande.adresseLivraison
    ? demande.adresseLivraison
        .split("\n")
        .map((l: string) => l.trim())
        .filter(Boolean)
        .pop()
    : null;

  const formatValeurEstimee = (val: any) => {
    if (!val) return null;
    const n = typeof val === "number" ? val : parseFloat(val);
    if (Number.isNaN(n)) return null;
    return `~${n.toLocaleString("fr-FR")} €`;
  };

  const formatContrepartie = () => {
    const type = demande.contrepartieType as string | null;
    const delai = demande.contrepartieDelai as number | null;
    const notes = demande.contrepartieNotes as string | null;
    if (!type && !notes) return null;

    const labels: Record<string, string> = {
      STORY: "Story",
      POST_FEED: "Post feed",
      REEL_TIKTOK: "Reel / TikTok",
      MENTION_STORY: "Mention story",
      CHOIX_TALENT: "Au choix du talent",
      AUCUNE: "Aucune",
    };

    const baseLabel = type ? labels[type] || type : "Contrepartie";
    const withDelai =
      delai && delai > 0 ? `${baseLabel} dans ${delai}j` : baseLabel;
    return notes ? `${withDelai} · ${notes}` : withDelai;
  };

  const marquesLabels = (() => {
    const labels = [
      ...(demande.marques || []).map(
        (m: { marque: { nom: string } }) => m.marque.nom
      ),
      ...(demande.partners || []).map(
        (p: { partner: { name: string } }) => p.partner.name
      ),
    ];
    if (labels.length === 0 && demande.marque?.nom) {
      labels.push(demande.marque.nom);
    }
    return labels.length > 0 ? labels.join(", ") : "Aucun";
  })();

  const fields: { k: string; v: string }[] = [
    {
      k: "Talent",
      v: `${demande.talent.prenom} ${demande.talent.nom}`,
    },
  ];

  if (isAM) {
    fields.push({
      k: "TM",
      v: `${demande.tm.prenom} ${demande.tm.nom}`,
    });
  }

  fields.push(
    {
      k: "Account Manager",
      v: demande.accountManager
        ? `${demande.accountManager.prenom} ${demande.accountManager.nom}`
        : "Non assigné",
    },
    { k: "Marques / partenaires", v: marquesLabels },
    {
      k: "Créée le",
      v: new Date(demande.createdAt).toLocaleDateString("fr-FR"),
    }
  );

  const valeur = formatValeurEstimee(demande.valeurEstimee);
  if (valeur) fields.push({ k: "Valeur estimée", v: valeur });

  const contrepartie = formatContrepartie();
  if (contrepartie) fields.push({ k: "Contrepartie", v: contrepartie });

  if (demande.typeGift === "HOTEL") {
    if (demande.destination)
      fields.push({ k: "Destination", v: demande.destination });
    if (demande.dateArrivee || demande.dateDepart) {
      fields.push({
        k: "Séjour",
        v: [
          demande.dateArrivee &&
            `Du ${new Date(demande.dateArrivee).toLocaleDateString("fr-FR")}`,
          demande.dateDepart &&
            `au ${new Date(demande.dateDepart).toLocaleDateString("fr-FR")}`,
        ]
          .filter(Boolean)
          .join(" "),
      });
    }
    if (demande.nombrePersonnes)
      fields.push({ k: "Personnes", v: String(demande.nombrePersonnes) });
    if (demande.categorie)
      fields.push({ k: "Catégorie", v: demande.categorie });
  } else {
    if (demande.datesouhaitee) {
      fields.push({
        k: "Réception souhaitée",
        v: new Date(demande.datesouhaitee).toLocaleDateString("fr-FR"),
      });
    }
    if (villeLivraison) {
      fields.push({ k: "Ville de livraison", v: villeLivraison });
    }
  }

  const statut = STATUT_STYLE[demande.statut] || STATUT_STYLE.EN_ATTENTE;
  const prioClass =
    PRIORITE_STYLE[demande.priorite] || PRIORITE_STYLE.NORMALE;
  const initials = `${demande.talent.prenom?.[0] || ""}${
    demande.talent.nom?.[0] || ""
  }`.toUpperCase();

  const lastComment = demande.commentaires?.[0];

  return (
    <Link
      href={`/gifts/${demande.id}`}
      className="group flex cursor-pointer flex-col gap-[18px] rounded-xl border border-zinc-200 bg-white p-6 shadow-sm transition-colors hover:border-violet-300"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          {/* Photo talent */}
          <div className="h-14 w-14 flex-none overflow-hidden rounded-xl bg-zinc-100 ring-1 ring-zinc-200">
            {demande.talent.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={demande.talent.photo}
                alt={`${demande.talent.prenom} ${demande.talent.nom}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-violet-50 text-sm font-semibold text-violet-700">
                {initials || "?"}
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-base font-semibold tracking-tight text-zinc-900">
                {demande.reference}
              </span>
              <span className="rounded-md bg-violet-50 px-2 py-[3px] text-[11px] font-semibold uppercase tracking-wide text-violet-700">
                {TYPE_LABELS[demande.typeGift] || demande.typeGift}
              </span>
              {demande.archivedAt && (
                <span className="rounded-full bg-zinc-100 px-2.5 py-[3px] text-xs font-medium text-zinc-600">
                  Archivée
                </span>
              )}
            </div>
            <p className="m-0 line-clamp-2 text-sm leading-relaxed text-zinc-600">
              {demande.description}
            </p>
          </div>
        </div>

        <div className="flex flex-none flex-wrap justify-end gap-1.5">
          <span
            className={`rounded-full border px-2.5 py-[3px] text-xs font-medium ${prioClass}`}
          >
            {PRIORITE_LABEL[demande.priorite] || demande.priorite}
          </span>
          <span
            className="rounded-full px-2.5 py-[3px] text-xs font-medium"
            style={{ color: statut.color, background: statut.bg }}
          >
            {statut.label}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-x-6 gap-y-4 border-t border-zinc-100 pt-[18px]">
        {fields.map((f) => (
          <div key={f.k} className="flex min-w-0 flex-col gap-0.5">
            <span className="text-xs text-zinc-500">{f.k}</span>
            <span className="truncate text-sm font-medium text-zinc-900">
              {f.v}
            </span>
          </div>
        ))}
      </div>

      {lastComment && (
        <div className="flex items-baseline gap-2.5 rounded-lg bg-zinc-50 px-3 py-2.5 text-[13px] leading-relaxed text-zinc-600">
          <span className="whitespace-nowrap font-semibold text-zinc-900">
            {lastComment.auteur.prenom} {lastComment.auteur.nom}
          </span>
          <span className="whitespace-nowrap text-zinc-400">
            {new Date(lastComment.createdAt).toLocaleDateString("fr-FR")}
          </span>
          <span className="line-clamp-1">{lastComment.contenu}</span>
        </div>
      )}
    </Link>
  );
}
