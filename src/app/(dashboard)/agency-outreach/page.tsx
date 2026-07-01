"use client";

/**
 * Module Prospection Agences — cycle de contact agences 45 jours.
 *
 * Distinct du module Outreach (marques) : cible les AGENCES partenaires
 * (référencées dans /partners). Files : À contacter → En attente (mail envoyé,
 * relance auto J+3, compteur 45j) → À recontacter (J+45 écoulés) → boucle.
 * Le mail peut contenir le token {{agence.lien}} → lien talent book /partners.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapUnderline from "@tiptap/extension-underline";
import TiptapLink from "@tiptap/extension-link";
import {
  Loader2,
  Plus,
  Repeat,
  X,
  Clock,
  Eye,
  MousePointerClick,
  CheckCircle2,
  Send,
  StopCircle,
  PlayCircle,
  Trash2,
  MessageSquareReply,
  Search,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Link as LinkIcon,
  Building2,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  BookmarkPlus,
} from "lucide-react";
import { normalizeEditorHtmlForEmail } from "@/lib/email-body-html";
import { businessDeadlineWithJitter } from "@/lib/business-days";

// Doit rester aligné avec AGENCY_OUTREACH_RELANCE_BUSINESS_DAYS côté serveur.
// (Constante dupliquée ici pour éviter d'importer le moteur d'envoi serveur
// — qui tire prisma/gmail — dans ce composant client.)
const RELANCE_BUSINESS_DAYS = 3;

const LICORICE = "#1A1110";
const OLD_ROSE = "#C08B8B";
const TEA_GREEN = "#C8F285";
const OLD_LACE = "#F5EBE0";

const ALLOWED = ["ADMIN", "HEAD_OF_SALES"];

type TargetStatus = "TO_CONTACT" | "WAITING" | "TO_RECONTACT" | "STOPPED";

type TouchSummary = {
  id: string;
  cycleNumber: number;
  subject: string;
  sentAt: string | null;
  relanceSentAt: string | null;
  relanceCancelledAt: string | null;
  repliedAt: string | null;
  openCount: number;
  openedAt: string | null;
  lastOpenAt: string | null;
  clickCount: number;
  clickedAt: string | null;
  lastClickAt: string | null;
  sendError: string | null;
};

type Target = {
  id: string;
  partnerId: string;
  firstname: string;
  lastname: string | null;
  email: string;
  company: string;
  partnerSlug: string | null;
  language: string;
  fromEmail: string | null;
  status: TargetStatus;
  cycleCount: number;
  lastSentAt: string | null;
  nextRecontactAt: string | null;
  scheduledSendAt: string | null;
  lastRepliedAt: string | null;
  autoRescheduleReason: string | null;
  createdAt: string;
  touches: TouchSummary[];
};

type PartnerContact = {
  id: string;
  prenom: string;
  nom: string | null;
  email: string;
  poste: string | null;
  language: string;
  principal: boolean;
};

type PartnerRow = {
  id: string;
  name: string;
  slug: string;
  contactName: string | null;
  contactEmail: string | null;
  agencyContacts: PartnerContact[];
};

type AgencyTemplate = {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
};

const TABS: { id: TargetStatus; label: string }[] = [
  { id: "TO_CONTACT", label: "À contacter" },
  { id: "WAITING", label: "En attente" },
  { id: "TO_RECONTACT", label: "À recontacter" },
  { id: "STOPPED", label: "Stoppés" },
];

const TOKENS: { token: string; label: string; hint: string }[] = [
  { token: "{{ contact.firstname }}", label: "PRÉNOM", hint: "Prénom du contact agence" },
  { token: "{{contact.lastname}}", label: "NOM", hint: "Nom du contact agence" },
  { token: "{{ agence.nom }}", label: "AGENCE", hint: "Nom de l'agence" },
  { token: "{{ agence.lien }}", label: "LIEN AGENCE", hint: "Lien talent book /partners/{slug}" },
  { token: "{{ owner.firstname }}", label: "MOI", hint: "Prénom de l'expéditrice (Leyna)" },
];

function baseOrigin(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return "https://app.glowupagence.fr";
}

function partnerLink(slug: string | null): string {
  const s = (slug || "").trim();
  return s ? `${baseOrigin()}/partners/${s}` : "";
}

/** Substitution client (preview) alignée sur applyAgencyTemplateVars serveur. */
function applyVarsPreview(
  text: string,
  vars: { firstname: string; lastname: string; company: string; link: string }
): string {
  let s = text || "";
  s = s.replace(/\{\{\s*contact\.firstname\s*\}\}/gi, vars.firstname.trim() || "—");
  s = s.replace(/\{\{\s*contact\.lastname\s*\}\}/gi, vars.lastname.trim());
  s = s.replace(/\{\{\s*agence\.nom\s*\}\}/gi, vars.company.trim() || "—");
  s = s.replace(/\{\{\s*owner\.firstname\s*\}\}/gi, "Leyna");
  if (vars.link) {
    s = s.replace(/href=(["'])\{\{\s*agence\.lien\s*\}\}\1/gi, `href=$1${vars.link}$1`);
    s = s.replace(/\{\{\s*agence\.lien\s*\}\}/gi, `<a href="${vars.link}">${vars.link}</a>`);
  } else {
    s = s.replace(/\{\{\s*agence\.lien\s*\}\}/gi, "");
  }
  return s;
}

type BulkSendResult = {
  sent: number;
  scheduled: number;
  firstScheduledAt: string | null;
  lastScheduledAt: string | null;
  failed: { email: string; error: string }[];
  needsConfirmation: {
    targetId: string;
    email: string;
    message: string;
    suggestedNextRecontactAt?: string;
  }[];
  translated: number;
  translationFailed: "en" | "fr" | null;
};

async function sendBulkStreaming(
  payload: {
    targetIds: string[];
    subject: string;
    bodyHtml: string;
    sourceLanguage: "fr" | "en";
    mode: "now" | "staggered";
    force?: boolean;
  },
  onProgress: (p: { done: number; total: number; label: string }) => void
): Promise<BulkSendResult> {
  const res = await fetch("/api/agency-outreach/send-bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, stream: true }),
  });

  const contentType = res.headers.get("Content-Type") || "";
  if (!res.body || !contentType.includes("ndjson")) {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Erreur d'envoi");
    return data as BulkSendResult;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: BulkSendResult | null = null;

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(trimmed);
    } catch {
      return;
    }
    if (event.type === "progress") {
      onProgress({
        done: Number(event.done) || 0,
        total: Number(event.total) || 0,
        label: String(event.label || ""),
      });
    } else if (event.type === "result") {
      result = event as unknown as BulkSendResult;
    } else if (event.type === "error") {
      throw new Error(String(event.error || "Erreur d'envoi"));
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nlIndex: number;
    while ((nlIndex = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nlIndex);
      buffer = buffer.slice(nlIndex + 1);
      handleLine(line);
    }
  }
  if (buffer) handleLine(buffer);
  if (!result) throw new Error("Réponse d'envoi incomplète.");
  return result;
}

function fmtDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(value: Date | string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Statut de la relance J+3 ouvré d'un touch, pour affichage dans la liste :
 *  - "scheduled" : relance auto à venir (date prévue calculée comme le cron)
 *  - "sent"      : relance déjà envoyée
 *  - "cancelled" : relance annulée (pause manuelle)
 *  - null        : pas de relance pertinente (pas d'envoi, ou réponse reçue)
 */
function relanceInfo(
  touch: TouchSummary | undefined
): { state: "scheduled" | "sent" | "cancelled"; at: string } | null {
  if (!touch || !touch.sentAt) return null;
  if (touch.repliedAt) return null;
  if (touch.relanceSentAt) return { state: "sent", at: fmtDateTime(touch.relanceSentAt) };
  if (touch.relanceCancelledAt) return { state: "cancelled", at: "" };
  const due = businessDeadlineWithJitter(
    new Date(touch.sentAt),
    RELANCE_BUSINESS_DAYS,
    touch.id
  );
  return { state: "scheduled", at: fmtDateTime(due) };
}

type ImportRow = {
  prenom: string;
  nom: string;
  poste: string;
  email: string;
  language?: "fr" | "en";
};

/** Normalise une valeur de cellule « Langue » vers "fr" | "en" (ou undefined). */
function parseLanguageValue(raw: string): "fr" | "en" | undefined {
  const v = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  if (!v) return undefined;
  if (v.startsWith("en") || v.startsWith("an") || v.startsWith("uk") || v.startsWith("us")) return "en";
  if (v.startsWith("fr")) return "fr";
  return undefined;
}

/** Valeur de cellule ExcelJS → texte (gère liens mailto, texte riche, formules). */
function excelCellToText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.replace(/[\t\r\n]+/g, " ").trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.hyperlink === "string") {
      return o.hyperlink.startsWith("mailto:") ? o.hyperlink.slice(7) : o.hyperlink;
    }
    if (Array.isArray(o.richText)) {
      return (o.richText as { text?: string }[]).map((r) => r.text || "").join("").trim();
    }
    if (o.text != null) return excelCellToText(o.text);
    if (o.result != null) return excelCellToText(o.result);
  }
  return "";
}

/** Lit un fichier (.xlsx via ExcelJS, sinon .csv/.tsv) → texte tabulé. */
async function importFileToText(file: File): Promise<string> {
  if (/\.xlsx$/i.test(file.name)) {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new Error("Le fichier Excel ne contient aucune feuille.");
    const lines: string[] = [];
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      const values = row.values as unknown[];
      const cells: string[] = [];
      for (let col = 1; col < Math.max(values.length, 2); col++) {
        cells.push(excelCellToText(values[col]));
      }
      lines.push(cells.join("\t"));
    });
    return lines.join("\n");
  }
  if (/\.(xls|numbers)$/i.test(file.name)) {
    throw new Error("Format non géré — enregistre en .xlsx ou .csv et réessaie.");
  }
  return file.text();
}

