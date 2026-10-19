"use client";

// Hub signature électronique entreprise (DocuSeal) — n'importe quel PDF,
// N signataires, même pipeline que contrats talent / collab.

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  FileSignature,
  Upload,
  Loader2,
  Trash2,
  Send,
  Download,
  Bell,
  Clock,
  CheckCircle2,
  PenLine,
  Plus,
  X,
  Search,
  FolderOpen,
  Users,
  ChevronDown,
} from "lucide-react";

type SignataireDraft = { name: string; email: string };

type HistorySource = "hub" | "talent" | "collab";

type SignatureDoc = {
  id: string;
  source: HistorySource;
  titre: string;
  statut: "BROUILLON" | "EN_ATTENTE" | "SIGNE";
  fichierUrl: string | null;
  signedDocumentUrl: string | null;
  signataires: SignataireDraft[] | unknown;
  signaturesCompleted: number;
  signaturesTotal: number;
  envoyeAt: string | null;
  signeAt: string | null;
  createdAt: string;
  createdBy?: { prenom: string; nom: string } | null;
  meta?: {
    label: string;
    href: string | null;
    talentId?: string;
    talentNom?: string;
    marqueNom?: string;
    reference?: string;
  };
};

const INTERNES_KEY = "__internes__";
const INTERNES_LABEL = "Dossiers internes";

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function docSearchHaystack(doc: SignatureDoc): string {
  const signers = parseSignataires(doc.signataires);
  const parts = [
    doc.titre,
    doc.source,
    SOURCE_LABEL[doc.source || "hub"],
    doc.statut,
    STATUT_UI[doc.statut]?.label,
    doc.meta?.label,
    doc.meta?.talentNom,
    doc.meta?.marqueNom,
    doc.meta?.reference,
    doc.createdBy ? `${doc.createdBy.prenom} ${doc.createdBy.nom}` : "",
    ...signers.map((s) => `${s.name} ${s.email}`),
  ];
  return normalizeSearch(parts.filter(Boolean).join(" "));
}

function matchesSearch(doc: SignatureDoc, query: string): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  const hay = docSearchHaystack(doc);
  // Tous les mots doivent matcher (AND) — très efficace pour "louise coca"
  return q.split(/\s+/).filter(Boolean).every((token) => hay.includes(token));
}

function groupKeyOf(doc: SignatureDoc): { key: string; label: string } {
  if (doc.meta?.talentId && doc.meta?.talentNom) {
    return { key: `talent:${doc.meta.talentId}`, label: doc.meta.talentNom };
  }
  if (doc.meta?.talentNom) {
    return {
      key: `talent-name:${normalizeSearch(doc.meta.talentNom)}`,
      label: doc.meta.talentNom,
    };
  }
  return { key: INTERNES_KEY, label: INTERNES_LABEL };
}

const SOURCE_LABEL: Record<HistorySource, string> = {
  hub: "Signatures",
  talent: "Talent",
  collab: "Collab",
};

const STATUT_UI: Record<
  SignatureDoc["statut"],
  { label: string; className: string; icon: React.ReactNode }
> = {
  BROUILLON: {
    label: "Brouillon",
    className: "bg-gray-100 text-gray-600",
    icon: <PenLine className="w-3.5 h-3.5" />,
  },
  EN_ATTENTE: {
    label: "En attente",
    className: "bg-amber-100 text-amber-700",
    icon: <Clock className="w-3.5 h-3.5" />,
  },
  SIGNE: {
    label: "Signé",
    className: "bg-emerald-100 text-emerald-700",
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function parseSignataires(raw: unknown): SignataireDraft[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      return {
        name: typeof r.name === "string" ? r.name : "",
        email: typeof r.email === "string" ? r.email : "",
      };
    })
    .filter((s): s is SignataireDraft => Boolean(s && s.email));
}

