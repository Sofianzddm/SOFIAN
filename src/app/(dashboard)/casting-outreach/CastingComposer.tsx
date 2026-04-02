"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  X,
  Loader2,
  Eye,
  Pencil,
} from "lucide-react";
import { useSession } from "next-auth/react";
import type { HubSpotContactCasting } from "@/lib/hubspot";

const LICORICE = "#1A1110";
const OLD_ROSE = "#C08B8B";
const TEA_GREEN = "#C8F285";
const OLD_LACE = "#F5EBE0";

type PresskitTalent = {
  id: string;
  prenom: string;
  nom: string;
  photo: string | null;
  niches: string[];
  igFollowers: number;
  igEngagement: number;
  ttFollowers: number;
  ttEngagement: number;
};

function nicheColor(index: number): string {
  const palette = ["#C08B8B", "#C8F285", "#1A1110", "#8B7355"];
  return palette[index % palette.length];
}

function primaryTalentStat(t: PresskitTalent): string {
  if (t.igFollowers > 0) {
    return `${new Intl.NumberFormat("fr-FR").format(t.igFollowers)} abonnés IG`;
  }
  if (t.igEngagement > 0) {
    return `${t.igEngagement.toFixed(1)} % engagement IG`;
  }
  if (t.ttFollowers > 0) {
    return `${new Intl.NumberFormat("fr-FR").format(t.ttFollowers)} abonnés TikTok`;
  }
  if (t.ttEngagement > 0) {
    return `${t.ttEngagement.toFixed(1)} % engagement TikTok`;
  }
  return "—";
}

/** Jetons type HubSpot — mêmes chaînes qu’en base / export */
const VARIABLES_CONTACT_OWNER: { token: string; label: string }[] = [
  { token: "{{ contact.firstname }}", label: "Prénom du contact" },
  { token: "{{contact.lastname}}", label: "Nom du contact" },
  { token: "{{ contact.company }}", label: "Nom de la marque" },
  { token: "{{ owner.firstname }}", label: "Prénom de la sales (expéditrice)" },
];

const VARIABLES_TALENTS: { token: string; label: string }[] = [
  { token: "{{talent_1}}", label: "Talent 1" },
  { token: "{{talent_2}}", label: "Talent 2" },
  { token: "{{talent_3}}", label: "Talent 3" },
  { token: "{{talent_4}}", label: "Talent 4" },
  { token: "{{talent_5}}", label: "Talent 5" },
];

function applyTemplateVars(
  text: string,
  contact: HubSpotContactCasting,
  talentsOrdered: PresskitTalent[],
  ownerFirstName: string
): string {
  let s = text;
  const prenom = (contact.firstname || "").trim();
  const nom = (contact.lastname || "").trim();
  const nomComplet = `${prenom} ${nom}`.trim() || "—";
  const marque = (contact.companyName || "").trim() || "—";
  const emailContact = (contact.email || "").trim() || "—";
  const owner = (ownerFirstName || "").trim() || "—";

  s = s.replace(/\{\{\s*contact\.firstname\s*\}\}/gi, prenom);
  s = s.replace(/\{\{contact\.lastname\}\}/gi, nom);
  s = s.replace(/\{\{\s*contact\.company\s*\}\}/gi, marque);
  s = s.replace(/\{\{\s*owner\.firstname\s*\}\}/gi, owner);

  /* Anciens jetons (brouillons déjà rédigés) */
  s = s.replace(/\{\{nom_complet\}\}/gi, nomComplet);
  s = s.replace(/\{\{prénom\}\}/gi, prenom);
  s = s.replace(/\{\{nom\}\}/gi, nom);
  s = s.replace(/\{\{marque\}\}/gi, marque);
  s = s.replace(/\{\{email_contact\}\}/gi, emailContact);

  for (let i = 0; i < 5; i++) {
    const t = talentsOrdered[i];
    const val = t ? `${t.prenom} ${t.nom}`.trim() : `[Talent ${i + 1} — à sélectionner]`;
    s = s.replace(new RegExp(`\\{\\{talent_${i + 1}\\}\\}`, "gi"), val);
  }
  return s;
}

/** Premier prénom depuis le nom complet session (expéditrice) */
function firstNameFromSessionName(name: string | null | undefined): string {
  if (!name?.trim()) return "";
  return name.trim().split(/\s+/)[0] ?? "";
}

type BrandResearchState = {
  recentCampaigns: string;
  newProducts: string;
  brandPositioning: string;
  influenceStrategy: string;
};