/** Parse un tableau collé (TSV) ou CSV : détecte Prénom/Nom + email/poste. */
function parseImportText(text: string): {
  rows: ImportRow[];
  suggestedAgency: string;
  error: string | null;
} {
  const lines = text.split(/\r?\n/);
  const splitLine = (line: string): string[] =>
    line.includes("\t") ? line.split("\t") : line.split(";");
  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  let headerIdx = -1;
  let cols: Record<string, number> = {};
  for (let i = 0; i < lines.length; i++) {
    const cells = splitLine(lines[i]).map(norm);
    const prenomIdx = cells.findIndex((c) => c === "prenom" || c === "firstname" || c === "first name");
    const nomIdx = cells.findIndex((c) => c === "nom" || c === "lastname" || c === "last name");
    if (prenomIdx >= 0 && nomIdx >= 0) {
      headerIdx = i;
      cols = { prenom: prenomIdx, nom: nomIdx };
      cells.forEach((c, idx) => {
        if (c.includes("role") || c === "poste" || c === "titre" || c === "fonction") cols.poste = idx;
        else if (c.includes("mail")) cols.email = idx;
        else if (c === "langue" || c === "language" || c === "lang" || c.startsWith("langue")) cols.language = idx;
      });
      break;
    }
  }

  if (headerIdx === -1) {
    return {
      rows: [],
      suggestedAgency: "",
      error:
        "Impossible de trouver la ligne d'en-tête (colonnes « Prénom » et « Nom »). Garde les titres de colonnes.",
    };
  }

  let suggestedAgency = "";
  for (let i = 0; i < headerIdx; i++) {
    const first = splitLine(lines[i])[0]?.trim();
    if (first) {
      suggestedAgency = first.split(/—|–|-{2,}/)[0].trim();
      break;
    }
  }

  const cell = (cells: string[], key: string): string =>
    cols[key] !== undefined ? (cells[cols[key]] || "").trim() : "";

  const rows: ImportRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    const prenom = cell(cells, "prenom");
    const nom = cell(cells, "nom");
    if (!prenom && !nom) continue;
    rows.push({
      prenom,
      nom,
      poste: cell(cells, "poste"),
      email: cell(cells, "email"),
      language: parseLanguageValue(cell(cells, "language")),
    });
  }

  return {
    rows,
    suggestedAgency,
    error: rows.length === 0 ? "Aucun contact trouvé sous la ligne d'en-tête." : null,
  };
}