export default function SignaturesPage() {
  const router = useRouter();
  const [documents, setDocuments] = useState<SignatureDoc[]>([]);
  const [filter, setFilter] = useState<"TOUS" | "SIGNE" | "EN_ATTENTE" | "BROUILLON">(
    "TOUS"
  );
  const [search, setSearch] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(
    {}
  );
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [titre, setTitre] = useState("");
  const [signataires, setSignataires] = useState<SignataireDraft[]>([
    { name: "", email: "" },
  ]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [actionId, setActionId] = useState<string | null>(null);
  const [relanceKey, setRelanceKey] = useState<string | null>(null);
  const [relanceEmail, setRelanceEmail] = useState("");

  const loadDocuments = useCallback(async () => {
    try {
      const res = await fetch("/api/signatures");
      const data = await res.json();
      if (res.ok) {
        // Historique à vie : hub + contrats talent + collabs DocuSeal
        setDocuments(data.history ?? data.documents ?? []);
      } else {
        setError(data.error || "Erreur de chargement");
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    const enAttente = documents.some((d) => d.statut === "EN_ATTENTE");
    if (!enAttente) return;
    const interval = setInterval(loadDocuments, 30000);
    return () => clearInterval(interval);
  }, [documents, loadDocuments]);

  const selectFile = (file: File | null | undefined) => {
    setError(null);
    if (!file) return;
    if (file.type !== "application/pdf") {
      setError("Seuls les fichiers PDF sont acceptés");
      return;
    }
    setPendingFile(file);
    setTitre(file.name.replace(/\.pdf$/i, ""));
  };

  const handleUpload = async () => {
    if (!pendingFile || uploading) return;
    const cleaned = signataires
      .map((s) => ({ name: s.name.trim(), email: s.email.trim() }))
      .filter((s) => s.email);
    if (cleaned.length === 0) {
      setError("Ajoutez au moins un signataire avec une adresse email");
      return;
    }
    for (const s of cleaned) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email)) {
        setError(`Adresse email invalide : ${s.email}`);
        return;
      }
    }

    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", pendingFile);
      formData.append("titre", titre.trim() || pendingFile.name.replace(/\.pdf$/i, ""));
      formData.append("signataires", JSON.stringify(cleaned));
      const res = await fetch("/api/signatures", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        router.push(`/signatures/${data.document.id}/builder`);
      } else {
        setError(data.error || "Erreur lors de l'upload");
        setUploading(false);
      }
    } catch {
      setError("Erreur réseau");
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer ce brouillon ?")) return;
    setActionId(id);
    try {
      const res = await fetch(`/api/signatures/${id}`, { method: "DELETE" });
      if (res.ok) {
        setDocuments((prev) => prev.filter((d) => !(d.source === "hub" && d.id === id)));
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Erreur lors de la suppression");
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setActionId(null);
    }
  };

  const rowKeyOf = (doc: SignatureDoc) => `${doc.source || "hub"}-${doc.id}`;

  const openRelance = (doc: SignatureDoc) => {
    if (doc.statut !== "EN_ATTENTE") return;
    setError(null);
    setFeedback(null);
    const first = parseSignataires(doc.signataires)[0];
    setRelanceKey(rowKeyOf(doc));
    setRelanceEmail(first?.email || "");
  };

  const handleRelancer = async (doc: SignatureDoc) => {
    const email = relanceEmail.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Adresse email invalide");
      return;
    }
    const key = rowKeyOf(doc);
    setActionId(key);
    setFeedback(null);
    setError(null);
    try {
      const res = await fetch(`/api/signatures/${doc.id}/relancer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: doc.source || "hub",
          ...(email ? { email } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setFeedback(`Relance envoyée à ${data.relanceEmail}`);
        setRelanceKey(null);
      } else {
        setError(data.error || "Erreur lors de la relance");
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setActionId(null);
    }
  };

  const filteredDocuments = useMemo(() => {
    return documents.filter((d) => {
      if (filter !== "TOUS" && d.statut !== filter) return false;
      return matchesSearch(d, search);
    });
  }, [documents, filter, search]);

  const groupedDocuments = useMemo(() => {
    const map = new Map<string, { key: string; label: string; docs: SignatureDoc[] }>();
    for (const doc of filteredDocuments) {
      const g = groupKeyOf(doc);
      const existing = map.get(g.key);
      if (existing) existing.docs.push(doc);
      else map.set(g.key, { key: g.key, label: g.label, docs: [doc] });
    }
    const groups = Array.from(map.values());
    groups.sort((a, b) => {
      if (a.key === INTERNES_KEY) return -1;
      if (b.key === INTERNES_KEY) return 1;
      return a.label.localeCompare(b.label, "fr", { sensitivity: "base" });
    });
    return groups;
  }, [filteredDocuments]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start gap-4">
        <div className="p-3 bg-indigo-100 rounded-2xl shrink-0">
          <FileSignature className="w-6 h-6 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-glowup-licorice">Signatures</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl">
            Envoyez n&apos;importe quel PDF en signature électronique via DocuSeal —
            et consultez ici l&apos;historique à vie de tous les contrats signés
            (hub, talents, collabs).
          </p>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 p-6 md:p-8 border border-gray-100">
        {!pendingFile ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              selectFile(e.dataTransfer.files?.[0]);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-2 p-10 rounded-2xl border-2 border-dashed cursor-pointer transition-colors ${
              dragOver
                ? "border-indigo-500 bg-indigo-50"
                : "border-gray-300 bg-gray-50 hover:border-indigo-400 hover:bg-indigo-50/50"
            }`}
          >
            <Upload className="w-9 h-9 text-indigo-500" />
            <p className="font-medium text-glowup-licorice">
              Glissez un PDF ici, ou cliquez pour choisir
            </p>
            <p className="text-sm text-gray-500 text-center max-w-md">
              Ensuite : définir les signataires, placer les champs (signature, nom,
              date…), envoyer.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                selectFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <FileSignature className="w-5 h-5 text-indigo-600 shrink-0" />
              <span className="font-medium text-glowup-licorice truncate">
                {pendingFile.name}
              </span>
              <button
                type="button"
                onClick={() => {
                  setPendingFile(null);
                  setTitre("");
                  setSignataires([{ name: "", email: "" }]);
                }}
                disabled={uploading}
                className="ml-auto text-sm text-gray-500 hover:text-gray-800"
              >
                Annuler
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Titre du document
              </label>
              <input
                type="text"
                value={titre}
                onChange={(e) => setTitre(e.target.value)}
                placeholder="NDA partenaire — Octobre 2026"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">
                  Signataires
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setSignataires((prev) =>
                      prev.length >= 10
                        ? prev
                        : [...prev, { name: "", email: "" }]
                    )
                  }
                  disabled={uploading || signataires.length >= 10}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" /> Ajouter
                </button>
              </div>
              {signataires.map((s, index) => (
                <div key={index} className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-gray-500 w-20 shrink-0">
                    #{index + 1}
                  </span>
                  <input
                    type="text"
                    value={s.name}
                    onChange={(e) =>
                      setSignataires((prev) =>
                        prev.map((row, i) =>
                          i === index ? { ...row, name: e.target.value } : row
                        )
                      )
                    }
                    disabled={uploading}
                    placeholder="Nom"
                    className="w-40 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none"
                  />
                  <input
                    type="email"
                    value={s.email}
                    onChange={(e) =>
                      setSignataires((prev) =>
                        prev.map((row, i) =>
                          i === index ? { ...row, email: e.target.value } : row
                        )
                      )
                    }
                    disabled={uploading}
                    placeholder="email@exemple.com"
                    className="flex-1 min-w-[200px] px-3 py-2 rounded-xl border border-gray-200 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none"
                  />
                  {signataires.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setSignataires((prev) => prev.filter((_, i) => i !== index))
                      }
                      disabled={uploading}
                      className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading}
              className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-60"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" /> Préparation du document...
                </>
              ) : (
                <>
                  <PenLine className="w-5 h-5" /> Continuer : placer les champs
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {feedback && <p className="text-sm text-emerald-700">{feedback}</p>}

      <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 p-6 md:p-8 border border-gray-100">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold text-glowup-licorice">
              Historique à vie
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {filteredDocuments.length}
              {search || filter !== "TOUS"
                ? ` résultat${filteredDocuments.length > 1 ? "s" : ""} / ${documents.length}`
                : ` document${documents.length > 1 ? "s" : ""}`}
              {" · "}classé par talent · dossiers internes
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["TOUS", "Tous"],
                ["SIGNE", "Signés"],
                ["EN_ATTENTE", "En attente"],
                ["BROUILLON", "Brouillons"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  filter === value
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative mb-5">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher talent, marque, email, titre, référence… (⌘K)"
            className="w-full pl-10 pr-20 py-3 rounded-2xl border border-gray-200 bg-gray-50 text-sm text-glowup-licorice placeholder:text-gray-400 focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-colors"
          />
          {search ? (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                searchInputRef.current?.focus();
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-700 rounded-lg"
              title="Effacer"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md border border-gray-200 bg-white text-[10px] font-semibold text-gray-400">
              ⌘K
            </kbd>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
          </div>
        ) : filteredDocuments.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">
            {search
              ? `Aucun résultat pour « ${search} ».`
              : "Aucun document dans cet historique pour le moment."}
          </p>
        ) : (
          <div className="space-y-5">
            {groupedDocuments.map((group) => {
              const isInternes = group.key === INTERNES_KEY;
              const collapsed = Boolean(collapsedGroups[group.key]);
              return (
                <section key={group.key} className="space-y-2">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                    className="w-full flex items-center gap-2.5 px-1 py-1.5 text-left group"
                  >
                    <span
                      className={`p-1.5 rounded-lg ${
                        isInternes
                          ? "bg-slate-100 text-slate-600"
                          : "bg-indigo-50 text-indigo-600"
                      }`}
                    >
                      {isInternes ? (
                        <FolderOpen className="w-4 h-4" />
                      ) : (
                        <Users className="w-4 h-4" />
                      )}
                    </span>
                    <span className="font-semibold text-glowup-licorice truncate">
                      {group.label}
                    </span>
                    <span className="text-xs font-medium text-gray-400 tabular-nums">
                      {group.docs.length}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-gray-400 ml-auto transition-transform ${
                        collapsed ? "-rotate-90" : ""
                      }`}
                    />
                  </button>

                  {!collapsed && (
                    <div className="space-y-3">
                      {group.docs.map((doc) => {
                        const ui = STATUT_UI[doc.statut];
                        const source = doc.source || "hub";
                        const rowKey = rowKeyOf(doc);
                        const busy = actionId === rowKey;
                        const showRelance = relanceKey === rowKey;
                        const signers = parseSignataires(doc.signataires);
                        return (
                          <div
                            key={rowKey}
                            className="p-4 rounded-2xl border border-gray-100 bg-gray-50 space-y-3"
                          >
                            <div className="flex flex-wrap items-center gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2 mb-0.5">
                                  <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-slate-200 text-slate-700">
                                    {SOURCE_LABEL[source]}
                                  </span>
                                  {doc.meta?.reference ? (
                                    <span className="text-[10px] text-gray-400 font-medium">
                                      {doc.meta.reference}
                                    </span>
                                  ) : null}
                                </div>
                                <p className="font-medium text-glowup-licorice truncate">
                                  {doc.titre}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {doc.statut === "SIGNE" && doc.signeAt
                                    ? `Signé le ${formatDate(doc.signeAt)}`
                                    : doc.envoyeAt
                                      ? `Envoyé le ${formatDate(doc.envoyeAt)}`
                                      : `Créé le ${formatDate(doc.createdAt)}`}
                                  {doc.createdBy
                                    ? ` · par ${doc.createdBy.prenom} ${doc.createdBy.nom}`
                                    : ""}
                                  {doc.meta?.marqueNom
                                    ? ` · x ${doc.meta.marqueNom}`
                                    : ""}
                                  {doc.statut === "EN_ATTENTE"
                                    ? ` · ${doc.signaturesCompleted}/${doc.signaturesTotal} signature${doc.signaturesTotal > 1 ? "s" : ""}`
                                    : ""}
                                  {signers.length > 0
                                    ? ` · ${signers
                                        .map((s) => s.email)
                                        .filter(Boolean)
                                        .join(", ")}`
                                    : ""}
                                </p>
                              </div>

                              <span
                                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${ui.className}`}
                              >
                                {ui.icon}
                                {ui.label}
                              </span>

                              <div className="flex items-center gap-2">
                                {source === "hub" && doc.statut === "BROUILLON" && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        router.push(`/signatures/${doc.id}/builder`)
                                      }
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
                                    >
                                      <Send className="w-3.5 h-3.5" /> Placer les champs
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDelete(doc.id)}
                                      disabled={busy}
                                      className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                                      title="Supprimer le brouillon"
                                    >
                                      {busy ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                      ) : (
                                        <Trash2 className="w-4 h-4" />
                                      )}
                                    </button>
                                  </>
                                )}

                                {doc.statut === "EN_ATTENTE" && !showRelance && (
                                  <button
                                    type="button"
                                    onClick={() => openRelance(doc)}
                                    disabled={busy}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-100 rounded-lg hover:bg-amber-200 transition-colors disabled:opacity-60"
                                  >
                                    {busy ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Bell className="w-3.5 h-3.5" />
                                    )}
                                    Relancer
                                  </button>
                                )}

                                {doc.statut === "SIGNE" && doc.signedDocumentUrl && (
                                  <a
                                    href={doc.signedDocumentUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-100 rounded-lg hover:bg-emerald-200 transition-colors"
                                  >
                                    <Download className="w-3.5 h-3.5" /> PDF signé
                                  </a>
                                )}

                                {doc.meta?.href ? (
                                  <a
                                    href={doc.meta.href}
                                    className="text-xs text-indigo-600 hover:text-indigo-800 underline underline-offset-2"
                                  >
                                    Voir
                                  </a>
                                ) : null}

                                {doc.fichierUrl ? (
                                  <a
                                    href={doc.fichierUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs text-gray-400 hover:text-gray-700 underline underline-offset-2"
                                    title="Voir le PDF d'origine"
                                  >
                                    Original
                                  </a>
                                ) : null}
                              </div>
                            </div>

                            {showRelance && (
                              <div className="flex flex-wrap items-end gap-2 pt-1 border-t border-gray-200/80">
                                <div className="flex-1 min-w-[200px]">
                                  <label className="block text-xs font-medium text-gray-600 mb-1">
                                    Email de relance
                                  </label>
                                  <input
                                    type="email"
                                    value={relanceEmail}
                                    onChange={(e) => setRelanceEmail(e.target.value)}
                                    disabled={busy}
                                    placeholder="email@exemple.com"
                                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none disabled:opacity-60"
                                    autoFocus
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRelancer(doc)}
                                  disabled={busy}
                                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-60"
                                >
                                  {busy ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Send className="w-3.5 h-3.5" />
                                  )}
                                  Renvoyer
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRelanceKey(null)}
                                  disabled={busy}
                                  className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                                  title="Annuler"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