/** **gras** Markdown → <strong>, puis paragraphes HTML */
function markdownBoldToStrong(s: string): string {
  return s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

/** Corps email généré : HTML si déjà balisé, sinon Markdown léger (**gras**) + paragraphes */
function plainTextToEmailHtml(text: string): string {
  const t = text.trim();
  if (!t) return "<p></p>";
  if (t.startsWith("<")) return t;
  const withBold = markdownBoldToStrong(t);

  const normalized = withBold.replace(/\r\n/g, "\n");
  const hasBlankLine = /\n\s*\n/.test(normalized);
  const rawParagraphs = hasBlankLine ? normalized.split(/\n\s*\n+/) : [normalized];

  return rawParagraphs
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => `<p style="margin:0;">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

export interface CastingComposerProps {
  open: boolean;
  contact: HubSpotContactCasting | null;
  onClose: () => void;
  onSaved: (status: "en_cours" | "pret") => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

export default function CastingComposer({
  open,
  contact,
  onClose,
  onSaved,
  onError,
  onSuccess,
}: CastingComposerProps) {
  const { data: session } = useSession();
  const ownerFirstName = useMemo(
    () => firstNameFromSessionName(session?.user?.name),
    [session?.user?.name]
  );

  const [subject, setSubject] = useState("");
  const [talents, setTalents] = useState<PresskitTalent[]>([]);
  const [loadingTalents, setLoadingTalents] = useState(false);
  const [talentsError, setTalentsError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [editorEmpty, setEditorEmpty] = useState(true);
  /** Dernier champ focalisé : les variables s’y insèrent au clic */
  const [lastField, setLastField] = useState<"subject" | "body">("body");
  const [previewMode, setPreviewMode] = useState<"edit" | "preview">("edit");
  /** Re-render aperçu quand le corps change */
  const [bodyTick, setBodyTick] = useState(0);
  const subjectInputRef = useRef<HTMLInputElement>(null);
  const [brandResearch, setBrandResearch] = useState<BrandResearchState | null>(null);
  const [isResearching, setIsResearching] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  type TalentDetailPreview = {
    id: string;
    prenom: string;
    nom: string;
    photo: string | null;
    email?: string;
    telephone?: string | null;
    bio?: string | null;
    presentation?: string | null;
    presentationEn?: string | null;
    ville?: string | null;
    pays?: string | null;
    instagram?: string | null;
    tiktok?: string | null;
    youtube?: string | null;
    snapchat?: string | null;
    niches: string[];
    selectedClients?: string[];
    commissionInbound?: number;
    commissionOutbound?: number;
    manager?: { prenom: string; nom: string } | null;
    stats?: Record<string, unknown> | null;
    tarifs?: Record<string, unknown> | null;
    collaborations?: Array<{
      id: string;
      marque?: { nom: string } | null;
      livrables?: unknown;
      createdAt?: string;
    }>;
    negociations?: Array<{
      id: string;
      marque?: { nom: string } | null;
      createdAt?: string;
    }>;
    demandesGift?: Array<{
      id: string;
      tm?: { prenom: string; nom: string } | null;
      accountManager?: { prenom: string; nom: string } | null;
      createdAt?: string;
    }>;
  };

  const [talentDetailOpen, setTalentDetailOpen] = useState(false);
  const [talentDetailLoading, setTalentDetailLoading] = useState(false);
  const [talentDetailError, setTalentDetailError] = useState<string | null>(null);
  const [talentDetail, setTalentDetail] = useState<TalentDetailPreview | null>(null);

  const rawTalentEntries = useMemo(() => {
    if (!talentDetail) return [];

    const safeValueToString = (v: unknown): string => {
      if (v === null) return "null";
      if (v === undefined) return "—";
      if (v instanceof Date) return v.toISOString();
      if (typeof v === "string") return v;
      if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint")
        return String(v);
      // Pour Decimal / types non-plains, on privilégie la conversion en string
      try {
        const s = String(v);
        if (s && s !== "[object Object]") return s;
      } catch {
        /* ignore */
      }
      try {
        return JSON.stringify(v);
      } catch {
        return "[unstringifiable]";
      }
    };

    const isPlainObject = (v: unknown): v is Record<string, unknown> => {
      if (!v || typeof v !== "object") return false;
      const proto = Object.getPrototypeOf(v);
      return proto === Object.prototype || proto === null;
    };

    type Entry = { path: string; value: string };
    const entries: Entry[] = [];
    const seen = new WeakSet<object>();
    const MAX_ENTRIES = 10000;

    const walk = (val: unknown, path: string, depth: number) => {
      if (entries.length >= MAX_ENTRIES) return;
      if (depth > 18) {
        entries.push({ path: path || "(root)", value: safeValueToString(val) });
        return;
      }
      if (val === null || val === undefined) {
        entries.push({ path: path || "(root)", value: safeValueToString(val) });
        return;
      }
      if (typeof val !== "object" || val instanceof Date) {
        entries.push({ path: path || "(root)", value: safeValueToString(val) });
        return;
      }
      if (seen.has(val as object)) {
        entries.push({ path: path || "(root)", value: "[circular]" });
        return;
      }
      seen.add(val as object);

      if (Array.isArray(val)) {
        if (val.length === 0) {
          entries.push({ path: path || "(root)", value: "[]" });
          return;
        }
        val.forEach((item, i) => {
          walk(item, path ? `${path}[${i}]` : `[${i}]`, depth + 1);
        });
        return;
      }

      if (!isPlainObject(val)) {
        entries.push({ path: path || "(root)", value: safeValueToString(val) });
        return;
      }

      const keys = Object.keys(val);
      if (keys.length === 0) {
        entries.push({ path: path || "(root)", value: "{}" });
        return;
      }

      for (const k of keys) {
        const nextPath = path ? `${path}.${k}` : k;
        walk((val as Record<string, unknown>)[k], nextPath, depth + 1);
        if (entries.length >= MAX_ENTRIES) break;
      }
    };

    walk(talentDetail, "", 0);
    return entries;
  }, [talentDetail]);

  const editor = useEditor({
    extensions: [StarterKit],
    content: "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none min-h-[220px] px-3 py-2 text-sm focus:outline-none",
        style: `font-family: Switzer, system-ui, sans-serif; color: ${LICORICE}`,
      },
      handleDOMEvents: {
        focus: () => {
          setLastField("body");
          return false;
        },
      },
    },
    onUpdate: ({ editor: ed }) => {
      setEditorEmpty(ed.isEmpty);
      setBodyTick((n) => n + 1);
    },
    onCreate: ({ editor: ed }) => {
      setEditorEmpty(ed.isEmpty);
    },
  });

  const insertVariable = useCallback(
    (token: string) => {
      if (lastField === "subject") {
        const el = subjectInputRef.current;
        if (!el) return;
        setSubject((prev) => {
          const start = Math.min(el.selectionStart ?? prev.length, prev.length);
          const end = Math.min(el.selectionEnd ?? prev.length, prev.length);
          const next = prev.slice(0, start) + token + prev.slice(end);
          const pos = start + token.length;
          queueMicrotask(() => {
            el.focus();
            el.setSelectionRange(pos, pos);
          });
          return next;
        });
        return;
      }
      editor?.chain().focus().insertContent(token).run();
    },
    [lastField, editor]
  );

  useEffect(() => {
    if (!open || !contact || !editor) return;
    setSubject(contact.castingEmailSubject || "");
    setSelectedIds(new Set());
    setPreviewMode("edit");
    setLastField("body");
    setBrandResearch(null);
    const html = contact.castingEmailBody?.trim()
      ? contact.castingEmailBody
      : "<p></p>";
    editor.commands.setContent(html);
    setEditorEmpty(editor.isEmpty);
    setBodyTick((n) => n + 1);
  }, [open, contact, editor]);

  const runBrandResearch = useCallback(async () => {
    if (!contact?.companyName?.trim()) {
      onError("Nom de marque manquant pour la recherche.");
      return;
    }
    setIsResearching(true);
    try {
      const res = await fetch("/api/casting/brand-research", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandName: contact.companyName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Recherche impossible."
        );
      }
      setBrandResearch(data as BrandResearchState);
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setIsResearching(false);
    }
  }, [contact, onError]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingTalents(true);
    setTalentsError(null);
    fetch("/api/talents?presskit=true", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(
            typeof j.message === "string" ? j.message : "Chargement des talents impossible."
          );
        }
        return res.json();
      })
      .then((data: { talents?: PresskitTalent[] }) => {
        if (!cancelled) {
          setTalents(Array.isArray(data.talents) ? data.talents : []);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setTalentsError(e instanceof Error ? e.message : "Erreur réseau.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingTalents(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const selectedTalents = useMemo(
    () => talents.filter((t) => selectedIds.has(t.id)),
    [talents, selectedIds]
  );

  const runGenerateEmail = useCallback(async () => {
    if (!contact || !brandResearch) return;
    if (selectedTalents.length === 0) return;
    setIsGenerating(true);
    try {
      const talentsPayload = selectedTalents.map((t) => {
        const followers = Math.max(t.igFollowers || 0, t.ttFollowers || 0);
        const eng =
          t.igEngagement > 0
            ? t.igEngagement
            : t.ttEngagement > 0
              ? t.ttEngagement
              : undefined;
        return {
          name: `${t.prenom} ${t.nom}`.trim(),
          niche: (t.niches || []).join(", ") || "—",
          followers,
          ...(typeof eng === "number" ? { engagementRate: eng } : {}),
        };
      });
      const res = await fetch("/api/casting/generate-email", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandName: contact.companyName,
          brandResearch,
          talents: talentsPayload,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Génération impossible."
        );
      }
      const subjectNext = typeof data.subject === "string" ? data.subject : "";
      const bodyNext = typeof data.body === "string" ? data.body : "";
      setSubject(subjectNext);
      const html = plainTextToEmailHtml(bodyNext);
      editor?.commands.setContent(html);
      setEditorEmpty(!editor?.getText().trim());
      setBodyTick((n) => n + 1);
      onSuccess("Email généré automatiquement ✨ — à toi de l’ajuster");
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setIsGenerating(false);
    }
  }, [contact, brandResearch, selectedTalents, editor, onError, onSuccess]);

  const previewSubjectResolved = useMemo(() => {
    if (!contact) return "";
    return applyTemplateVars(subject, contact, selectedTalents, ownerFirstName);
  }, [subject, contact, selectedTalents, ownerFirstName]);

  const previewBodyResolved = useMemo(() => {
    if (!contact || !editor) return "";
    return applyTemplateVars(editor.getHTML(), contact, selectedTalents, ownerFirstName);
  }, [contact, selectedTalents, editor, bodyTick, ownerFirstName]);

  const toggleTalent = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const removeTalent = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const openTalentDetail = useCallback(async (id: string) => {
    setTalentDetailOpen(true);
    setTalentDetailLoading(true);
    setTalentDetailError(null);
    setTalentDetail(null);

    try {
      const res = await fetch(`/api/talents/${id}`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Erreur de chargement.");
      }
      setTalentDetail(data as TalentDetailPreview);
    } catch (e: unknown) {
      setTalentDetailError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setTalentDetailLoading(false);
    }
  }, []);

  const closeTalentDetail = () => {
    setTalentDetailOpen(false);
    setTalentDetail(null);
    setTalentDetailError(null);
    setTalentDetailLoading(false);
  };

  const getBodyHtml = () => editor?.getHTML() ?? "";

  const submit = async (status: "en_cours" | "pret") => {
    if (!contact) return;
    const sub = subject.trim();
    if (!sub) {
      onError("L’objet de l’email est obligatoire.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/hubspot/casting", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: contact.id,
          firstname: contact.firstname,
          lastname: contact.lastname,
          company: contact.companyName,
          subject: sub,
          body: getBodyHtml(),
          status,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Enregistrement impossible."
        );
      }
      onSaved(status);
      if (status === "en_cours") {
        onSuccess("Brouillon enregistré");
      } else {
        const marque = contact.companyName || "la marque";
        onSuccess(`Email prêt pour ${marque} ✓`);
        onClose();
      }
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : "Erreur inattendue.");
    } finally {
      setSaving(false);
    }
  };

  const setLink = () => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL du lien", prev || "https://");
    if (url === null) return;
    const trimmed = url.trim();
    if (trimmed === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: trimmed }).run();
  };

  if (!open || !contact) return null;

  const brandTitle = contact.companyName || "Marque";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center p-4 bg-black/45 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="casting-composer-title"
    >
      <div
        className="w-full max-w-6xl h-[calc(100vh-2rem)] max-h-[calc(100vh-2rem)] overflow-hidden flex flex-col rounded-2xl shadow-xl border border-[#E8DED0]"
        style={{ backgroundColor: OLD_LACE }}
      >
        <div
          className="flex items-center justify-between px-5 py-3 border-b shrink-0"
          style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}
        >
          <h2
            id="casting-composer-title"
            className="text-lg font-semibold"
            style={{ fontFamily: "Spectral, serif", color: LICORICE }}
          >
            Rédiger l’email — {brandTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-black/5 transition-colors"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" style={{ color: LICORICE }} />
          </button>
        </div>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Colonne talents */}
          <div
            className="w-full md:w-1/3 flex flex-col border-r min-h-0 overflow-hidden"
            style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}
          >
            <div className="px-4 py-3 shrink-0">
              <h3
                className="text-sm font-semibold mb-2"
                style={{ fontFamily: "Spectral, serif", color: LICORICE }}
              >
                Sélectionner les talents
              </h3>
              {talentsError && (
                <p className="text-xs text-red-600 mb-2">{talentsError}</p>
              )}
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
              {loadingTalents && (
                <div className="flex items-center gap-2 text-sm" style={{ color: OLD_ROSE }}>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Chargement…
                </div>
              )}
              {!loadingTalents &&
                talents.map((t) => {
                  const sel = selectedIds.has(t.id);
                  return (
                    <div
                      key={t.id}
                      role="button"
                      tabIndex={0}
                      aria-pressed={sel}
                      onClick={() => toggleTalent(t.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleTalent(t.id);
                        }
                      }}
                      className={`w-full text-left rounded-xl border-2 p-3 transition-colors bg-white/80 cursor-pointer ${
                        sel ? "shadow-sm" : "border-transparent hover:border-black/10"
                      }`}
                      style={
                        sel
                          ? { borderColor: TEA_GREEN }
                          : { borderColor: "transparent" }
                      }
                    >
                      <div className="flex gap-3">
                        <div className="shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openTalentDetail(t.id);
                            }}
                            onKeyDown={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-white/90 border border-slate-200 hover:bg-white"
                            style={{ color: LICORICE }}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Détail
                          </button>
                        </div>
                        <div className="relative w-14 h-14 rounded-lg overflow-hidden bg-gray-200 shrink-0">
                          {t.photo ? (
                            <Image
                              src={t.photo}
                              alt=""
                              fill
                              className="object-cover"
                              sizes="56px"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">
                              —
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p
                            className="font-semibold text-sm truncate"
                            style={{ color: LICORICE }}
                          >
                            {t.prenom} {t.nom}
                          </p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {(t.niches || []).slice(0, 2).map((n, i) => (
                              <span
                                key={n}
                                className="text-[10px] px-1.5 py-0.5 rounded-full text-white"
                                style={{ backgroundColor: nicheColor(i) }}
                              >
                                {n}
                              </span>
                            ))}
                          </div>
                          <p className="text-xs mt-1 opacity-80" style={{ color: LICORICE }}>
                            {primaryTalentStat(t)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
            {selectedTalents.length > 0 && (
              <div className="px-4 py-3 border-t shrink-0 bg-white/50">
                <p className="text-xs font-medium mb-2" style={{ color: LICORICE }}>
                  Talents choisis
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedTalents.map((t) => (
                    <span
                      key={t.id}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full"
                      style={{ backgroundColor: TEA_GREEN, color: LICORICE }}
                    >
                      {t.prenom} {t.nom}
                      <button
                        type="button"
                        className="rounded-full p-0.5 hover:bg-black/10"
                        onClick={() => removeTalent(t.id)}
                        aria-label={`Retirer ${t.prenom}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Colonne email */}
          <div className="w-full md:w-2/3 flex flex-col min-h-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <h2
                className="text-2xl font-semibold"
                style={{ fontFamily: "Spectral, serif", color: LICORICE }}
              >
                {brandTitle}
              </h2>

              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={runBrandResearch}
                    disabled={isResearching}
                    className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-xl border transition-opacity disabled:opacity-60"
                    style={{
                      borderColor: OLD_ROSE,
                      color: LICORICE,
                      fontFamily: "Switzer, system-ui, sans-serif",
                    }}
                  >
                    {isResearching ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        Recherche automatique sur {contact.companyName || "la marque"}…
                      </>
                    ) : (
                      <>🔍 Par recherche automatique</>
                    )}
                  </button>
                  {brandResearch && (
                    <button
                      type="button"
                      onClick={runBrandResearch}
                      disabled={isResearching}
                      className="text-sm px-2 py-1 rounded-lg hover:bg-black/5 transition-colors disabled:opacity-60"
                      style={{ color: OLD_ROSE }}
                    >
                      🔄 Actualiser
                    </button>
                  )}
                </div>
                {brandResearch && (
                  <div
                    className="rounded-xl border p-4 space-y-3 text-sm"
                    style={{
                      borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)`,
                      color: LICORICE,
                      fontFamily: "Switzer, system-ui, sans-serif",
                    }}
                  >
                    <p>{brandResearch.recentCampaigns}</p>
                    <p>{brandResearch.newProducts}</p>
                    <p>{brandResearch.brandPositioning}</p>
                    <p>{brandResearch.influenceStrategy}</p>
                  </div>
                )}
              </div>

              {previewMode === "edit" && (
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: LICORICE }}>
                    Objet de l’email <span className="text-red-500">*</span>
                  </label>
                  <input
                    ref={subjectInputRef}
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    onFocus={() => setLastField("subject")}
                    className="w-full rounded-xl border px-3 py-2 text-sm focus:ring-2 focus:ring-offset-0"
                    style={{
                      borderColor: OLD_ROSE,
                      fontFamily: "Switzer, system-ui, sans-serif",
                      color: LICORICE,
                    }}
                    placeholder="Objet…"
                  />
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="text-xs space-y-0.5" style={{ color: OLD_ROSE }}>
                  <p className="font-medium" style={{ color: LICORICE }}>
                    Variables dynamiques
                  </p>
                  <p>
                    Cliquez sur un jeton : insertion au curseur dans{" "}
                    <strong>{lastField === "subject" ? "l’objet" : "le corps"}</strong> (cliquez dans
                    l’autre champ pour changer).
                  </p>
                </div>
                <div
                  className="inline-flex rounded-xl border p-0.5 shrink-0"
                  style={{
                    borderColor: `color-mix(in srgb, ${OLD_ROSE} 45%, transparent)`,
                    backgroundColor: "white",
                  }}
                  role="group"
                  aria-label="Mode édition ou aperçu"
                >
                  <button
                    type="button"
                    onClick={() => setPreviewMode("edit")}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: previewMode === "edit" ? TEA_GREEN : "transparent",
                      color: LICORICE,
                    }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Éditer
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode("preview")}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: previewMode === "preview" ? TEA_GREEN : "transparent",
                      color: LICORICE,
                    }}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Aperçu
                  </button>
                </div>
              </div>

              {previewMode === "edit" && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {VARIABLES_CONTACT_OWNER.map((v) => (
                      <button
                        key={v.token}
                        type="button"
                        onClick={() => insertVariable(v.token)}
                        className="text-xs px-2 py-1.5 rounded-lg border font-mono transition-colors hover:opacity-90 text-left max-w-full"
                        style={{
                          borderColor: OLD_ROSE,
                          backgroundColor: "white",
                          color: LICORICE,
                        }}
                        title={`${v.label} — ${v.token}`}
                      >
                        <span className="block truncate">{v.token}</span>
                        <span className="block text-[10px] font-sans opacity-80 font-normal normal-case">
                          {v.label}
                        </span>
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] uppercase tracking-wide" style={{ color: OLD_ROSE }}>
                    Talents (optionnel)
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {VARIABLES_TALENTS.map((v) => (
                      <button
                        key={v.token}
                        type="button"
                        onClick={() => insertVariable(v.token)}
                        className="text-xs px-2 py-1 rounded-lg border font-mono transition-colors hover:opacity-90"
                        style={{
                          borderColor: OLD_ROSE,
                          backgroundColor: "white",
                          color: LICORICE,
                        }}
                        title={v.label}
                      >
                        {v.token}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {previewMode === "preview" ? (
                <div
                  className="rounded-xl border p-4 space-y-4 bg-white"
                  style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}
                >
                  <p className="text-[11px] uppercase tracking-wide" style={{ color: OLD_ROSE }}>
                    Rendu final (contact + talents sélectionnés)
                  </p>
                  <div>
                    <p className="text-[10px] uppercase mb-1 opacity-70" style={{ color: LICORICE }}>
                      Objet
                    </p>
                    <p className="text-sm font-semibold" style={{ color: LICORICE }}>
                      {previewSubjectResolved || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase mb-1 opacity-70" style={{ color: LICORICE }}>
                      Corps
                    </p>
                    <div
                      className="prose prose-sm max-w-none text-sm min-h-[200px] border-t pt-3"
                      style={{
                        fontFamily: "Switzer, system-ui, sans-serif",
                        color: LICORICE,
                      }}
                      dangerouslySetInnerHTML={{ __html: previewBodyResolved || "<p></p>" }}
                    />
                  </div>
                  <p className="text-[11px] leading-snug opacity-75" style={{ color: OLD_ROSE }}>
                    Ce que vous voyez correspond au texte enregistré dans HubSpot : les variables{" "}
                    <code className="font-mono text-[10px]">{"{{…}}"}</code> sont remplacées ici à
                    titre d’aperçu avec les données ci-dessus.
                  </p>
                </div>
              ) : (
                <div>
                  <div
                    className="rounded-xl border overflow-hidden bg-white"
                    style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}
                  >
                    {editor && (
                      <div
                        className="flex flex-wrap items-center gap-1 px-2 py-1.5 border-b"
                        style={{
                          borderColor: `color-mix(in srgb, ${OLD_ROSE} 25%, transparent)`,
                          backgroundColor: OLD_LACE,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => editor.chain().focus().toggleBold().run()}
                          className={`p-1.5 rounded hover:bg-white/80 ${
                            editor.isActive("bold") ? "bg-white" : ""
                          }`}
                          aria-label="Gras"
                        >
                          <Bold className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => editor.chain().focus().toggleItalic().run()}
                          className={`p-1.5 rounded hover:bg-white/80 ${
                            editor.isActive("italic") ? "bg-white" : ""
                          }`}
                          aria-label="Italique"
                        >
                          <Italic className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => editor.chain().focus().toggleBulletList().run()}
                          className={`p-1.5 rounded hover:bg-white/80 ${
                            editor.isActive("bulletList") ? "bg-white" : ""
                          }`}
                          aria-label="Liste à puces"
                        >
                          <List className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => editor.chain().focus().toggleOrderedList().run()}
                          className={`p-1.5 rounded hover:bg-white/80 ${
                            editor.isActive("orderedList") ? "bg-white" : ""
                          }`}
                          aria-label="Liste numérotée"
                        >
                          <ListOrdered className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={setLink}
                          className={`p-1.5 rounded hover:bg-white/80 ${
                            editor.isActive("link") ? "bg-white" : ""
                          }`}
                          aria-label="Lien"
                        >
                          <LinkIcon className="w-4 h-4" />
                        </button>
                        <span
                          className="text-sm px-1 self-center select-none"
                          style={{ color: OLD_ROSE }}
                          aria-hidden
                        >
                          |
                        </span>
                        <button
                          type="button"
                          onClick={runGenerateEmail}
                          disabled={
                            isGenerating ||
                            !brandResearch ||
                            selectedTalents.length === 0
                          }
                          title={
                            !brandResearch
                              ? "Recherchez d'abord la marque"
                              : selectedTalents.length === 0
                                ? "Sélectionnez au moins un talent"
                                : "Générer le corps et l’objet automatiquement"
                          }
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-opacity disabled:opacity-50"
                          style={{
                            backgroundColor: "#C08B8B",
                            color: "white",
                            fontFamily: "Switzer, system-ui, sans-serif",
                          }}
                        >
                          {isGenerating ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                              Rédaction en cours…
                            </>
                          ) : (
                            <>✍️ Rédiger le mail automatiquement</>
                          )}
                        </button>
                      </div>
                    )}
                    {previewMode === "edit" &&
                      brandResearch &&
                      selectedTalents.length === 0 &&
                      !isGenerating && (
                        <p
                          className="text-[11px] px-2 pb-1 pt-0.5 leading-snug"
                          style={{ color: OLD_ROSE }}
                        >
                          Sélectionnez au moins un talent dans la colonne de gauche pour activer
                          « Rédiger le mail automatiquement ».
                        </p>
                      )}
                    <div className="relative">
                      {editorEmpty && (
                        <div
                          className="absolute left-3 top-2 text-sm pointer-events-none text-gray-400 z-[1]"
                          style={{ fontFamily: "Switzer, system-ui, sans-serif" }}
                        >
                          Rédigez votre email personnalisé…
                        </div>
                      )}
                      <EditorContent editor={editor} />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-medium mb-2" style={{ color: OLD_ROSE }}>
                  Talents sélectionnés (résumé)
                </p>
                <div
                  className="rounded-xl border px-3 py-2 text-sm min-h-[48px]"
                  style={{
                    borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)`,
                    color: LICORICE,
                    fontFamily: "Switzer, system-ui, sans-serif",
                  }}
                >
                  {selectedTalents.length === 0 ? (
                    <span className="opacity-60">Aucun talent sélectionné.</span>
                  ) : (
                    <ul className="list-disc list-inside space-y-0.5">
                      {selectedTalents.map((t) => (
                        <li key={t.id}>
                          {t.prenom} {t.nom}
                          {(t.niches || [])[0] ? ` — ${(t.niches || [])[0]}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            <div
              className="flex flex-wrap items-center justify-end gap-2 px-5 py-3 border-t shrink-0 bg-white/90 sticky bottom-0"
              style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}
            >
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 text-sm rounded-xl hover:bg-black/5 transition-colors"
                style={{ color: LICORICE }}
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => submit("en_cours")}
                className="px-4 py-2 text-sm rounded-xl border-2 transition-colors"
                style={{ borderColor: OLD_ROSE, color: LICORICE }}
              >
                Enregistrer brouillon
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => submit("pret")}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-opacity disabled:opacity-60"
                style={{ backgroundColor: TEA_GREEN, color: LICORICE }}
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Marquer comme prêt
              </button>
            </div>
          </div>
        {talentDetailOpen && (
          <div
            className="fixed inset-0 z-[200] bg-black/40 flex items-center justify-center p-4"
            onClick={closeTalentDetail}
            role="dialog"
            aria-modal="true"
            aria-label="Fiche talent"
          >
            <div
              className="w-full max-w-md overflow-hidden rounded-2xl shadow-xl border border-[#E8DED0] bg-white"
              onClick={(e) => e.stopPropagation()}
              style={{ fontFamily: "Switzer, system-ui, sans-serif" }}
            >
              <div
                className="flex items-center justify-between px-4 py-3 border-b shrink-0"
                style={{
                  borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)`,
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Eye className="w-4 h-4" style={{ color: LICORICE }} />
                  <p className="text-sm font-semibold truncate" style={{ color: LICORICE }}>
                    Fiche talent
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeTalentDetail}
                  className="p-2 rounded-lg hover:bg-black/5 transition-colors"
                  aria-label="Fermer la fiche talent"
                  style={{ color: LICORICE }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4">
                {talentDetailLoading && (
                  <div className="flex items-center gap-2 text-sm" style={{ color: OLD_ROSE }}>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Chargement…
                  </div>
                )}

                {talentDetailError && (
                  <p className="text-sm" style={{ color: OLD_ROSE }}>
                    {talentDetailError}
                  </p>
                )}

                {!talentDetailLoading && !talentDetailError && talentDetail && (
                  <div className="space-y-3">
                    {/* Header simple */}
                    <div className="flex items-start gap-3">
                      <div className="relative w-14 h-14 rounded-lg overflow-hidden bg-gray-200 shrink-0">
                        {talentDetail.photo ? (
                          <Image
                            src={talentDetail.photo}
                            alt=""
                            fill
                            className="object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">
                            —
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p
                          className="font-semibold truncate"
                          style={{ color: LICORICE }}
                        >
                          {talentDetail.prenom} {talentDetail.nom}
                        </p>

                        <div className="flex flex-wrap gap-1 mt-1">
                          {(talentDetail.niches || []).slice(0, 6).map((n, i) => (
                            <span
                              key={`${n}-${i}`}
                              className="text-[10px] px-1.5 py-0.5 rounded-full text-white"
                              style={{ backgroundColor: nicheColor(i) }}
                            >
                              {n}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Présentation + bio */}
                    {(talentDetail.presentation || talentDetail.bio) && (
                      <div className="space-y-2">
                        {talentDetail.presentation && (
                          <p
                            className="text-sm leading-relaxed"
                            style={{ color: LICORICE }}
                          >
                            {talentDetail.presentation.length > 320
                              ? `${talentDetail.presentation.slice(0, 320)}…`
                              : talentDetail.presentation}
                          </p>
                        )}
                        {talentDetail.bio && (
                          <p
                            className="text-sm leading-relaxed opacity-90"
                            style={{ color: LICORICE }}
                          >
                            {talentDetail.bio.length > 220
                              ? `${talentDetail.bio.slice(0, 220)}…`
                              : talentDetail.bio}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Réseaux + stats essentielles (IG/TikTok + vues/clics stories) */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-xl border p-3" style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}>
                        <p className="text-xs opacity-75" style={{ color: OLD_ROSE }}>
                          IG (audience)
                        </p>
                        <p className="text-sm font-medium" style={{ color: LICORICE }}>
                          {typeof (talentDetail.stats as any)?.igFollowers === "number"
                            ? `${new Intl.NumberFormat("fr-FR").format((talentDetail.stats as any).igFollowers)} abonnés`
                            : "—"}
                        </p>
                        {typeof (talentDetail.stats as any)?.igEngagement === "number" && (
                          <p className="text-xs mt-1 opacity-80" style={{ color: LICORICE }}>
                            Engagement {((talentDetail.stats as any).igEngagement as number).toFixed(1)}%
                          </p>
                        )}
                        {typeof (talentDetail.stats as any)?.storyViews30d === "number" && (
                          <p className="text-xs mt-2 opacity-80" style={{ color: LICORICE }}>
                            Stories vues 30j : {new Intl.NumberFormat("fr-FR").format((talentDetail.stats as any).storyViews30d)}
                          </p>
                        )}
                        {typeof (talentDetail.stats as any)?.storyViews7d === "number" && (
                          <p className="text-xs mt-1 opacity-80" style={{ color: LICORICE }}>
                            Stories vues 7j : {new Intl.NumberFormat("fr-FR").format((talentDetail.stats as any).storyViews7d)}
                          </p>
                        )}
                        {typeof (talentDetail.stats as any)?.storyLinkClicks30d === "number" && (
                          <p className="text-xs mt-1 opacity-80" style={{ color: LICORICE }}>
                            Clics liens 30j : {new Intl.NumberFormat("fr-FR").format((talentDetail.stats as any).storyLinkClicks30d)}
                          </p>
                        )}
                      </div>

                      <div className="rounded-xl border p-3" style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}>
                        <p className="text-xs opacity-75" style={{ color: OLD_ROSE }}>
                          TikTok (audience)
                        </p>
                        <p className="text-sm font-medium" style={{ color: LICORICE }}>
                          {typeof (talentDetail.stats as any)?.ttFollowers === "number"
                            ? `${new Intl.NumberFormat("fr-FR").format((talentDetail.stats as any).ttFollowers)} abonnés`
                            : "—"}
                        </p>
                        {typeof (talentDetail.stats as any)?.ttEngagement === "number" && (
                          <p className="text-xs mt-1 opacity-80" style={{ color: LICORICE }}>
                            Engagement {((talentDetail.stats as any).ttEngagement as number).toFixed(1)}%
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Contact + localisation */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-xl border p-3" style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}>
                        <p className="text-xs opacity-75" style={{ color: OLD_ROSE }}>Email</p>
                        <p className="text-sm font-medium" style={{ color: LICORICE }}>
                          {talentDetail.email ? talentDetail.email : "—"}
                        </p>
                      </div>
                      <div className="rounded-xl border p-3" style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}>
                        <p className="text-xs opacity-75" style={{ color: OLD_ROSE }}>Téléphone</p>
                        <p className="text-sm font-medium" style={{ color: LICORICE }}>
                          {talentDetail.telephone ? talentDetail.telephone : "—"}
                        </p>
                      </div>
                      <div className="rounded-xl border p-3" style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}>
                        <p className="text-xs opacity-75" style={{ color: OLD_ROSE }}>Ville</p>
                        <p className="text-sm font-medium" style={{ color: LICORICE }}>
                          {talentDetail.ville ? talentDetail.ville : "—"}
                        </p>
                      </div>
                      <div className="rounded-xl border p-3" style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}>
                        <p className="text-xs opacity-75" style={{ color: OLD_ROSE }}>Pays</p>
                        <p className="text-sm font-medium" style={{ color: LICORICE }}>
                          {talentDetail.pays ? talentDetail.pays : "—"}
                        </p>
                      </div>
                    </div>

                    {/* Tarifs (lisibles) */}
                    <div className="rounded-xl border p-3" style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}>
                      <p className="text-sm font-semibold" style={{ color: LICORICE }}>
                        Tarifs (aperçu)
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-[11px] opacity-75" style={{ color: OLD_ROSE }}>Story</p>
                          <p className="text-sm font-medium" style={{ color: LICORICE }}>
                            {((talentDetail.tarifs as any)?.tarifStory ?? null) ? `${String((talentDetail.tarifs as any).tarifStory)}€` : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] opacity-75" style={{ color: OLD_ROSE }}>Post</p>
                          <p className="text-sm font-medium" style={{ color: LICORICE }}>
                            {((talentDetail.tarifs as any)?.tarifPost ?? null) ? `${String((talentDetail.tarifs as any).tarifPost)}€` : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] opacity-75" style={{ color: OLD_ROSE }}>Reel</p>
                          <p className="text-sm font-medium" style={{ color: LICORICE }}>
                            {((talentDetail.tarifs as any)?.tarifReel ?? null) ? `${String((talentDetail.tarifs as any).tarifReel)}€` : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] opacity-75" style={{ color: OLD_ROSE }}>TikTok (vidéo)</p>
                          <p className="text-sm font-medium" style={{ color: LICORICE }}>
                            {((talentDetail.tarifs as any)?.tarifTiktokVideo ?? null) ? `${String((talentDetail.tarifs as any).tarifTiktokVideo)}€` : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] opacity-75" style={{ color: OLD_ROSE }}>YouTube (vidéo)</p>
                          <p className="text-sm font-medium" style={{ color: LICORICE }}>
                            {((talentDetail.tarifs as any)?.tarifYoutubeVideo ?? null) ? `${String((talentDetail.tarifs as any).tarifYoutubeVideo)}€` : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] opacity-75" style={{ color: OLD_ROSE }}>Shooting</p>
                          <p className="text-sm font-medium" style={{ color: LICORICE }}>
                            {((talentDetail.tarifs as any)?.tarifShooting ?? null) ? `${String((talentDetail.tarifs as any).tarifShooting)}€` : "—"}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Collaborations / Négociations (résumé) */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-xl border p-3" style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}>
                        <p className="text-sm font-semibold" style={{ color: LICORICE }}>Collaborations</p>
                        <p className="text-xs opacity-75" style={{ color: OLD_ROSE }}>
                          {(talentDetail.collaborations?.length ?? 0)} total
                        </p>
                        <div className="mt-2 space-y-1">
                          {(talentDetail.collaborations ?? []).slice(0, 3).map((c) => (
                            <div key={c.id} className="text-xs" style={{ color: LICORICE }}>
                              <span className="font-medium">{c.marque?.nom ?? "Marque"}</span>
                              {c.createdAt ? ` — ${new Date(c.createdAt).toLocaleDateString("fr-FR")}` : ""}
                            </div>
                          ))}
                          {(talentDetail.collaborations ?? []).length === 0 && (
                            <p className="text-xs opacity-60">—</p>
                          )}
                        </div>
                      </div>
                      <div className="rounded-xl border p-3" style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}>
                        <p className="text-sm font-semibold" style={{ color: LICORICE }}>Négociations</p>
                        <p className="text-xs opacity-75" style={{ color: OLD_ROSE }}>
                          {(talentDetail.negociations?.length ?? 0)} total
                        </p>
                        <div className="mt-2 space-y-1">
                          {(talentDetail.negociations ?? []).slice(0, 3).map((n) => (
                            <div key={n.id} className="text-xs" style={{ color: LICORICE }}>
                              <span className="font-medium">{n.marque?.nom ?? "Marque"}</span>
                              {n.createdAt ? ` — ${new Date(n.createdAt).toLocaleDateString("fr-FR")}` : ""}
                            </div>
                          ))}
                          {(talentDetail.negociations ?? []).length === 0 && (
                            <p className="text-xs opacity-60">—</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Infos brutes (JSON) - replié */}
                    <details className="rounded-xl border p-3" open={false}>
                      <summary className="text-sm font-medium cursor-pointer" style={{ color: LICORICE }}>
                        Infos brutes (toutes les données)
                      </summary>
                      <div className="mt-2">
                        <div className="max-h-64 overflow-auto border rounded-lg">
                          <table className="w-full text-left">
                            <tbody>
                              {rawTalentEntries.length === 0 ? (
                                <tr>
                                  <td className="p-3 text-xs opacity-70" style={{ color: LICORICE }}>
                                    —
                                  </td>
                                </tr>
                              ) : (
                                rawTalentEntries.map((e, idx) => (
                                  <tr key={`${e.path}-${idx}`} className="border-t">
                                    <td
                                      className="p-2 align-top font-mono text-[11px] text-slate-700 break-all"
                                      style={{ width: "52%" }}
                                    >
                                      {e.path}
                                    </td>
                                    <td
                                      className="p-2 align-top font-mono text-[11px] text-slate-900 break-all"
                                    >
                                      {e.value}
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </details>
                  </div>
                )}

                {!talentDetailLoading && !talentDetailError && !talentDetail && (
                  <p className="text-sm" style={{ color: OLD_ROSE }}>
                    Impossible d’afficher la fiche pour le moment.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
