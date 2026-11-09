"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Loader2, AlertCircle, AlertTriangle, X, ScanSearch } from "lucide-react";

type MarqueOption = { id: string; nom: string; raisonSociale?: string | null };
type PartnerOption = { id: string; name: string; market?: string };

type CibleSelection =
  | { type: "MARQUE"; id: string; label: string }
  | { type: "PARTNER"; id: string; label: string };

type MarqueSuggestion = MarqueOption & {
  matchedAlias?: string | null;
  exactMatch?: boolean;
  ville?: string;
};

const TYPES_GIFT = [
  { value: "PRODUIT", label: "Produit" },
  { value: "EXPERIENCE", label: "Expérience" },
  { value: "SERVICE", label: "Service" },
  { value: "HOTEL", label: "Hôtel" },
  { value: "AUTRE", label: "Autre" },
] as const;

const PRIORITES = [
  { value: "BASSE", label: "Basse" },
  { value: "NORMALE", label: "Normale" },
  { value: "HAUTE", label: "Haute" },
  { value: "URGENTE", label: "Urgente" },
] as const;

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap self-start gap-0.5 rounded-lg bg-zinc-100 p-[3px]">
      {options.map((opt) => {
        const on = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`h-8 rounded-md px-3.5 text-[13px] font-medium transition-colors ${
              on
                ? "bg-white text-zinc-900 shadow-sm"
                : "bg-transparent text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function FieldLabel({
  children,
  required,
  optional,
}: {
  children: React.ReactNode;
  required?: boolean;
  optional?: boolean;
}) {
  return (
    <div className="text-[13px] font-medium text-zinc-900">
      {children}
      {required && <span className="text-red-600"> *</span>}
      {optional && (
        <span className="font-normal text-zinc-400"> (optionnel)</span>
      )}
    </div>
  );
}

function Section({
  title,
  description,
  children,
  last,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div className={`p-5 sm:p-7 ${last ? "" : "border-b border-zinc-200"}`}>
      <div className="mb-5">
        <div className="text-sm font-semibold text-zinc-900">{title}</div>
        <div className="mt-1 text-[13px] leading-relaxed text-zinc-500">
          {description}
        </div>
      </div>
      <div className="flex flex-col gap-5">{children}</div>
    </div>
  );
}

const inputClass =
  "h-[38px] w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-violet-600 focus:ring-[3px] focus:ring-violet-600/15";
const textareaClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-violet-600 focus:ring-[3px] focus:ring-violet-600/15 resize-y";

export default function NewGiftPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [talents, setTalents] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [marques, setMarques] = useState<MarqueOption[]>([]);
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [cibleQuery, setCibleQuery] = useState("");
  const [marqueSuggestions, setMarqueSuggestions] = useState<MarqueSuggestion[]>(
    []
  );
  const [searchingCibles, setSearchingCibles] = useState(false);
  const [selectedCibles, setSelectedCibles] = useState<CibleSelection[]>([]);
  const [showCibleSuggestions, setShowCibleSuggestions] = useState(false);
  const [enrichingMarque, setEnrichingMarque] = useState(false);
  const [enrichFlash, setEnrichFlash] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    talentId: "",
    typeGift: "PRODUIT",
    description: "",
    justification: "",
    valeurEstimee: "",
    priorite: "NORMALE",
    dateSouhaitee: "",
    adresseLivraison: "",
    destination: "",
    dateArrivee: "",
    dateDepart: "",
    nombrePersonnes: "",
    typeHebergement: "",
    categorie: "",
    demandesSpeciales: "",
  });

  const user = session?.user as { role?: string; id?: string };
  const isHotel = formData.typeGift === "HOTEL";

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoadingData(true);
        const [talentsRes, marquesRes, partnersRes] = await Promise.all([
          fetch("/api/gifts?mode=talents"),
          fetch("/api/marques/options"),
          fetch("/api/partners/options"),
        ]);

        if (talentsRes.ok) setTalents(await talentsRes.json());
        if (marquesRes.ok) {
          const data = await marquesRes.json();
          setMarques(Array.isArray(data.marques) ? data.marques : []);
        }
        if (partnersRes.ok) {
          const data = await partnersRes.json();
          setPartners(Array.isArray(data.partners) ? data.partners : []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingData(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    const q = cibleQuery.trim();
    if (q.length < 2) {
      setMarqueSuggestions([]);
      setSearchingCibles(false);
      return;
    }

    let cancelled = false;
    setSearchingCibles(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/marques/search?q=${encodeURIComponent(q)}`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setMarqueSuggestions(Array.isArray(data.marques) ? data.marques : []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setSearchingCibles(false);
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cibleQuery]);

  const selectedMarqueIds = useMemo(
    () =>
      new Set(
        selectedCibles.filter((c) => c.type === "MARQUE").map((c) => c.id)
      ),
    [selectedCibles]
  );
  const selectedPartnerIds = useMemo(
    () =>
      new Set(
        selectedCibles.filter((c) => c.type === "PARTNER").map((c) => c.id)
      ),
    [selectedCibles]
  );

  const partnerSuggestions = useMemo(() => {
    const q = normalize(cibleQuery);
    if (q.length < 2) return [];
    return partners
      .filter(
        (p) => !selectedPartnerIds.has(p.id) && normalize(p.name).includes(q)
      )
      .sort((a, b) => {
        const an = normalize(a.name);
        const bn = normalize(b.name);
        const aExact = an === q ? 0 : an.startsWith(q) ? 1 : 2;
        const bExact = bn === q ? 0 : bn.startsWith(q) ? 1 : 2;
        if (aExact !== bExact) return aExact - bExact;
        return a.name.localeCompare(b.name, "fr");
      })
      .slice(0, 8);
  }, [partners, cibleQuery, selectedPartnerIds]);

  const exactMarqueMatch = useMemo(() => {
    const q = normalize(cibleQuery);
    if (!q) return null;
    const fromSearch = marqueSuggestions.find((m) => m.exactMatch);
    if (fromSearch) return fromSearch;
    return (
      marques.find(
        (m) =>
          normalize(m.nom) === q ||
          (!!m.raisonSociale && normalize(m.raisonSociale) === q)
      ) || null
    );
  }, [marques, cibleQuery, marqueSuggestions]);

  const addCible = (cible: CibleSelection) => {
    setSelectedCibles((prev) =>
      prev.some((c) => c.type === cible.type && c.id === cible.id)
        ? prev
        : [...prev, cible]
    );
    setCibleQuery("");
    setMarqueSuggestions([]);
    setShowCibleSuggestions(false);
  };

  const removeCible = (cible: CibleSelection) => {
    setSelectedCibles((prev) =>
      prev.filter((c) => !(c.type === cible.type && c.id === cible.id))
    );
  };

  const handleEnrichirMarque = async () => {
    const nom = cibleQuery.trim();
    if (!nom) {
      setError("Saisissez le nom de la marque à enrichir");
      return;
    }
    if (exactMarqueMatch) {
      addCible({
        type: "MARQUE",
        id: exactMarqueMatch.id,
        label: exactMarqueMatch.nom,
      });
      return;
    }
    if (!formData.talentId) {
      setError("Sélectionnez d'abord un talent");
      return;
    }

    try {
      setEnrichingMarque(true);
      setError(null);
      setEnrichFlash(null);
      const res = await fetch("/api/gifts/enrich-marque", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom,
          talentId: formData.talentId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Impossible d'envoyer en enrichissement");
      }
      const marque = data.marque as { id: string; nom: string };
      setMarques((prev) =>
        prev.some((m) => m.id === marque.id) ? prev : [...prev, marque]
      );
      addCible({ type: "MARQUE", id: marque.id, label: marque.nom });
      setEnrichFlash(
        data.message ||
          `${marque.nom} ajoutée et envoyée en enrichissement.`
      );
      setCibleQuery("");
      setMarqueSuggestions([]);
      setShowCibleSuggestions(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur enrichissement");
    } finally {
      setEnrichingMarque(false);
    }
  };

  const setField = (name: string, value: string) => {
    setFormData((prev) => {
      const next = { ...prev, [name]: value };
      if (name === "talentId" && value) {
        const talent = talents.find((t) => t.id === value);
        if (talent?.adresse) {
          next.adresseLivraison =
            `${talent.adresse || ""}\n${talent.codePostal || ""} ${talent.ville || ""}\n${talent.pays || "France"}`.trim();
        }
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.talentId || !formData.typeGift) {
      setError("Veuillez remplir tous les champs obligatoires");
      return;
    }
    if (formData.typeGift !== "HOTEL" && !formData.description.trim()) {
      setError("Veuillez remplir la description");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const {
        destination,
        dateArrivee,
        dateDepart,
        nombrePersonnes,
        typeHebergement,
        categorie,
        demandesSpeciales,
        ...rest
      } = formData;

      const payload: Record<string, unknown> = {
        ...rest,
        description:
          rest.description.trim() ||
          (rest.typeGift === "HOTEL"
            ? `Demande d'hébergement${destination ? ` — ${destination}` : ""}`
            : rest.description),
        marqueIds: selectedCibles
          .filter((c) => c.type === "MARQUE")
          .map((c) => c.id),
        partnerIds: selectedCibles
          .filter((c) => c.type === "PARTNER")
          .map((c) => c.id),
        statut: "EN_ATTENTE",
      };

      if (rest.typeGift === "HOTEL") {
        payload.destination = destination || null;
        payload.dateArrivee = dateArrivee || null;
        payload.dateDepart = dateDepart || null;
        payload.nombrePersonnes = nombrePersonnes || null;
        payload.typeHebergement = typeHebergement || null;
        payload.categorie = categorie || null;
        payload.demandesSpeciales = demandesSpeciales || null;
      }

      const res = await fetch("/api/gifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur lors de la création");
      }

      const demande = await res.json();
      router.push(`/gifts/${demande.id}`);
    } catch (err: unknown) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "Erreur lors de la création de la demande"
      );
    } finally {
      setLoading(false);
    }
  };

  if (!user?.role || !["TM", "CM", "ADMIN", "HEAD_OF_INFLUENCE"].includes(user.role)) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-amber-500" />
        <h2 className="mb-2 text-xl font-semibold text-zinc-900">Accès réservé</h2>
        <p className="mb-6 text-sm text-zinc-500">
          Seuls les Talent Managers, Account Managers, Head of Influence et Admin
          peuvent créer des demandes de gifts.
        </p>
        <Link
          href="/gifts"
          className="inline-flex h-9 items-center rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
        >
          Retour aux demandes
        </Link>
      </div>
    );
  }

  const showSuggestions =
    showCibleSuggestions &&
    cibleQuery.trim().length >= 2 &&
    (searchingCibles ||
      marqueSuggestions.length > 0 ||
      partnerSuggestions.length > 0);

  const selectedTalent = talents.find((t) => t.id === formData.talentId) || null;
  const typeLabel =
    TYPES_GIFT.find((t) => t.value === formData.typeGift)?.label ||
    formData.typeGift;
  const prioriteLabel =
    PRIORITES.find((p) => p.value === formData.priorite)?.label ||
    formData.priorite;
  const talentInitials = selectedTalent
    ? `${selectedTalent.prenom?.[0] || ""}${selectedTalent.nom?.[0] || ""}`.toUpperCase()
    : "";

  return (
    <div className="-mx-4 -mt-4 min-h-[calc(100vh-4rem)] bg-zinc-50 pb-28 sm:-mx-6 sm:-mt-6 lg:-mx-8">
      {/* Breadcrumb */}
      <div className="flex h-14 items-center gap-2 border-b border-zinc-200 bg-white px-5 text-sm text-zinc-500 sm:px-8">
        <Link href="/gifts" className="hover:text-zinc-900">
          Demandes
        </Link>
        <span>/</span>
        <Link href="/gifts" className="hover:text-zinc-900">
          Gifts
        </Link>
        <span>/</span>
        <span className="font-medium text-zinc-900">Nouvelle demande</span>
      </div>

      <form
        id="new-gift-form"
        onSubmit={handleSubmit}
        className="mx-auto flex max-w-[1100px] flex-col gap-8 px-5 pt-8 sm:px-8"
      >
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Nouvelle demande de Gift
          </h1>
          <p className="text-sm text-zinc-500">
            Demandez un produit ou un service pour l&apos;un de vos talents.
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>
              <p className="font-semibold">Erreur</p>
              <p>{error}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-[260px_minmax(0,1fr)]">
          {/* Récap gauche */}
          <aside className="order-first md:sticky md:top-4 md:self-start">
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
              {selectedTalent ? (
                <div className="relative">
                  {selectedTalent.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selectedTalent.photo}
                      alt={`${selectedTalent.prenom} ${selectedTalent.nom}`}
                      className="aspect-[4/5] w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-[4/5] w-full items-center justify-center bg-gradient-to-br from-violet-100 to-zinc-100">
                      <span className="text-4xl font-semibold text-violet-400">
                        {talentInitials || "?"}
                      </span>
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-4 pt-12">
                    <p className="font-semibold text-white">
                      {selectedTalent.prenom} {selectedTalent.nom}
                    </p>
                    {selectedTalent.instagram && (
                      <p className="text-sm text-white/80">
                        @{selectedTalent.instagram}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 bg-zinc-100 px-4 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-2xl text-zinc-300 ring-1 ring-zinc-200">
                    ?
                  </div>
                  <p className="text-sm font-medium text-zinc-500">
                    Aucun talent
                  </p>
                  <p className="text-xs text-zinc-400">
                    Sélectionnez un bénéficiaire
                  </p>
                </div>
              )}

              <div className="space-y-3 border-t border-zinc-100 px-4 py-4 text-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  Récapitulatif
                </p>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-zinc-500">Type</span>
                  <span className="text-right font-medium text-zinc-900">
                    {typeLabel}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-zinc-500">Priorité</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      formData.priorite === "URGENTE"
                        ? "bg-red-50 text-red-700"
                        : formData.priorite === "HAUTE"
                          ? "bg-amber-50 text-amber-700"
                          : formData.priorite === "BASSE"
                            ? "bg-zinc-100 text-zinc-600"
                            : "bg-violet-50 text-violet-700"
                    }`}
                  >
                    {prioriteLabel}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="shrink-0 text-zinc-500">Cibles</span>
                  <span className="text-right font-medium text-zinc-900">
                    {selectedCibles.length > 0
                      ? selectedCibles.map((c) => c.label).join(", ")
                      : "—"}
                  </span>
                </div>
                {!isHotel && formData.dateSouhaitee && (
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-zinc-500">Réception</span>
                    <span className="text-right font-medium text-zinc-900">
                      {new Date(formData.dateSouhaitee).toLocaleDateString(
                        "fr-FR"
                      )}
                    </span>
                  </div>
                )}
                {isHotel && formData.destination && (
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-zinc-500">Destination</span>
                    <span className="text-right font-medium text-zinc-900">
                      {formData.destination}
                    </span>
                  </div>
                )}
                {formData.valeurEstimee && (
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-zinc-500">
                      {isHotel ? "Budget" : "Valeur"}
                    </span>
                    <span className="text-right font-medium text-zinc-900">
                      {Number(formData.valeurEstimee).toLocaleString("fr-FR", {
                        style: "currency",
                        currency: "EUR",
                      })}
                    </span>
                  </div>
                )}
                {formData.description.trim() && (
                  <div className="border-t border-zinc-100 pt-3">
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
                      Description
                    </p>
                    <p className="line-clamp-4 text-[13px] leading-relaxed text-zinc-600">
                      {formData.description.trim()}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </aside>

          <div className="min-w-0 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          {/* Demande */}
          <Section
            title="Demande"
            description="Bénéficiaire, nature et niveau de priorité."
          >
            <label className="flex flex-col gap-1.5">
              <FieldLabel required>Talent</FieldLabel>
              <select
                name="talentId"
                value={formData.talentId}
                onChange={(e) => setField("talentId", e.target.value)}
                required
                disabled={loadingData}
                className={`${inputClass} ${!formData.talentId ? "text-zinc-500" : ""}`}
              >
                <option value="">Sélectionner un talent</option>
                {talents.map((talent) => (
                  <option key={talent.id} value={talent.id}>
                    {talent.prenom} {talent.nom}
                    {talent.instagram ? ` (@${talent.instagram})` : ""}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-col gap-1.5">
              <FieldLabel required>Type de Gift</FieldLabel>
              <SegmentedControl
                options={TYPES_GIFT}
                value={formData.typeGift as (typeof TYPES_GIFT)[number]["value"]}
                onChange={(v) => setField("typeGift", v)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <FieldLabel>Priorité</FieldLabel>
              <SegmentedControl
                options={PRIORITES}
                value={
                  formData.priorite as (typeof PRIORITES)[number]["value"]
                }
                onChange={(v) => setField("priorite", v)}
              />
            </div>
          </Section>

          {/* Contenu */}
          <Section
            title="Contenu"
            description="Ce que vous demandez, et pourquoi."
          >
            <div className="flex flex-col gap-1.5">
              <FieldLabel optional>Marques ou partenaires</FieldLabel>

              {selectedCibles.length > 0 && (
                <div className="mb-1 flex flex-wrap gap-1.5">
                  {selectedCibles.map((c) => (
                    <span
                      key={`${c.type}-${c.id}`}
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                        c.type === "MARQUE"
                          ? "bg-violet-50 text-violet-800"
                          : "bg-amber-50 text-amber-800"
                      }`}
                    >
                      <span className="text-[10px] uppercase opacity-60">
                        {c.type === "MARQUE" ? "Marque" : "Partenaire"}
                      </span>
                      {c.label}
                      <button
                        type="button"
                        onClick={() => removeCible(c)}
                        className="rounded-full p-0.5 hover:bg-black/10"
                        aria-label={`Retirer ${c.label}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <div className="relative min-w-[200px] flex-1">
                  <input
                    type="text"
                    value={cibleQuery}
                    onChange={(e) => {
                      setCibleQuery(e.target.value);
                      setShowCibleSuggestions(true);
                    }}
                    onFocus={() => setShowCibleSuggestions(true)}
                    onBlur={() =>
                      setTimeout(() => setShowCibleSuggestions(false), 150)
                    }
                    placeholder="Rechercher une marque du CRM…"
                    autoComplete="off"
                    className={inputClass}
                  />
                  {showSuggestions && (
                    <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg">
                      {searchingCibles &&
                        marqueSuggestions.length === 0 &&
                        partnerSuggestions.length === 0 && (
                          <div className="flex items-center gap-2 px-3 py-3 text-sm text-zinc-500">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Recherche…
                          </div>
                        )}
                      {marqueSuggestions.filter(
                        (m) => !selectedMarqueIds.has(m.id)
                      ).length > 0 && (
                        <>
                          <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                            Marques CRM
                          </p>
                          {marqueSuggestions
                            .filter((m) => !selectedMarqueIds.has(m.id))
                            .map((m) => (
                              <button
                                key={`m-${m.id}`}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() =>
                                  addCible({
                                    type: "MARQUE",
                                    id: m.id,
                                    label: m.nom,
                                  })
                                }
                                className="w-full border-b border-zinc-100 px-3 py-2.5 text-left last:border-0 hover:bg-zinc-50"
                              >
                                <p className="text-sm font-medium text-zinc-900">
                                  {m.nom}
                                </p>
                                {m.matchedAlias &&
                                  normalize(m.matchedAlias) !==
                                    normalize(m.nom) && (
                                    <p className="text-xs text-violet-600">
                                      Alias : {m.matchedAlias}
                                    </p>
                                  )}
                              </button>
                            ))}
                        </>
                      )}
                      {partnerSuggestions.length > 0 && (
                        <>
                          <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                            Partenaires / agences
                          </p>
                          {partnerSuggestions.map((p) => (
                            <button
                              key={`p-${p.id}`}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() =>
                                addCible({
                                  type: "PARTNER",
                                  id: p.id,
                                  label: p.name,
                                })
                              }
                              className="w-full border-b border-zinc-100 px-3 py-2.5 text-left last:border-0 hover:bg-amber-50/60"
                            >
                              <p className="text-sm font-medium text-zinc-900">
                                {p.name}
                              </p>
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void handleEnrichirMarque()}
                  disabled={
                    enrichingMarque ||
                    cibleQuery.trim().length < 2 ||
                    !!exactMarqueMatch
                  }
                  className="inline-flex h-[38px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-amber-300 bg-amber-50 px-3.5 text-[13px] font-semibold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Crée la fiche si besoin et l'envoie en enrichissement"
                >
                  {enrichingMarque ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ScanSearch className="h-3.5 w-3.5" />
                  )}
                  Enrichir
                </button>
              </div>

              {enrichFlash && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                  {enrichFlash}{" "}
                  <a
                    href="/enrichissement?tab=attente"
                    className="font-semibold underline"
                  >
                    Voir la file
                  </a>
                </div>
              )}

              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-700">
                Si la marque existe déjà dans le CRM, sélectionnez sa fiche. Sinon
                utilisez <strong>Enrichir</strong> : la marque est ajoutée et
                part en file d&apos;enrichissement.
                {exactMarqueMatch && (
                  <>
                    {" "}
                    <button
                      type="button"
                      onClick={() =>
                        addCible({
                          type: "MARQUE",
                          id: exactMarqueMatch.id,
                          label: exactMarqueMatch.nom,
                        })
                      }
                      className="font-semibold underline"
                    >
                      Ajouter {exactMarqueMatch.nom}
                    </button>
                  </>
                )}
              </div>
            </div>

            {isHotel && (
              <div className="grid grid-cols-1 gap-4 rounded-lg border border-zinc-200 bg-zinc-50/70 p-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <FieldLabel>Destination</FieldLabel>
                  <input
                    type="text"
                    value={formData.destination}
                    onChange={(e) => setField("destination", e.target.value)}
                    placeholder="Ville / pays"
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <FieldLabel>Nombre de personnes</FieldLabel>
                  <input
                    type="number"
                    min={1}
                    value={formData.nombrePersonnes}
                    onChange={(e) =>
                      setField("nombrePersonnes", e.target.value)
                    }
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <FieldLabel>Date d&apos;arrivée</FieldLabel>
                  <input
                    type="date"
                    value={formData.dateArrivee}
                    onChange={(e) => setField("dateArrivee", e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <FieldLabel>Date de départ</FieldLabel>
                  <input
                    type="date"
                    value={formData.dateDepart}
                    onChange={(e) => setField("dateDepart", e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <FieldLabel>Type d&apos;hébergement</FieldLabel>
                  <select
                    value={formData.typeHebergement}
                    onChange={(e) =>
                      setField("typeHebergement", e.target.value)
                    }
                    className={inputClass}
                  >
                    <option value="">Sélectionner</option>
                    <option value="HOTEL">Hôtel</option>
                    <option value="APPARTEMENT">Appartement</option>
                    <option value="VILLA">Villa</option>
                    <option value="AUTRE">Autre</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <FieldLabel>Catégorie</FieldLabel>
                  <select
                    value={formData.categorie}
                    onChange={(e) => setField("categorie", e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Sélectionner</option>
                    <option value="3*">3★</option>
                    <option value="4*">4★</option>
                    <option value="5*">5★</option>
                    <option value="LUXE">Luxe</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 sm:col-span-2">
                  <FieldLabel>Demandes spéciales</FieldLabel>
                  <textarea
                    rows={2}
                    value={formData.demandesSpeciales}
                    onChange={(e) =>
                      setField("demandesSpeciales", e.target.value)
                    }
                    placeholder="Suite, vue mer, petit-déjeuner inclus…"
                    className={textareaClass}
                  />
                </label>
              </div>
            )}

            <label className="flex flex-col gap-1.5">
              <FieldLabel required={!isHotel}>
                {isHotel ? "Informations complémentaires" : "Description"}
              </FieldLabel>
              <textarea
                name="description"
                value={formData.description}
                onChange={(e) => setField("description", e.target.value)}
                rows={4}
                required={!isHotel}
                placeholder={
                  isHotel
                    ? "Informations complémentaires sur l'hôtel, le séjour…"
                    : "Décrivez précisément le produit ou le service demandé…"
                }
                className={textareaClass}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <FieldLabel>
                {isHotel ? "Contexte / pourquoi cet hôtel ?" : "Justification"}
              </FieldLabel>
              <textarea
                name="justification"
                value={formData.justification}
                onChange={(e) => setField("justification", e.target.value)}
                rows={3}
                placeholder={
                  isHotel
                    ? "Pourquoi cet hôtel ? Quel est le contexte du séjour ?"
                    : "Pourquoi ce gift est-il important ? Quel est le contexte ?"
                }
                className={textareaClass}
              />
            </label>
          </Section>

          {/* Livraison */}
          <Section
            title="Livraison"
            description={
              isHotel
                ? "Budget estimé pour le séjour."
                : "Valeur, échéance et adresse."
            }
            last
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <FieldLabel>
                  {isHotel ? "Budget estimé" : "Valeur estimée"}
                </FieldLabel>
                <div className="flex h-[38px] items-center gap-2 rounded-lg border border-zinc-300 px-3 focus-within:border-violet-600 focus-within:ring-[3px] focus-within:ring-violet-600/15">
                  <input
                    type="number"
                    name="valeurEstimee"
                    value={formData.valeurEstimee}
                    onChange={(e) => setField("valeurEstimee", e.target.value)}
                    step="0.01"
                    min="0"
                    placeholder="0,00"
                    className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-zinc-400"
                  />
                  <span className="text-sm text-zinc-500">€</span>
                </div>
              </label>

              {!isHotel && (
                <label className="flex flex-col gap-1.5">
                  <FieldLabel>Date de réception souhaitée</FieldLabel>
                  <input
                    type="date"
                    name="dateSouhaitee"
                    value={formData.dateSouhaitee}
                    onChange={(e) => setField("dateSouhaitee", e.target.value)}
                    className={inputClass}
                  />
                </label>
              )}
            </div>

            {!isHotel && (
              <label className="flex flex-col gap-1.5">
                <FieldLabel>Adresse de livraison</FieldLabel>
                <textarea
                  name="adresseLivraison"
                  value={formData.adresseLivraison}
                  onChange={(e) => setField("adresseLivraison", e.target.value)}
                  rows={2}
                  placeholder="Adresse complète de livraison…"
                  className={textareaClass}
                />
                <span className="text-xs font-normal text-zinc-500">
                  Pré-remplie automatiquement avec l&apos;adresse du talent.
                </span>
              </label>
            )}
          </Section>
          </div>
        </div>
      </form>

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-zinc-200 bg-white px-5 py-3.5 sm:px-8">
        <div className="mx-auto flex max-w-[1100px] justify-end gap-2">
          <Link
            href="/gifts"
            className="inline-flex h-9 items-center rounded-lg border border-zinc-300 bg-white px-3.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
          >
            Annuler
          </Link>
          <button
            type="submit"
            form="new-gift-form"
            disabled={loading || loadingData}
            className="inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-lg bg-violet-700 px-4 text-sm font-medium text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Création…
              </>
            ) : (
              "Créer la demande"
            )}
          </button>
        </div>
      </div>

    </div>
  );
}