export default function AgencyOutreachPage() {
  const { data: session, status: sessionStatus } = useSession();
  const role = session?.user?.role || "";
  const allowed = ALLOWED.includes(role);

  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const [activeTab, setActiveTab] = useState<TargetStatus>("TO_CONTACT");
  const [searchTerm, setSearchTerm] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Composer
  const [composerOpen, setComposerOpen] = useState(false);
  const [templates, setTemplates] = useState<AgencyTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [subject, setSubject] = useState("");
  const [language, setLanguage] = useState<"fr" | "en">("fr");
  // Mode d'envoi : "now" = tout part maintenant ; "staggered" = étalé jusqu'à 18h30.
  const [sendMode, setSendMode] = useState<"now" | "staggered">("now");
  const [previewMode, setPreviewMode] = useState<"edit" | "preview">("edit");
  const [lastField, setLastField] = useState<"subject" | "body">("body");
  const [bodyTick, setBodyTick] = useState(0);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(
    null
  );
  // Confirmation « déjà contacté < 45j » : modale intégrée (remplace window.confirm,
  // que le navigateur peut bloquer via « empêcher d'autres boîtes de dialogue »).
  const [pendingConfirm, setPendingConfirm] = useState<{
    targets: Target[];
    details: BulkSendResult["needsConfirmation"];
  } | null>(null);

  // Ajout / import
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [trackedEmails, setTrackedEmails] = useState<string[]>([]);
  const [partnersLoading, setPartnersLoading] = useState(false);
  const [addBusyId, setAddBusyId] = useState<string | null>(null);
  const [newContact, setNewContact] = useState({
    partnerName: "",
    prenom: "",
    nom: "",
    email: "",
    poste: "",
    language: "fr" as "fr" | "en",
  });

  const showToast = useCallback((kind: "ok" | "err", msg: string) => {
    setToast({ kind, msg });
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TiptapUnderline,
      TiptapLink.configure({ openOnClick: false }),
    ],
    content: "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none min-h-[220px] px-3 py-2 text-sm focus:outline-none",
        style: `font-family: Switzer, system-ui, sans-serif; color: ${LICORICE}; white-space: pre-wrap`,
      },
      handleDOMEvents: {
        focus: () => {
          setLastField("body");
          return false;
        },
      },
    },
    onUpdate: () => setBodyTick((n) => n + 1),
  });

  const loadTargets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agency-outreach/targets", { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Chargement impossible");
      setTargets(Array.isArray(data.targets) ? data.targets : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPartners = useCallback(async () => {
    setPartnersLoading(true);
    try {
      const res = await fetch("/api/agency-outreach/partners", { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Chargement impossible");
      setPartners(Array.isArray(data.partners) ? data.partners : []);
      setTrackedEmails(
        Array.isArray(data.trackedEmails) ? data.trackedEmails.map((e: string) => e.toLowerCase()) : []
      );
    } catch (e) {
      showToast("err", e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setPartnersLoading(false);
    }
  }, [showToast]);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/mailer/templates?scope=agency", { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      setTemplates(Array.isArray(data.templates) ? data.templates : []);
    } catch {
      /* non bloquant */
    }
  }, []);

  useEffect(() => {
    if (sessionStatus === "authenticated" && allowed) {
      loadTargets();
      loadTemplates();
    }
  }, [sessionStatus, allowed, loadTargets, loadTemplates]);

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    if (!id) return;
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    setSubject(tpl.subject || "");
    editor?.commands.setContent(tpl.bodyHtml || "<p></p>");
    setBodyTick((n) => n + 1);
  };

  const saveTemplate = async () => {
    const sub = subject.trim();
    const body = editor ? editor.getHTML() : "";
    if (!sub && (!body || body === "<p></p>")) {
      showToast("err", "Rédige un objet ou un corps avant d'enregistrer un modèle.");
      return;
    }
    const name = window.prompt("Nom du modèle ?");
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed) {
      showToast("err", "Nom du modèle requis.");
      return;
    }
    setSavingTemplate(true);
    try {
      const res = await fetch("/api/mailer/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          scope: "agency",
          name: trimmed,
          subject: sub,
          bodyHtml: body,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Enregistrement impossible");
      showToast("ok", "Modèle enregistré.");
      await loadTemplates();
      if (data.template?.id) setTemplateId(data.template.id);
    } catch (e) {
      showToast("err", e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setSavingTemplate(false);
    }
  };

  const deleteTemplate = async () => {
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) {
      showToast("err", "Sélectionne d'abord un modèle.");
      return;
    }
    if (!window.confirm(`Supprimer le modèle « ${tpl.name} » ?`)) return;
    try {
      const res = await fetch(`/api/mailer/templates?id=${encodeURIComponent(tpl.id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Suppression impossible");
      }
      showToast("ok", "Modèle supprimé.");
      setTemplateId("");
      await loadTemplates();
    } catch (e) {
      showToast("err", e instanceof Error ? e.message : "Erreur réseau");
    }
  };

  const counts = useMemo(() => {
    const c: Record<TargetStatus, number> = {
      TO_CONTACT: 0,
      WAITING: 0,
      TO_RECONTACT: 0,
      STOPPED: 0,
    };
    for (const t of targets) c[t.status] += 1;
    return c;
  }, [targets]);

  const visibleTargets = useMemo(
    () => targets.filter((t) => t.status === activeTab),
    [targets, activeTab]
  );

  // Regroupement par agence (partnerId).
  const groups = useMemo(() => {
    const map = new Map<string, { partnerId: string; company: string; slug: string | null; targets: Target[] }>();
    for (const t of visibleTargets) {
      const g = map.get(t.partnerId);
      if (g) g.targets.push(t);
      else
        map.set(t.partnerId, {
          partnerId: t.partnerId,
          company: t.company,
          slug: t.partnerSlug,
          targets: [t],
        });
    }
    let arr = Array.from(map.values());
    const q = searchTerm.trim().toLowerCase();
    if (q) {
      arr = arr.filter(
        (g) =>
          g.company.toLowerCase().includes(q) ||
          g.targets.some(
            (t) =>
              `${t.firstname} ${t.lastname || ""}`.toLowerCase().includes(q) ||
              t.email.toLowerCase().includes(q)
          )
      );
    }
    return arr.sort((a, b) => a.company.localeCompare(b.company));
  }, [visibleTargets, searchTerm]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectGroup = (g: { targets: Target[] }, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const t of g.targets) {
        if (on) next.add(t.id);
        else next.delete(t.id);
      }
      return next;
    });
  };

  const selectedTargets = useMemo(
    () => targets.filter((t) => selected.has(t.id)),
    [targets, selected]
  );

  const openComposer = () => {
    if (selectedTargets.length === 0) {
      showToast("err", "Sélectionne au moins un contact d'agence.");
      return;
    }
    setSubject("");
    setTemplateId("");
    editor?.commands.setContent("<p></p>");
    setLanguage(selectedTargets[0]?.language === "en" ? "en" : "fr");
    setPreviewMode("edit");
    setLastField("body");
    setProgress(null);
    setComposerOpen(true);
  };

  const insertToken = (token: string) => {
    if (lastField === "subject") {
      setSubject((prev) => `${prev}${token}`);
      return;
    }
    editor?.chain().focus().insertContent(token).run();
  };

  const setLink = () => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL du lien", prev || "https://");
    if (url === null) return;
    const trimmed = url.trim();
    if (!trimmed) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: trimmed }).run();
  };

  const previewVars = useMemo(() => {
    const t = selectedTargets[0];
    return {
      firstname: t?.firstname || "",
      lastname: t?.lastname || "",
      company: t?.company || "",
      link: partnerLink(t?.partnerSlug || null),
    };
  }, [selectedTargets]);

  const previewBody = useMemo(() => {
    if (!editor) return "";
    void bodyTick;
    return applyVarsPreview(editor.getHTML(), previewVars);
  }, [editor, bodyTick, previewVars]);

  const doSend = async (force = false, overrideTargets?: Target[]) => {
    const recipients = overrideTargets ?? selectedTargets;
    const sub = subject.trim();
    const body = editor ? normalizeEditorHtmlForEmail(editor.getHTML()) : "";
    if (!sub || !body || body === "<p></p>") {
      showToast("err", "Objet et corps du mail requis.");
      return;
    }
    if (recipients.length === 0) return;
    setSending(true);
    setProgress({ done: 0, total: recipients.length, label: "Préparation…" });
    try {
      const result = await sendBulkStreaming(
        {
          targetIds: recipients.map((t) => t.id),
          subject: sub,
          bodyHtml: body,
          sourceLanguage: language,
          mode: sendMode,
          force,
        },
        (p) => setProgress(p)
      );
      const parts: string[] = [];
      if (sendMode === "staggered") {
        parts.push(`${result.scheduled} mail(s) programmé(s)`);
        if (result.lastScheduledAt) {
          parts.push(`dernier vers ${fmtDateTime(result.lastScheduledAt)}`);
        }
      } else {
        parts.push(`${result.sent} mail(s) envoyé(s)`);
      }
      if (result.translated > 0) parts.push(`${result.translated} traduit(s)`);
      if (result.failed.length > 0) parts.push(`${result.failed.length} échec(s)`);
      if (result.needsConfirmation.length > 0)
        parts.push(`${result.needsConfirmation.length} à confirmer`);
      showToast(result.failed.length > 0 ? "err" : "ok", parts.join(" · "));

      if (result.needsConfirmation.length > 0 && !force) {
        // Confirmation via modale intégrée (fiable) au lieu de window.confirm.
        const ids = new Set(result.needsConfirmation.map((n) => n.targetId));
        const confirmTargets = targets.filter((t) => ids.has(t.id));
        setPendingConfirm({ targets: confirmTargets, details: result.needsConfirmation });
        // On rafraîchit ceux déjà partis ; le composer reste ouvert pour la suite.
        await loadTargets();
        return;
      }

      setComposerOpen(false);
      setSelected(new Set());
      await loadTargets();
    } catch (e) {
      showToast("err", e instanceof Error ? e.message : "Erreur d'envoi");
    } finally {
      setSending(false);
      setProgress(null);
    }
  };

  const patchTarget = async (id: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/agency-outreach/targets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Action impossible");
    return data;
  };

  const onStop = async (t: Target) => {
    try {
      await patchTarget(t.id, { action: "stop" });
      showToast("ok", "Contact stoppé.");
      await loadTargets();
    } catch (e) {
      showToast("err", e instanceof Error ? e.message : "Erreur");
    }
  };

  const onResume = async (t: Target) => {
    try {
      await patchTarget(t.id, { action: "resume" });
      showToast("ok", "Contact réactivé.");
      await loadTargets();
    } catch (e) {
      showToast("err", e instanceof Error ? e.message : "Erreur");
    }
  };

  const onDelete = async (t: Target) => {
    if (role !== "ADMIN") return;
    if (!window.confirm(`Supprimer ${t.firstname} (${t.company}) du cycle ?`)) return;
    try {
      const res = await fetch(`/api/agency-outreach/targets/${t.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Suppression impossible");
      showToast("ok", "Supprimé.");
      await loadTargets();
    } catch (e) {
      showToast("err", e instanceof Error ? e.message : "Erreur");
    }
  };

  const onRelanceNow = async (t: Target) => {
    try {
      const res = await fetch(`/api/agency-outreach/targets/${t.id}/relance-now`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Relance impossible");
      showToast("ok", "Relance envoyée.");
      await loadTargets();
    } catch (e) {
      showToast("err", e instanceof Error ? e.message : "Erreur");
    }
  };

  const addExistingContact = async (contactId: string) => {
    setAddBusyId(contactId);
    try {
      const res = await fetch("/api/agency-outreach/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyContactId: contactId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Ajout impossible");
      showToast("ok", "Contact ajouté au cycle.");
      await Promise.all([loadTargets(), loadPartners()]);
    } catch (e) {
      showToast("err", e instanceof Error ? e.message : "Erreur");
    } finally {
      setAddBusyId(null);
    }
  };

  const addNewContact = async () => {
    if (!newContact.partnerName.trim() || !newContact.prenom.trim() || !newContact.email.trim()) {
      showToast("err", "Agence, prénom et email sont obligatoires.");
      return;
    }
    setAddBusyId("new");
    try {
      const res = await fetch("/api/agency-outreach/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newContact),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Ajout impossible");
      showToast("ok", "Contact créé et ajouté au cycle.");
      setNewContact({ partnerName: "", prenom: "", nom: "", email: "", poste: "", language: "fr" });
      await Promise.all([loadTargets(), loadPartners()]);
    } catch (e) {
      showToast("err", e instanceof Error ? e.message : "Erreur");
    } finally {
      setAddBusyId(null);
    }
  };

  if (sessionStatus === "loading") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: OLD_ROSE }} />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="p-8">
        <p className="text-sm" style={{ color: LICORICE }}>
          Accès réservé aux administrateurs et casting managers.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto" style={{ fontFamily: "Switzer, system-ui, sans-serif" }}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1
            className="text-2xl font-semibold flex items-center gap-2"
            style={{ fontFamily: "Spectral, serif", color: LICORICE }}
          >
            <Repeat className="w-6 h-6" style={{ color: OLD_ROSE }} />
            Prospection Agences
          </h1>
          <p className="text-sm mt-1 opacity-80" style={{ color: LICORICE }}>
            Cycle de contact des agences partenaires tous les 45 jours, personnalisé et groupé.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedTargets.length > 0 && activeTab !== "STOPPED" && (
            <button
              type="button"
              onClick={openComposer}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl"
              style={{ backgroundColor: TEA_GREEN, color: LICORICE }}
            >
              <Send className="w-4 h-4" />
              Rédiger ({selectedTargets.length})
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setImportOpen(true);
              loadPartners();
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-xl border-2"
            style={{ borderColor: "#3D8B40", color: "#2F6B32" }}
          >
            <FileSpreadsheet className="w-4 h-4" />
            Importer un Excel
          </button>
          <button
            type="button"
            onClick={() => {
              setAddOpen(true);
              loadPartners();
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-xl border-2"
            style={{ borderColor: OLD_ROSE, color: LICORICE }}
          >
            <Plus className="w-4 h-4" />
            Ajouter une agence
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border"
            style={{
              backgroundColor: activeTab === tab.id ? TEA_GREEN : "white",
              borderColor: activeTab === tab.id ? TEA_GREEN : `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)`,
              color: LICORICE,
            }}
          >
            {tab.label}
            <span className="text-xs opacity-70">{counts[tab.id]}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: OLD_ROSE }} />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Rechercher une agence, un contact…"
          className="w-full rounded-xl border pl-9 pr-3 py-2 text-sm bg-white"
          style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)`, color: LICORICE }}
        />
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {loading ? (
        <div className="flex items-center gap-2 text-sm" style={{ color: OLD_ROSE }}>
          <Loader2 className="w-4 h-4 animate-spin" />
          Chargement…
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border p-8 text-center bg-white" style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}>
          <Building2 className="w-8 h-8 mx-auto mb-2 opacity-50" style={{ color: OLD_ROSE }} />
          <p className="text-sm" style={{ color: LICORICE }}>
            Aucune agence dans cette file.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => {
            const allSelected = g.targets.every((t) => selected.has(t.id));
            return (
              <div
                key={g.partnerId}
                className="rounded-xl border bg-white overflow-hidden"
                style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}
              >
                <div
                  className="flex items-center justify-between gap-3 px-4 py-3 border-b"
                  style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 20%, transparent)`, backgroundColor: OLD_LACE }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {activeTab !== "STOPPED" && (
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={(e) => selectGroup(g, e.target.checked)}
                        className="w-4 h-4 accent-[#C08B8B]"
                      />
                    )}
                    <Building2 className="w-4 h-4 shrink-0" style={{ color: OLD_ROSE }} />
                    <p className="font-semibold truncate" style={{ color: LICORICE }}>
                      {g.company}
                    </p>
                    <span className="text-xs opacity-70" style={{ color: LICORICE }}>
                      {g.targets.length} contact{g.targets.length > 1 ? "s" : ""}
                    </span>
                  </div>
                  {g.slug && (
                    <a
                      href={partnerLink(g.slug)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border"
                      style={{ borderColor: OLD_ROSE, color: OLD_ROSE }}
                      title="Voir le talent book"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Talent book
                    </a>
                  )}
                </div>

                <div className="divide-y" style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 12%, transparent)` }}>
                  {g.targets.map((t) => {
                    const touch = t.touches[0];
                    const relance = relanceInfo(touch);
                    return (
                      <div key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                        {activeTab !== "STOPPED" && (
                          <input
                            type="checkbox"
                            checked={selected.has(t.id)}
                            onChange={() => toggleSelect(t.id)}
                            className="w-4 h-4 accent-[#C08B8B]"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate" style={{ color: LICORICE }}>
                            {t.firstname} {t.lastname || ""}
                            {t.language === "en" && (
                              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">EN</span>
                            )}
                          </p>
                          <p className="text-xs opacity-70 truncate" style={{ color: LICORICE }}>
                            {t.email}
                          </p>
                          {t.autoRescheduleReason && (
                            <p className="text-[11px] mt-0.5 text-amber-700">{t.autoRescheduleReason}</p>
                          )}
                        </div>

                        {/* Suivi du dernier mail */}
                        <div className="flex items-center gap-3 text-xs" style={{ color: LICORICE }}>
                          {t.scheduledSendAt && (
                            <span
                              className="inline-flex items-center gap-1 text-amber-700"
                              title="Envoi décalé programmé"
                            >
                              <Clock className="w-3.5 h-3.5" />
                              Envoi {fmtDateTime(t.scheduledSendAt)}
                            </span>
                          )}
                          {touch?.repliedAt && (
                            <span className="inline-flex items-center gap-1 text-emerald-600" title="A répondu">
                              <MessageSquareReply className="w-3.5 h-3.5" />
                              Répondu
                            </span>
                          )}
                          {touch && (
                            <>
                              <span className="inline-flex items-center gap-1" title="Ouvertures">
                                <Eye className="w-3.5 h-3.5" style={{ color: OLD_ROSE }} />
                                {touch.openCount}
                              </span>
                              <span className="inline-flex items-center gap-1" title="Clics">
                                <MousePointerClick className="w-3.5 h-3.5" style={{ color: OLD_ROSE }} />
                                {touch.clickCount}
                              </span>
                            </>
                          )}
                          {relance?.state === "scheduled" && (
                            <span
                              className="inline-flex items-center gap-1 text-amber-700"
                              title="Relance automatique J+3 ouvré prévue"
                            >
                              <MessageSquareReply className="w-3.5 h-3.5" />
                              Relance {relance.at}
                            </span>
                          )}
                          {relance?.state === "sent" && (
                            <span className="inline-flex items-center gap-1 opacity-70" title="Relance envoyée">
                              <MessageSquareReply className="w-3.5 h-3.5" />
                              Relancé {relance.at}
                            </span>
                          )}
                          {t.status === "WAITING" && (
                            <span className="opacity-70" title="Prochain recontact">
                              Recontact {fmtDate(t.nextRecontactAt)}
                            </span>
                          )}
                          {t.cycleCount > 0 && (
                            <span className="opacity-60">Cycle {t.cycleCount}</span>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5">
                          {t.status === "WAITING" && touch && !touch.relanceSentAt && !touch.repliedAt && (
                            <button
                              type="button"
                              onClick={() => onRelanceNow(t)}
                              className="p-1.5 rounded-lg hover:bg-black/5"
                              title="Relancer maintenant"
                            >
                              <MessageSquareReply className="w-4 h-4" style={{ color: OLD_ROSE }} />
                            </button>
                          )}
                          {t.status === "STOPPED" ? (
                            <button
                              type="button"
                              onClick={() => onResume(t)}
                              className="p-1.5 rounded-lg hover:bg-black/5"
                              title="Réactiver"
                            >
                              <PlayCircle className="w-4 h-4 text-emerald-600" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onStop(t)}
                              className="p-1.5 rounded-lg hover:bg-black/5"
                              title="Stopper"
                            >
                              <StopCircle className="w-4 h-4 text-red-500" />
                            </button>
                          )}
                          {role === "ADMIN" && (
                            <button
                              type="button"
                              onClick={() => onDelete(t)}
                              className="p-1.5 rounded-lg hover:bg-black/5"
                              title="Supprimer"
                            >
                              <Trash2 className="w-4 h-4 text-red-400" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Composer modal */}
      {composerOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 bg-black/45 overflow-y-auto">
          <div
            className="w-full max-w-3xl rounded-2xl shadow-xl border bg-white my-4"
            style={{ borderColor: "#E8DED0" }}
          >
            <div
              className="flex items-center justify-between px-5 py-3 border-b"
              style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)`, backgroundColor: OLD_LACE }}
            >
              <h2 className="text-lg font-semibold" style={{ fontFamily: "Spectral, serif", color: LICORICE }}>
                Rédiger — {selectedTargets.length} contact{selectedTargets.length > 1 ? "s" : ""}
              </h2>
              <button type="button" onClick={() => setComposerOpen(false)} className="p-2 rounded-lg hover:bg-black/5">
                <X className="w-5 h-5" style={{ color: LICORICE }} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Destinataires */}
              <div className="flex flex-wrap gap-1.5">
                {selectedTargets.slice(0, 12).map((t) => (
                  <span
                    key={t.id}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full"
                    style={{ backgroundColor: TEA_GREEN, color: LICORICE }}
                    title={`${t.email} — ${t.company}`}
                  >
                    {t.firstname} ({t.company})
                  </span>
                ))}
                {selectedTargets.length > 12 && (
                  <span className="text-xs opacity-70" style={{ color: LICORICE }}>
                    +{selectedTargets.length - 12}
                  </span>
                )}
              </div>

              {/* Modèles */}
              <div
                className="rounded-xl border p-2.5"
                style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}
              >
                <p
                  className="text-[10px] uppercase tracking-wide mb-1.5 flex items-center gap-1.5"
                  style={{ color: OLD_ROSE }}
                >
                  <FileText className="w-3.5 h-3.5" /> Modèles
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={templateId}
                    onChange={(e) => applyTemplate(e.target.value)}
                    className="flex-1 min-w-[180px] rounded-xl border px-3 py-2 text-sm bg-white"
                    style={{ borderColor: OLD_ROSE, color: LICORICE }}
                  >
                    <option value="">— Charger un modèle —</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={saveTemplate}
                    disabled={savingTemplate}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border-2 font-semibold disabled:opacity-60"
                    style={{
                      borderColor: TEA_GREEN,
                      backgroundColor: `color-mix(in srgb, ${TEA_GREEN} 35%, white)`,
                      color: LICORICE,
                    }}
                    title="Enregistrer l'objet et le corps actuels comme modèle"
                  >
                    {savingTemplate ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <BookmarkPlus className="w-3.5 h-3.5" />
                    )}
                    Enregistrer
                  </button>
                  <button
                    type="button"
                    onClick={deleteTemplate}
                    disabled={!templateId}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border font-medium disabled:opacity-40"
                    style={{ borderColor: OLD_ROSE, color: LICORICE }}
                    title="Supprimer le modèle sélectionné"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Langue */}
              <div className="w-40">
                <label className="block text-xs font-medium mb-1" style={{ color: LICORICE }}>
                  Langue de rédaction
                </label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value === "en" ? "en" : "fr")}
                  className="w-full rounded-xl border px-3 py-2 text-sm bg-white"
                  style={{ borderColor: OLD_ROSE, color: LICORICE }}
                >
                  <option value="fr">Français</option>
                  <option value="en">English</option>
                </select>
                <p className="text-[10px] mt-1 opacity-70" style={{ color: OLD_ROSE }}>
                  Les contacts d&apos;une autre langue reçoivent une traduction auto.
                </p>
              </div>

              {/* Objet */}
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: LICORICE }}>
                  Objet <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  onFocusCapture={() => setLastField("subject")}
                  onFocus={() => setLastField("subject")}
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                  style={{ borderColor: OLD_ROSE, color: LICORICE }}
                  placeholder="Objet du mail…"
                />
              </div>

              {/* Tokens */}
              <div className="rounded-xl border p-2.5" style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}>
                <p className="text-[10px] uppercase tracking-wide mb-1.5" style={{ color: OLD_ROSE }}>
                  Variables — clique pour insérer dans{" "}
                  <strong>{lastField === "subject" ? "l'objet" : "le corps"}</strong>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {TOKENS.map((v) => (
                    <button
                      key={v.token}
                      type="button"
                      onClick={() => insertToken(v.token)}
                      className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border-2 font-semibold"
                      style={{
                        borderColor: TEA_GREEN,
                        backgroundColor: `color-mix(in srgb, ${TEA_GREEN} 35%, white)`,
                        color: LICORICE,
                      }}
                      title={v.hint}
                    >
                      <span>+</span>
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggle edit/preview */}
              <div className="flex justify-end">
                <div className="inline-flex rounded-xl border p-0.5" style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 45%, transparent)` }}>
                  <button
                    type="button"
                    onClick={() => setPreviewMode("edit")}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ backgroundColor: previewMode === "edit" ? TEA_GREEN : "transparent", color: LICORICE }}
                  >
                    Éditer
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode("preview")}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ backgroundColor: previewMode === "preview" ? TEA_GREEN : "transparent", color: LICORICE }}
                  >
                    Aperçu
                  </button>
                </div>
              </div>

              {previewMode === "preview" ? (
                <div className="rounded-xl border p-4 bg-white" style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}>
                  <p className="text-[10px] uppercase mb-1 opacity-70" style={{ color: LICORICE }}>
                    Aperçu pour {selectedTargets[0]?.firstname} ({selectedTargets[0]?.company})
                  </p>
                  <p className="text-sm font-semibold mb-2" style={{ color: LICORICE }}>
                    {applyVarsPreview(subject, previewVars) || "—"}
                  </p>
                  <div
                    className="prose prose-sm max-w-none text-sm border-t pt-3"
                    style={{ color: LICORICE, whiteSpace: "pre-wrap" }}
                    dangerouslySetInnerHTML={{ __html: previewBody || "<p></p>" }}
                  />
                </div>
              ) : (
                <div className="rounded-xl border overflow-hidden bg-white" style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}>
                  {editor && (
                    <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 border-b" style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 25%, transparent)`, backgroundColor: OLD_LACE }}>
                      <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className="p-1.5 rounded hover:bg-white/80">
                        <Bold className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className="p-1.5 rounded hover:bg-white/80">
                        <Italic className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className="p-1.5 rounded hover:bg-white/80">
                        <UnderlineIcon className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className="p-1.5 rounded hover:bg-white/80">
                        <List className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className="p-1.5 rounded hover:bg-white/80">
                        <ListOrdered className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={setLink} className="p-1.5 rounded hover:bg-white/80">
                        <LinkIcon className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  <div onClick={() => setLastField("body")}>
                    <EditorContent editor={editor} />
                  </div>
                </div>
              )}

              {/* Mode d'envoi : maintenant (tout d'un coup) ou décalé (étalé) */}
              <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}>
                <p className="text-xs font-medium" style={{ color: LICORICE }}>
                  Quand envoyer ?
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSendMode("now")}
                    className="text-left rounded-xl border-2 px-3 py-2"
                    style={{
                      borderColor: sendMode === "now" ? TEA_GREEN : `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)`,
                      backgroundColor: sendMode === "now" ? `color-mix(in srgb, ${TEA_GREEN} 25%, white)` : "transparent",
                    }}
                  >
                    <span className="block text-sm font-semibold" style={{ color: LICORICE }}>
                      Maintenant
                    </span>
                    <span className="block text-[11px] opacity-70" style={{ color: LICORICE }}>
                      Tous les mails partent tout de suite.
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSendMode("staggered")}
                    className="text-left rounded-xl border-2 px-3 py-2"
                    style={{
                      borderColor: sendMode === "staggered" ? TEA_GREEN : `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)`,
                      backgroundColor: sendMode === "staggered" ? `color-mix(in srgb, ${TEA_GREEN} 25%, white)` : "transparent",
                    }}
                  >
                    <span className="block text-sm font-semibold" style={{ color: LICORICE }}>
                      En décalé
                    </span>
                    <span className="block text-[11px] opacity-70" style={{ color: LICORICE }}>
                      Étalés dans la journée, tous avant 18h30.
                    </span>
                  </button>
                </div>
              </div>

              {progress && (
                <div className="space-y-1">
                  <div className="h-2 rounded-full bg-black/10 overflow-hidden">
                    <div
                      className="h-full transition-all"
                      style={{
                        width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
                        backgroundColor: TEA_GREEN,
                      }}
                    />
                  </div>
                  <p className="text-xs opacity-70" style={{ color: LICORICE }}>{progress.label}</p>
                </div>
              )}
            </div>

            <div
              className="flex items-center justify-end gap-2 px-5 py-3 border-t"
              style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}
            >
              <button type="button" onClick={() => setComposerOpen(false)} disabled={sending} className="px-4 py-2 text-sm rounded-xl hover:bg-black/5" style={{ color: LICORICE }}>
                Annuler
              </button>
              <button
                type="button"
                onClick={() => doSend(false)}
                disabled={sending}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl disabled:opacity-60"
                style={{ backgroundColor: TEA_GREEN, color: LICORICE }}
              >
                {sending && <Loader2 className="w-4 h-4 animate-spin" />}
                <Send className="w-4 h-4" />
                {sendMode === "staggered"
                  ? `Programmer ${selectedTargets.length} envoi${selectedTargets.length > 1 ? "s" : ""}`
                  : `Envoyer à ${selectedTargets.length}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation « déjà contacté < 45j » (remplace window.confirm) */}
      {pendingConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50">
          <div
            className="w-full max-w-md rounded-2xl shadow-xl border bg-white"
            style={{ borderColor: "#E8DED0" }}
          >
            <div
              className="px-5 py-3 border-b"
              style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)`, backgroundColor: OLD_LACE }}
            >
              <h2
                className="text-lg font-semibold"
                style={{ fontFamily: "Spectral, serif", color: LICORICE }}
              >
                {pendingConfirm.targets.length} contact
                {pendingConfirm.targets.length > 1 ? "s" : ""} déjà contacté
                {pendingConfirm.targets.length > 1 ? "s" : ""} récemment
              </h2>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm" style={{ color: LICORICE }}>
                Ces contacts ont reçu un mail depuis la boîte d&apos;envoi il y a moins de
                45 jours, en dehors de la prospection agences.{" "}
                {sendMode === "staggered" ? "Programmer quand même ?" : "Envoyer quand même ?"}
              </p>
              <div
                className="rounded-xl border max-h-48 overflow-y-auto divide-y"
                style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 25%, transparent)` }}
              >
                {pendingConfirm.targets.map((t) => {
                  const detail = pendingConfirm.details.find((d) => d.targetId === t.id);
                  return (
                    <div key={t.id} className="px-3 py-2">
                      <p className="text-sm font-medium" style={{ color: LICORICE }}>
                        {t.firstname} {t.lastname || ""}{" "}
                        <span className="text-xs opacity-60">({t.company})</span>
                      </p>
                      {detail?.message && (
                        <p className="text-[11px] mt-0.5 text-amber-700">{detail.message}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div
              className="flex items-center justify-end gap-2 px-5 py-3 border-t"
              style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}
            >
              <button
                type="button"
                disabled={sending}
                onClick={() => {
                  setPendingConfirm(null);
                  setComposerOpen(false);
                  setSelected(new Set());
                  loadTargets();
                }}
                className="px-4 py-2 text-sm rounded-xl hover:bg-black/5 disabled:opacity-60"
                style={{ color: LICORICE }}
              >
                Pas maintenant
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={() => {
                  const list = pendingConfirm.targets;
                  setPendingConfirm(null);
                  doSend(true, list);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl disabled:opacity-60"
                style={{ backgroundColor: TEA_GREEN, color: LICORICE }}
              >
                {sending && <Loader2 className="w-4 h-4 animate-spin" />}
                <Send className="w-4 h-4" />
                {sendMode === "staggered"
                  ? `Programmer quand même (${pendingConfirm.targets.length})`
                  : `Envoyer quand même (${pendingConfirm.targets.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add modal */}
      {addOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 bg-black/45 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl shadow-xl border bg-white my-4" style={{ borderColor: "#E8DED0" }}>
            <div
              className="flex items-center justify-between px-5 py-3 border-b"
              style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)`, backgroundColor: OLD_LACE }}
            >
              <h2 className="text-lg font-semibold" style={{ fontFamily: "Spectral, serif", color: LICORICE }}>
                Ajouter une agence au cycle
              </h2>
              <button type="button" onClick={() => setAddOpen(false)} className="p-2 rounded-lg hover:bg-black/5">
                <X className="w-5 h-5" style={{ color: LICORICE }} />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Nouveau contact */}
              <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}>
                <p className="text-sm font-semibold" style={{ color: LICORICE }}>
                  Nouveau contact d&apos;agence
                </p>
                <div>
                  <input
                    type="text"
                    list="agency-outreach-partners"
                    value={newContact.partnerName}
                    onChange={(e) => setNewContact((p) => ({ ...p, partnerName: e.target.value }))}
                    placeholder="Nom de l'agence * (choisis-en une ou saisis-en une nouvelle)"
                    className="w-full rounded-xl border px-3 py-2 text-sm bg-white"
                    style={{ borderColor: OLD_ROSE, color: LICORICE }}
                  />
                  <datalist id="agency-outreach-partners">
                    {partners.map((p) => (
                      <option key={p.id} value={p.name} />
                    ))}
                  </datalist>
                  <p className="text-[10px] mt-1 opacity-70" style={{ color: OLD_ROSE }}>
                    Si l&apos;agence n&apos;existe pas encore, elle sera créée dans /partners (lien talent book généré).
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={newContact.prenom}
                    onChange={(e) => setNewContact((p) => ({ ...p, prenom: e.target.value }))}
                    placeholder="Prénom *"
                    className="rounded-xl border px-3 py-2 text-sm"
                    style={{ borderColor: OLD_ROSE, color: LICORICE }}
                  />
                  <input
                    type="text"
                    value={newContact.nom}
                    onChange={(e) => setNewContact((p) => ({ ...p, nom: e.target.value }))}
                    placeholder="Nom"
                    className="rounded-xl border px-3 py-2 text-sm"
                    style={{ borderColor: OLD_ROSE, color: LICORICE }}
                  />
                  <input
                    type="email"
                    value={newContact.email}
                    onChange={(e) => setNewContact((p) => ({ ...p, email: e.target.value }))}
                    placeholder="Email *"
                    className="rounded-xl border px-3 py-2 text-sm"
                    style={{ borderColor: OLD_ROSE, color: LICORICE }}
                  />
                  <input
                    type="text"
                    value={newContact.poste}
                    onChange={(e) => setNewContact((p) => ({ ...p, poste: e.target.value }))}
                    placeholder="Poste"
                    className="rounded-xl border px-3 py-2 text-sm"
                    style={{ borderColor: OLD_ROSE, color: LICORICE }}
                  />
                  <select
                    value={newContact.language}
                    onChange={(e) => setNewContact((p) => ({ ...p, language: e.target.value === "en" ? "en" : "fr" }))}
                    className="rounded-xl border px-3 py-2 text-sm bg-white"
                    style={{ borderColor: OLD_ROSE, color: LICORICE }}
                  >
                    <option value="fr">Français</option>
                    <option value="en">English</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={addNewContact}
                  disabled={addBusyId === "new"}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl disabled:opacity-60"
                  style={{ backgroundColor: TEA_GREEN, color: LICORICE }}
                >
                  {addBusyId === "new" && <Loader2 className="w-4 h-4 animate-spin" />}
                  <Plus className="w-4 h-4" />
                  Créer et ajouter
                </button>
              </div>

              {/* Contacts existants par agence */}
              <div>
                <p className="text-sm font-semibold mb-2" style={{ color: LICORICE }}>
                  Contacts existants des agences
                </p>
                {partnersLoading ? (
                  <div className="flex items-center gap-2 text-sm" style={{ color: OLD_ROSE }}>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Chargement…
                  </div>
                ) : (
                  <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                    {partners
                      .filter((p) => p.agencyContacts.length > 0)
                      .map((p) => (
                        <div key={p.id}>
                          <p className="text-xs font-semibold mb-1" style={{ color: OLD_ROSE }}>{p.name}</p>
                          <div className="space-y-1">
                            {p.agencyContacts.map((c) => {
                              const tracked = trackedEmails.includes(c.email.toLowerCase());
                              return (
                                <div
                                  key={c.id}
                                  className="flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5"
                                  style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 25%, transparent)` }}
                                >
                                  <div className="min-w-0">
                                    <p className="text-sm truncate" style={{ color: LICORICE }}>
                                      {c.prenom} {c.nom || ""}{" "}
                                      <span className="text-xs opacity-60">{c.email}</span>
                                    </p>
                                  </div>
                                  {tracked ? (
                                    <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      Suivi
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => addExistingContact(c.id)}
                                      disabled={addBusyId === c.id}
                                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border disabled:opacity-60"
                                      style={{ borderColor: OLD_ROSE, color: LICORICE }}
                                    >
                                      {addBusyId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                                      Ajouter
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    {partners.filter((p) => p.agencyContacts.length > 0).length === 0 && (
                      <p className="text-xs opacity-70" style={{ color: LICORICE }}>
                        Aucun contact d&apos;agence enregistré. Ajoute-en un ci-dessus.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import Excel modal */}
      {importOpen && (
        <ImportAgencyModal
          partners={partners}
          onClose={() => setImportOpen(false)}
          onError={(m) => showToast("err", m)}
          onImported={(r) => {
            showToast(
              "ok",
              `${r.company} : ${r.created} contact(s) importé(s), ${r.addedToCycle} ajouté(s) au cycle${r.skipped ? `, ${r.skipped} ignoré(s)` : ""}.`
            );
            setImportOpen(false);
            loadTargets();
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-4 right-4 z-[200] px-4 py-2.5 rounded-xl shadow-lg text-sm"
          style={{
            backgroundColor: toast.kind === "ok" ? TEA_GREEN : "#FEE2E2",
            color: toast.kind === "ok" ? LICORICE : "#991B1B",
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function ImportAgencyModal({
  partners,
  onClose,
  onImported,
  onError,
}: {
  partners: PartnerRow[];
  onClose: () => void;
  onImported: (r: { company: string; created: number; skipped: number; addedToCycle: number }) => void;
  onError: (message: string) => void;
}) {
  const [rawText, setRawText] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [partnerName, setPartnerName] = useState("");
  const [language, setLanguage] = useState<"fr" | "en">("fr");
  // Override de langue par contact (index de ligne → langue), prioritaire sur le choix global.
  const [rowLangs, setRowLangs] = useState<Record<number, "fr" | "en">>({});
  const [saving, setSaving] = useState(false);

  const handleText = (text: string, sourceFileName?: string) => {
    setRawText(text);
    if (!text.trim()) {
      setRows([]);
      setRowLangs({});
      setParseError(null);
      return;
    }
    const result = parseImportText(text);
    setRows(result.rows);
    // Pré-remplit les overrides depuis la colonne « Langue » du fichier, si présente.
    const detected: Record<number, "fr" | "en"> = {};
    result.rows.forEach((r, i) => {
      if (r.language) detected[i] = r.language;
    });
    setRowLangs(detected);
    setParseError(result.error);
    const suggestion =
      result.suggestedAgency ||
      (sourceFileName ? sourceFileName.replace(/\.[^.]+$/, "").split(/—|–|_|-/)[0].trim() : "");
    if (suggestion && !partnerName.trim()) setPartnerName(suggestion);
  };

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return;
    setFileLoading(true);
    setParseError(null);
    try {
      const text = await importFileToText(file);
      setFileName(file.name);
      handleText(text, file.name);
    } catch (e) {
      setFileName(null);
      setParseError(e instanceof Error ? e.message : "Impossible de lire ce fichier.");
    } finally {
      setFileLoading(false);
    }
  };

  const withEmail = rows.filter((r) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email.trim()));
  const canSubmit = partnerName.trim().length > 0 && withEmail.length > 0 && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const rowsWithLang = rows.map((r, i) => ({
        ...r,
        language: rowLangs[i] ?? r.language ?? language,
      }));
      const res = await fetch("/api/agency-outreach/import-carto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerName: partnerName.trim(), language, rows: rowsWithLang }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erreur d'import");
      onImported({
        company: data.company,
        created: data.created,
        skipped: data.skipped,
        addedToCycle: data.addedToCycle || 0,
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : "Erreur d'import");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 bg-black/45 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl shadow-xl border bg-white my-4" style={{ borderColor: "#E8DED0" }}>
        <div
          className="flex items-center justify-between px-5 py-3 border-b"
          style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)`, backgroundColor: OLD_LACE }}
        >
          <h2 className="text-lg font-semibold flex items-center gap-2" style={{ fontFamily: "Spectral, serif", color: LICORICE }}>
            <FileSpreadsheet className="w-5 h-5" style={{ color: "#3D8B40" }} />
            Importer des contacts d&apos;agence
          </h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-black/5">
            <X className="w-5 h-5" style={{ color: LICORICE }} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs opacity-70" style={{ color: LICORICE }}>
            Glisse un fichier Excel (.xlsx) ou CSV avec au minimum les colonnes{" "}
            <strong>Prénom</strong>, <strong>Nom</strong> et <strong>Email</strong> (colonnes{" "}
            <strong>Poste</strong> et <strong>Langue</strong> — FR/EN — optionnelles). Les
            contacts avec un email valide entrent directement dans « À contacter ».
          </p>

          {/* Agence */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: LICORICE }}>
              Agence <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              list="agency-import-partners"
              value={partnerName}
              onChange={(e) => setPartnerName(e.target.value)}
              placeholder="Nom de l'agence (existante ou nouvelle)"
              className="w-full rounded-xl border px-3 py-2 text-sm bg-white"
              style={{ borderColor: OLD_ROSE, color: LICORICE }}
            />
            <datalist id="agency-import-partners">
              {partners.map((p) => (
                <option key={p.id} value={p.name} />
              ))}
            </datalist>
          </div>

          {/* Langue */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: LICORICE }}>
              Langue des contacts
            </label>
            <select
              value={language}
              onChange={(e) => {
                setLanguage(e.target.value === "en" ? "en" : "fr");
                // « Appliquer à tous » : on efface les choix individuels.
                setRowLangs({});
              }}
              className="w-40 rounded-xl border px-3 py-2 text-sm bg-white"
              style={{ borderColor: OLD_ROSE, color: LICORICE }}
            >
              <option value="fr">Tous en français</option>
              <option value="en">Tous en anglais</option>
            </select>
            <p className="text-xs opacity-60 mt-1" style={{ color: LICORICE }}>
              Langue par défaut, détectée automatiquement depuis la colonne{" "}
              <strong>Langue</strong> (FR/EN) du fichier si présente, et ajustable
              contact par contact ci-dessous. Les mails et relances auto sont traduits
              selon la langue de chaque contact.
            </p>
          </div>

          {/* Fichier */}
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFile(e.dataTransfer.files?.[0]);
            }}
            className="flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 cursor-pointer transition"
            style={{
              borderColor: dragOver ? "#3D8B40" : fileName ? TEA_GREEN : "#E5E0DA",
              backgroundColor: dragOver ? "#F2FAF2" : fileName ? "#F8FCEF" : "#FBF8F4",
            }}
          >
            <input
              type="file"
              accept=".xlsx,.csv,.tsv,.txt"
              className="hidden"
              onChange={(e) => {
                handleFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            {fileLoading ? (
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#3D8B40" }} />
            ) : (
              <FileSpreadsheet className="w-6 h-6" style={{ color: "#3D8B40" }} />
            )}
            <span className="text-sm font-semibold" style={{ color: LICORICE }}>
              {fileName || "Glisse le fichier ici, ou clique pour le choisir"}
            </span>
            <span className="text-xs opacity-60" style={{ color: LICORICE }}>
              Excel (.xlsx) ou CSV
            </span>
          </label>

          <details>
            <summary className="text-xs opacity-70 cursor-pointer select-none" style={{ color: LICORICE }}>
              …ou colle le tableau à la main
            </summary>
            <textarea
              value={rawText}
              onChange={(e) => {
                setFileName(null);
                handleText(e.target.value);
              }}
              placeholder={"Prénom\tNom\tPoste\tEmail\tLangue"}
              rows={5}
              className="w-full mt-2 px-3 py-2 rounded-xl border text-xs font-mono"
              style={{ borderColor: OLD_ROSE, color: LICORICE }}
            />
          </details>

          {parseError && <p className="text-xs text-red-600">{parseError}</p>}

          {rows.length > 0 && (
            <div className="rounded-xl border p-3 text-sm" style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}>
              <p style={{ color: LICORICE }}>
                <strong>{rows.length}</strong> ligne(s) détectée(s), dont{" "}
                <strong>{withEmail.length}</strong> avec un email valide (les autres seront ignorées).
              </p>
              <div className="mt-2 max-h-56 overflow-y-auto space-y-1">
                {rows.slice(0, 50).map((r, i) => {
                  const rowLang = rowLangs[i] ?? r.language ?? language;
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs" style={{ color: LICORICE }}>
                      <span className="font-medium shrink-0">
                        {r.prenom} {r.nom}
                      </span>
                      <span className="opacity-60 truncate">{r.poste}</span>
                      <span className="ml-auto opacity-60 shrink-0">{r.email || "(sans email)"}</span>
                      <span
                        className="inline-flex rounded-md overflow-hidden border shrink-0"
                        style={{ borderColor: "#E5E0DA" }}
                        title="Langue de ce contact (mail et relances auto traduits en conséquence)"
                      >
                        {(["fr", "en"] as const).map((lang) => {
                          const active = rowLang === lang;
                          return (
                            <button
                              key={lang}
                              type="button"
                              onClick={() => setRowLangs((prev) => ({ ...prev, [i]: lang }))}
                              className="px-1.5 py-0.5 text-[10px] font-bold uppercase transition"
                              style={
                                active
                                  ? { backgroundColor: LICORICE, color: "white" }
                                  : { backgroundColor: "white", color: "#9CA3AF" }
                              }
                            >
                              {lang === "fr" ? "🇫🇷" : "🇬🇧"} {lang}
                            </button>
                          );
                        })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t" style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}>
          <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 text-sm rounded-xl hover:bg-black/5" style={{ color: LICORICE }}>
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl disabled:opacity-50"
            style={{ backgroundColor: TEA_GREEN, color: LICORICE }}
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Importer {withEmail.length > 0 ? `(${withEmail.length})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
