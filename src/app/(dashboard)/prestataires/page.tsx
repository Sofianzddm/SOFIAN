"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ArrowLeft,
  Building2,
  Camera,
  Car,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Flower2,
  Hotel,
  Loader2,
  MapPin,
  Paintbrush,
  Plus,
  Search,
  Sparkles,
  Utensils,
  Wrench,
} from "lucide-react";
import {
  PRESTATAIRE_CATEGORIES,
  PRESTATAIRE_CATEGORIE_LABEL,
  PRESTATAIRE_IMPORT_ENTITY_COLUMN,
  PRESTATAIRE_VILLES,
  isValidPrestataireCategorie,
  type PrestataireCategorie,
} from "@/lib/projets-outreach";
import { canWritePrestataireCrm } from "@/lib/prestataire-crm-access";
import type { LucideIcon } from "lucide-react";
import { PrestataireImportCartoModal } from "@/components/prestataires/PrestataireImportCartoModal";

const INK = "#16110F";

type Row = {
  id: string;
  nom: string;
  categorie: string;
  ville: string | null;
  email: string | null;
  telephone: string | null;
  contactCount: number;
  projetCount: number;
};

type ProjectOpt = { id: string; title: string; talentName: string };

const CATEGORIE_ICON: Record<PrestataireCategorie, LucideIcon> = {
  HOTEL: Hotel,
  TRAITEUR: Utensils,
  PHOTO: Camera,
  BEAUTY: Sparkles,
  TRANSPORT: Car,
  LIEU: MapPin,
  DECORATEUR: Paintbrush,
  FLEURISTE: Flower2,
  AUTRE: Wrench,
};

const CATEGORIE_HINT: Record<PrestataireCategorie, string> = {
  HOTEL: "Hôtels & résidences",
  TRAITEUR: "Catering & food",
  PHOTO: "Photo & vidéo",
  BEAUTY: "Maquillage, coiffure",
  TRANSPORT: "Voiture, van, chauffeur",
  LIEU: "Lieux & locations",
  DECORATEUR: "Scénographie & décor",
  FLEURISTE: "Fleurs & compositions",
  AUTRE: "Autres prestataires",
};

const CATEGORIE_NEW_LABEL: Record<PrestataireCategorie, string> = {
  HOTEL: "Ajouter un hôtel",
  TRAITEUR: "Ajouter un traiteur",
  PHOTO: "Ajouter un photographe",
  BEAUTY: "Ajouter un beauty",
  TRANSPORT: "Ajouter un transport",
  LIEU: "Ajouter un lieu",
  DECORATEUR: "Ajouter un décorateur",
  FLEURISTE: "Ajouter un fleuriste",
  AUTRE: "Ajouter une fiche",
};

function Initial({ nom }: { nom: string }) {
  const letter = (nom.trim()[0] || "?").toUpperCase();
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold text-white"
      style={{ backgroundColor: INK }}
    >
      {letter}
    </div>
  );
}

export default function PrestatairesListPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role ?? "";
  const canWrite = canWritePrestataireCrm(role);
  const searchParams = useSearchParams();

  const catParam = String(searchParams.get("categorie") || "")
    .trim()
    .toUpperCase();
  const categorie: PrestataireCategorie | null = isValidPrestataireCategorie(
    catParam
  )
    ? catParam
    : null;
  const projetFromUrl = String(searchParams.get("projet") || "").trim();

  const [rows, setRows] = useState<Row[]>([]);
  const [villes, setVilles] = useState<string[]>([]);
  const [ville, setVille] = useState("");
  const [villeCustom, setVilleCustom] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(projetFromUrl);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [projectSelectPulse, setProjectSelectPulse] = useState(false);
  const projectSelectRef = useRef<HTMLSelectElement | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [villesCount, setVillesCount] = useState(0);
  const [showCartoModal, setShowCartoModal] = useState(false);
  const [droppedCarto, setDroppedCarto] = useState<File | null>(null);
  const [cartoDragOver, setCartoDragOver] = useState(false);
  const [form, setForm] = useState({
    nom: "",
    ville: "",
    email: "",
    telephone: "",
  });

  const activeVille = ville === "__autre__" ? villeCustom.trim() : ville.trim();

  const villeOptions = useMemo(() => {
    const set = new Set<string>([...PRESTATAIRE_VILLES]);
    for (const v of villes) {
      const t = v.trim();
      if (t) set.add(t);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "fr"));
  }, [villes]);

  useEffect(() => {
    setSelectedProjectId(projetFromUrl);
  }, [projetFromUrl]);

  useEffect(() => {
    if (!categorie) return;
    setVille("");
    setVilleCustom("");
    setQ("");
    setRows([]);
    setForm({ nom: "", ville: "", email: "", telephone: "" });
  }, [categorie]);

  const hubHref = useMemo(() => {
    return projetFromUrl
      ? `/prestataires?projet=${projetFromUrl}`
      : "/prestataires";
  }, [projetFromUrl]);

  useEffect(() => {
    if (categorie) return;
    void (async () => {
      try {
        const res = await fetch("/api/prestataires?summary=1", {
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return;
        setTotal(Number(data.total) || 0);
        setVillesCount(Number(data.villesCount) || 0);
        setCounts(
          data.byCategorie && typeof data.byCategorie === "object"
            ? data.byCategorie
            : {}
        );
      } catch {
        /* ignore */
      }
    })();
  }, [categorie]);

  const loadVilles = useCallback(async () => {
    if (!categorie) return;
    try {
      const params = new URLSearchParams({ categorie });
      const res = await fetch(`/api/prestataires?${params}`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      if (Array.isArray(data.villes)) setVilles(data.villes);
    } catch {
      /* ignore */
    }
  }, [categorie]);

  const load = useCallback(async () => {
    if (!categorie || !activeVille) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        categorie,
        ville: activeVille,
      });
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/prestataires?${params}`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Chargement impossible.");
      setRows(Array.isArray(data.prestataires) ? data.prestataires : []);
      if (Array.isArray(data.villes)) setVilles(data.villes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [categorie, activeVille, q]);

  useEffect(() => {
    void loadVilles();
  }, [loadVilles]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!canWrite) return;
    void (async () => {
      try {
        const res = await fetch("/api/projets-outreach?active=1", {
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return;
        let list = Array.isArray(data.campaigns) ? data.campaigns : [];
        if (list.length === 0) {
          const resAll = await fetch("/api/projets-outreach", {
            credentials: "include",
          });
          const dataAll = await resAll.json().catch(() => ({}));
          if (resAll.ok && Array.isArray(dataAll.campaigns)) {
            list = dataAll.campaigns;
          }
        }
        setProjects(
          list.map(
            (c: {
              id: string;
              title: string;
              talentName?: string;
            }) => ({
              id: c.id,
              title: c.title,
              talentName: c.talentName || "",
            })
          )
        );
      } catch {
        /* ignore */
      }
    })();
  }, [canWrite]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!canWrite || !categorie) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        nom: form.nom,
        categorie,
        ville: form.ville || activeVille || null,
        email: form.email,
        telephone: form.telephone,
      };
      const res = await fetch("/api/prestataires", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Création impossible.");
      setShowCreate(false);
      window.location.href = `/prestataires/${data.prestataire.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setSaving(false);
    }
  }

  async function addToProject(prestataireId: string) {
    if (!canWrite) return;
    if (!selectedProjectId) {
      setError("Choisis d’abord un « Projet cible » ci-dessus, puis reclique.");
      setProjectSelectPulse(true);
      projectSelectRef.current?.focus();
      window.setTimeout(() => setProjectSelectPulse(false), 1600);
      return;
    }
    if (projects.length === 0) {
      setError("Aucun projet outreach disponible. Crée un projet d’abord.");
      return;
    }
    setAddingId(prestataireId);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(
        `/api/prestataires/${prestataireId}/ajouter-au-projet`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignId: selectedProjectId }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok && !data.already) {
        throw new Error(data.error || "Ajout impossible.");
      }
      setSuccess(
        data.already
          ? data.resetToContact
            ? `Déjà dans le projet — statut remis à « À contacter ».`
            : "Déjà lié à ce projet."
          : `Ajouté à « ${data.campaignTitle || "projet"} » · À contacter.`
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setAddingId(null);
    }
  }

  /* ───────── Hub ───────── */
  if (!categorie) {
    return (
      <div className="min-h-full" style={{ backgroundColor: "#FAF9F7" }}>
        <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">
                Annuaire
              </p>
              <h1
                className="mt-1 text-[26px] font-bold tracking-[-0.02em]"
                style={{ color: INK }}
              >
                CRM Prestataires
              </h1>
              <p className="mt-1 text-[13px] text-gray-400">
                {total} fiche{total > 1 ? "s" : ""} · {villesCount} ville
                {villesCount > 1 ? "s" : ""} — sélectionne un métier, puis une
                ville
              </p>
            </div>
            <Link
              href="/projets-outreach"
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-[13px] font-semibold text-gray-700 ring-1 ring-black/[0.08] transition hover:bg-gray-50"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Projets
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: "Fiches", value: total, icon: Building2 },
              { label: "Villes", value: villesCount, icon: MapPin },
              {
                label: "Métiers",
                value: PRESTATAIRE_CATEGORIES.length,
                icon: Wrench,
              },
            ].map((s) => {
              const Icon = s.icon;
              return (
                <div
                  key={s.label}
                  className="rounded-xl bg-white px-4 py-3.5 ring-1 ring-black/[0.06]"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-medium text-gray-400">
                      {s.label}
                    </span>
                    <Icon className="h-3.5 w-3.5 text-gray-300" />
                  </div>
                  <div
                    className="mt-1 text-[22px] font-bold tracking-tight"
                    style={{ color: INK }}
                  >
                    {s.value}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="overflow-hidden rounded-xl bg-white ring-1 ring-black/[0.06]">
            <div className="border-b border-black/[0.04] px-4 py-3">
              <h2
                className="text-[13px] font-semibold"
                style={{ color: INK }}
              >
                Par métier
              </h2>
            </div>
            <ul>
              {PRESTATAIRE_CATEGORIES.map((c, idx) => {
                const Icon = CATEGORIE_ICON[c];
                const n = counts[c] ?? 0;
                const href = projetFromUrl
                  ? `/prestataires?categorie=${c}&projet=${projetFromUrl}`
                  : `/prestataires?categorie=${c}`;
                return (
                  <li key={c}>
                    <Link
                      href={href}
                      className="group flex items-center gap-3.5 px-4 py-3.5 no-underline transition hover:bg-[#FAF9F7]"
                      style={{
                        borderTop:
                          idx === 0 ? "none" : "1px solid rgba(0,0,0,0.04)",
                      }}
                    >
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#FAF9F7] ring-1 ring-black/[0.05] transition group-hover:bg-white"
                      >
                        <Icon
                          className="h-4.5 w-4.5"
                          style={{ color: INK, width: 18, height: 18 }}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div
                          className="text-[14px] font-semibold tracking-tight"
                          style={{ color: INK }}
                        >
                          {PRESTATAIRE_CATEGORIE_LABEL[c]}
                        </div>
                        <div className="text-[12px] text-gray-400">
                          {CATEGORIE_HINT[c]}
                        </div>
                      </div>
                      <span className="rounded-md bg-[#FAF9F7] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-gray-500 ring-1 ring-black/[0.04]">
                        {n}
                      </span>
                      <ChevronRight className="h-4 w-4 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-gray-500" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    );
  }

  /* ───────── Liste filtrée ───────── */
  const title = PRESTATAIRE_CATEGORIE_LABEL[categorie];
  const Icon = CATEGORIE_ICON[categorie];

  return (
    <div className="min-h-full" style={{ backgroundColor: "#FAF9F7" }}>
      <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <nav className="mb-2 flex items-center gap-1.5 text-[12px] text-gray-400">
              <Link
                href={hubHref}
                className="font-medium text-gray-500 no-underline hover:text-gray-900"
              >
                Prestataires
              </Link>
              <ChevronRight className="h-3 w-3" />
              <span className="font-semibold" style={{ color: INK }}>
                {title}
              </span>
            </nav>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white ring-1 ring-black/[0.06]">
                <Icon style={{ width: 18, height: 18, color: INK }} />
              </div>
              <div>
                <h1
                  className="text-[22px] font-bold tracking-[-0.02em]"
                  style={{ color: INK }}
                >
                  {title}
                </h1>
                <p className="text-[12.5px] text-gray-400">
                  Filtre par ville, puis ajoute au projet outreach
                </p>
              </div>
            </div>
          </div>
          {canWrite && (
            <button
              type="button"
              onClick={() => setShowCreate((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white transition hover:opacity-90"
              style={{ backgroundColor: INK }}
            >
              <Plus className="h-3.5 w-3.5" />
              {CATEGORIE_NEW_LABEL[categorie]}
            </button>
          )}
        </div>

        {canWrite ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => {
                setDroppedCarto(null);
                setShowCartoModal(true);
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                setCartoDragOver(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setCartoDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setCartoDragOver(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setCartoDragOver(false);
                const file = e.dataTransfer.files?.[0] || null;
                setDroppedCarto(file);
                setShowCartoModal(true);
              }}
              className="w-full rounded-xl border-2 border-dashed px-6 py-8 text-center transition"
              style={{
                borderColor: cartoDragOver ? "#16110F" : "#E5E0DA",
                backgroundColor: cartoDragOver ? "#F3F1EF" : "#fff",
              }}
            >
              <FileSpreadsheet
                className="mx-auto mb-2 h-7 w-7"
                style={{ color: cartoDragOver ? INK : "#9CA3AF" }}
              />
              <div className="text-sm font-semibold" style={{ color: INK }}>
                Glisse une carto CSV / Excel ici
              </div>
              <div className="mt-1 text-xs text-gray-400">
                Colonnes {PRESTATAIRE_IMPORT_ENTITY_COLUMN[categorie]} + contact —
                plusieurs fiches d’un coup, fusion auto
              </div>
            </button>
            <div className="flex justify-center">
              <a
                href={`/api/prestataires/modele-import?categorie=${categorie}`}
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-gray-500 no-underline hover:text-gray-900"
              >
                <Download className="h-3.5 w-3.5" />
                Télécharger le modèle Excel {title.toLowerCase()}
              </a>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 ring-1 ring-black/[0.06]">
          <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
            Ville
            <select
              className="mt-1.5 block w-full min-w-0 sm:min-w-[200px] rounded-lg border-0 bg-[#FAF9F7] px-3 py-2 text-[13px] font-medium ring-1 ring-black/[0.06] outline-none focus:ring-2 focus:ring-black/10"
              style={{ color: INK }}
              value={ville}
              onChange={(e) => setVille(e.target.value)}
            >
              <option value="">Sélectionner…</option>
              {villeOptions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
              <option value="__autre__">Autre ville…</option>
            </select>
          </label>
          {ville === "__autre__" ? (
            <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
              Préciser
              <input
                className="mt-1.5 block w-full min-w-0 sm:min-w-[180px] rounded-lg border-0 bg-[#FAF9F7] px-3 py-2 text-[13px] font-medium ring-1 ring-black/[0.06] outline-none focus:ring-2 focus:ring-black/10"
                style={{ color: INK }}
                value={villeCustom}
                onChange={(e) => setVilleCustom(e.target.value)}
                placeholder="Paris, Lyon…"
                autoFocus
              />
            </label>
          ) : null}
          <div className="relative w-full min-w-0 sm:min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              className="w-full rounded-lg border-0 bg-[#FAF9F7] py-2 pl-9 pr-3 text-[13px] ring-1 ring-black/[0.06] outline-none focus:ring-2 focus:ring-black/10 disabled:opacity-40"
              style={{ color: INK }}
              placeholder="Rechercher un client…"
              value={q}
              disabled={!activeVille}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          {canWrite && (
            <label
              className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${
                projectSelectPulse ? "text-red-600" : "text-gray-400"
              }`}
            >
              Projet cible {!selectedProjectId ? "(obligatoire)" : ""}
              <select
                ref={projectSelectRef}
                className={`mt-1.5 block w-full min-w-0 sm:min-w-[220px] rounded-lg border-0 bg-[#FAF9F7] px-3 py-2 text-[13px] font-medium outline-none focus:ring-2 focus:ring-black/10 ${
                  projectSelectPulse
                    ? "ring-2 ring-red-400"
                    : selectedProjectId
                      ? "ring-1 ring-black/[0.06]"
                      : "ring-2 ring-amber-300"
                }`}
                style={{ color: INK }}
                value={selectedProjectId}
                onChange={(e) => {
                  setSelectedProjectId(e.target.value);
                  setError(null);
                }}
              >
                <option value="">Choisir un projet…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                    {p.talentName ? ` · ${p.talentName}` : ""}
                  </option>
                ))}
              </select>
              {projects.length === 0 ? (
                <span className="mt-1 block normal-case tracking-normal text-[11px] font-normal text-amber-700">
                  Aucun projet trouvé — crée-en un dans Projets outreach.
                </span>
              ) : !selectedProjectId ? (
                <span className="mt-1 block normal-case tracking-normal text-[11px] font-normal text-amber-700">
                  Sélectionne un projet pour activer « Ajouter au projet ».
                </span>
              ) : null}
            </label>
          )}
        </div>

        {(error || success) && (
          <div
            className={`rounded-lg px-3.5 py-2.5 text-[13px] ring-1 ${
              error
                ? "bg-red-50 text-red-700 ring-red-100"
                : "bg-emerald-50 text-emerald-800 ring-emerald-100"
            }`}
          >
            {error || success}
          </div>
        )}

        {showCreate && canWrite && (
          <form
            onSubmit={onCreate}
            className="space-y-3 rounded-xl bg-white p-4 ring-1 ring-black/[0.06]"
          >
            <h3
              className="text-[13px] font-semibold"
              style={{ color: INK }}
            >
              Nouvelle fiche · {title}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                Nom
                <input
                  required
                  className="mt-1.5 w-full rounded-lg border-0 bg-[#FAF9F7] px-3 py-2 text-[13px] ring-1 ring-black/[0.06] outline-none focus:ring-2 focus:ring-black/10"
                  style={{ color: INK }}
                  value={form.nom}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, nom: e.target.value }))
                  }
                />
              </label>
              <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                Ville
                <select
                  required
                  className="mt-1.5 w-full rounded-lg border-0 bg-[#FAF9F7] px-3 py-2 text-[13px] ring-1 ring-black/[0.06] outline-none focus:ring-2 focus:ring-black/10"
                  style={{ color: INK }}
                  value={form.ville || activeVille || ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, ville: e.target.value }))
                  }
                >
                  <option value="">Sélectionner…</option>
                  {villeOptions.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                Email
                <input
                  className="mt-1.5 w-full rounded-lg border-0 bg-[#FAF9F7] px-3 py-2 text-[13px] ring-1 ring-black/[0.06] outline-none focus:ring-2 focus:ring-black/10"
                  style={{ color: INK }}
                  value={form.email}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, email: e.target.value }))
                  }
                />
              </label>
              <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                Téléphone
                <input
                  className="mt-1.5 w-full rounded-lg border-0 bg-[#FAF9F7] px-3 py-2 text-[13px] ring-1 ring-black/[0.06] outline-none focus:ring-2 focus:ring-black/10"
                  style={{ color: INK }}
                  value={form.telephone}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, telephone: e.target.value }))
                  }
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: INK }}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Créer la fiche"
              )}
            </button>
          </form>
        )}

        {!activeVille ? (
          <div className="rounded-xl bg-white px-6 py-14 text-center ring-1 ring-black/[0.06]">
            <MapPin className="mx-auto h-5 w-5 text-gray-300" />
            <p
              className="mt-3 text-[14px] font-semibold"
              style={{ color: INK }}
            >
              Sélectionne une ville
            </p>
            <p className="mt-1 text-[12.5px] text-gray-400">
              Les clients {title.toLowerCase()} s’affichent ensuite.
            </p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl bg-white px-6 py-12 text-center ring-1 ring-black/[0.06]">
            <p className="text-[14px] font-semibold" style={{ color: INK }}>
              Aucun client à {activeVille}
            </p>
            <p className="mt-1 text-[12.5px] text-gray-400">
              Crée une fiche ou change de ville.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl bg-white ring-1 ring-black/[0.06]">
            <div className="flex items-center justify-between border-b border-black/[0.04] px-4 py-2.5">
              <span className="text-[12px] font-medium text-gray-400">
                {rows.length} fiche{rows.length > 1 ? "s" : ""} · {activeVille}
              </span>
            </div>
            <ul>
              {rows.map((r, idx) => (
                <li
                  key={r.id}
                  style={{
                    borderTop:
                      idx === 0 ? "none" : "1px solid rgba(0,0,0,0.04)",
                  }}
                >
                  <Link
                    href={`/prestataires/${r.id}`}
                    className="flex flex-wrap items-center gap-3 px-4 py-3 no-underline transition hover:bg-[#FAF9F7]"
                  >
                    <Initial nom={r.nom} />
                    <div className="min-w-0 flex-1">
                      <div
                        className="text-[14px] font-semibold"
                        style={{ color: INK }}
                      >
                        {r.nom}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-gray-400">
                        <span>{r.ville || activeVille}</span>
                        <span>·</span>
                        <span>
                          {r.contactCount} contact
                          {r.contactCount > 1 ? "s" : ""}
                        </span>
                        {r.email ? (
                          <>
                            <span>·</span>
                            <span className="truncate">{r.email}</span>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <div
                      className="flex items-center gap-2"
                      onClick={(e) => e.preventDefault()}
                    >
                      {canWrite && (
                        <button
                          type="button"
                          disabled={addingId === r.id}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void addToProject(r.id);
                          }}
                          className="rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-white transition disabled:opacity-35"
                          style={{
                            backgroundColor: INK,
                            opacity: selectedProjectId ? 1 : 0.55,
                          }}
                          title={
                            !selectedProjectId
                              ? "Choisis d’abord un projet cible ci-dessus"
                              : "Ajouter au projet sélectionné"
                          }
                        >
                          {addingId === r.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            "Ajouter au projet"
                          )}
                        </button>
                      )}
                      <ChevronRight className="h-4 w-4 text-gray-300" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {showCartoModal && categorie ? (
        <PrestataireImportCartoModal
          categorie={categorie}
          initialFile={droppedCarto}
          onClose={() => {
            setShowCartoModal(false);
            setDroppedCarto(null);
          }}
          onImported={(result) => {
            const hCreated = result.hotelsCreated ?? 0;
            const hMerged = result.hotelsMerged ?? 0;
            setSuccess(
              `${hCreated} fiche${hCreated > 1 ? "s" : ""} créée${hCreated > 1 ? "s" : ""}${
                hMerged ? ` · ${hMerged} fusionnée${hMerged > 1 ? "s" : ""}` : ""
              } · ${result.created} contact${result.created > 1 ? "s" : ""}.`
            );
            setShowCartoModal(false);
            setDroppedCarto(null);
            void loadVilles();
            if (result.prestataireId) {
              window.location.href = `/prestataires/${result.prestataireId}`;
            }
          }}
          onError={(message) => setError(message)}
        />
      ) : null}
    </div>
  );
}
