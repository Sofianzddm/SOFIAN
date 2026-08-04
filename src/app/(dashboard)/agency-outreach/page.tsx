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
  RotateCcw,
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
  Sparkles,
  CalendarClock,
} from "lucide-react";
import {
  normalizeEditorHtmlForEmail,
  plainTextToEmailHtml,
} from "@/lib/email-body-html";
import { businessDeadlineWithJitter } from "@/lib/business-days";
import {
  ImportAgencyModal,
  type AgencyImportResult,
} from "@/components/agency-outreach/ImportAgencyModal";

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
type Market = "FR" | "BENELUX";

type TouchSummary = {
  id: string;
  cycleNumber: number;
  subject: string;
  sentAt: string | null;
  relanceSentAt: string | null;
  relanceCancelledAt: string | null;
  relanceScheduledAt: string | null;
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
    mode: "now" | "staggered" | "at";
    /** Mode « at » : heure murale de Paris (valeur d'un input datetime-local). */
    scheduledAt?: string;
    /** Override date de relance (datetime-local Paris). Vide = auto J+3. */
    relanceScheduledAt?: string;
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
  // Toujours affiché en heure de Paris (les instants sont stockés en UTC).
  return new Date(value).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });
}

/**
 * Valeur pour un input `datetime-local` correspondant à l'heure MURALE de Paris
 * de `date` (indépendamment du fuseau du navigateur). Format « YYYY-MM-DDTHH:mm ».
 */
function toParisDatetimeLocal(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const m: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") m[p.type] = p.value;
  const hour = m.hour === "24" ? "00" : m.hour;
  return `${m.year}-${m.month}-${m.day}T${hour}:${m.minute}`;
}

/**
 * Statut de la relance J+3 ouvré d'un touch, pour affichage dans la liste :
 *  - "scheduled" : relance auto à venir (override manuel ou formule J+3)
 *  - "sent"      : relance déjà envoyée
 *  - "cancelled" : relance annulée (pause manuelle)
 *  - null        : pas de relance pertinente (pas d'envoi, ou réponse reçue)
 */
function relanceInfo(
  touch: TouchSummary | undefined
): { state: "scheduled" | "sent" | "cancelled"; at: string; dueAt: Date | null } | null {
  if (!touch || !touch.sentAt) return null;
  if (touch.repliedAt) return null;
  if (touch.relanceSentAt) return { state: "sent", at: fmtDateTime(touch.relanceSentAt), dueAt: null };
  if (touch.relanceCancelledAt) return { state: "cancelled", at: "", dueAt: null };
  const due = touch.relanceScheduledAt
    ? new Date(touch.relanceScheduledAt)
    : businessDeadlineWithJitter(new Date(touch.sentAt), RELANCE_BUSINESS_DAYS, touch.id);
  return { state: "scheduled", at: fmtDateTime(due), dueAt: due };
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
  // Marché actif : FR (agences françaises) ou BENELUX (agences belges / Benelux).
  // Filtre la liste et sert de valeur par défaut aux ajouts / imports.
  const [market, setMarket] = useState<Market>("FR");
  const [searchTerm, setSearchTerm] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Composer
  const [composerOpen, setComposerOpen] = useState(false);
  const [templates, setTemplates] = useState<AgencyTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [subject, setSubject] = useState("");
  const [language, setLanguage] = useState<"fr" | "en">("fr");
  // Mode d'envoi : "now" = tout part maintenant ; "staggered" = étalé jusqu'à
  // 18h30 ; "at" = programmé à une heure précise choisie (heure de Paris).
  const [sendMode, setSendMode] = useState<"now" | "staggered" | "at">("now");
  // Heure d'envoi choisie (mode "at"), au format datetime-local, heure de Paris.
  const [scheduledAt, setScheduledAt] = useState<string>("");
  // Date de relance choisie à l'envoi (datetime-local Paris). Vide = auto J+3.
  const [relanceAtSend, setRelanceAtSend] = useState<string>("");
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
    market: "FR" as Market,
  });
  // Génération IA du mail (composer).
  const [isGenerating, setIsGenerating] = useState(false);
  // Édition inline de la date de relance (targetId en cours + valeur datetime-local Paris).
  const [editingRelanceId, setEditingRelanceId] = useState<string | null>(null);
  const [editingRelanceAt, setEditingRelanceAt] = useState("");
  const [savingRelance, setSavingRelance] = useState(false);
  // Reprogrammation groupée de la relance pour la sélection.
  const [bulkRelanceOpen, setBulkRelanceOpen] = useState(false);
  const [bulkRelanceAt, setBulkRelanceAt] = useState("");
  const [savingBulkRelance, setSavingBulkRelance] = useState(false);

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
      const res = await fetch(`/api/agency-outreach/targets?market=${market}`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Chargement impossible");
      setTargets(Array.isArray(data.targets) ? data.targets : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setLoading(false);
    }
  }, [market]);

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

  // Restaure le dernier marché choisi (persisté entre sessions).
  useEffect(() => {
    const saved =
      typeof window !== "undefined"
        ? window.localStorage.getItem("agency-outreach.market")
        : null;
    if (saved === "BENELUX" || saved === "FR") {
      setMarket(saved);
      setNewContact((p) => ({ ...p, market: saved }));
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("agency-outreach.market", market);
    }
  }, [market]);

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

  /** Contacts sélectionnés dont la relance auto est encore reprogrammable. */
  const selectedRelanceEditable = useMemo(
    () =>
      selectedTargets.filter((t) => {
        if (t.status !== "WAITING") return false;
        const touch = t.touches[0];
        return Boolean(touch?.sentAt) && !touch?.relanceSentAt && !touch?.repliedAt;
      }),
    [selectedTargets]
  );

  const openComposer = () => {
    if (selectedTargets.length === 0) {
      showToast("err", "Sélectionne au moins un contact d'agence.");
      return;
    }
    setSubject("");
    setTemplateId("");
    editor?.commands.setContent("<p></p>");
    // « Langue de rédaction » = langue dans laquelle ON ÉCRIT (pas celle du
    // client). On part toujours du français : les contacts EN reçoivent alors
    // une traduction auto. (Ne pas caler sur la langue du contact, sinon un mail
    // écrit en FR pour un contact EN serait considéré « déjà en anglais » et
    // partirait sans traduction.)
    setLanguage("fr");
    setSendMode("now");
    setScheduledAt("");
    setRelanceAtSend("");
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

  const runGenerateEmail = async () => {
    if (!editor) return;
    if (selectedTargets.length === 0) {
      showToast("err", "Sélectionne au moins un contact d'agence.");
      return;
    }
    // Envoi groupé avec jetons par destinataire : on laisse l'IA utiliser
    // {{ contact.firstname }} et {{ agence.nom }}. On ne fige le nom de l'agence
    // que si tous les destinataires appartiennent à la même agence.
    const distinctCompanies = Array.from(
      new Set(selectedTargets.map((t) => (t.company || "").trim()).filter(Boolean))
    );
    const agencyName = distinctCompanies.length === 1 ? distinctCompanies[0] : "";
    setIsGenerating(true);
    try {
      const res = await fetch("/api/agency-outreach/generate-email", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, market, agencyName }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        subject?: string;
        body?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Génération impossible.");
      }
      setSubject(typeof data.subject === "string" ? data.subject : "");
      const html = plainTextToEmailHtml(typeof data.body === "string" ? data.body : "") || "<p></p>";
      editor.commands.setContent(html);
      setBodyTick((n) => n + 1);
      showToast("ok", "Email généré automatiquement ✨ — à toi de l'ajuster");
    } catch (e) {
      showToast("err", e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setIsGenerating(false);
    }
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
    if (sendMode === "at" && !scheduledAt) {
      showToast("err", "Choisissez une date et une heure d'envoi.");
      return;
    }
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
          scheduledAt: sendMode === "at" ? scheduledAt : undefined,
          relanceScheduledAt: relanceAtSend.trim() || undefined,
          force,
        },
        (p) => setProgress(p)
      );
      const parts: string[] = [];
      if (sendMode !== "now") {
        parts.push(`${result.scheduled} mail(s) programmé(s)`);
        if (result.firstScheduledAt) {
          parts.push(`à partir de ${fmtDateTime(result.firstScheduledAt)}`);
        }
      } else {
        parts.push(`${result.sent} mail(s) envoyé(s)`);
      }
      if (result.translated > 0) parts.push(`${result.translated} traduit(s)`);
      if (result.failed.length > 0) parts.push(`${result.failed.length} échec(s)`);
      if (result.needsConfirmation.length > 0)
        parts.push(`${result.needsConfirmation.length} mis en attente (déjà contacté)`);
      showToast(result.failed.length > 0 ? "err" : "ok", parts.join(" · "));

      if (result.needsConfirmation.length > 0 && !force) {
        // Ces contacts ont été mis en attente automatiquement côté serveur
        // (déjà contactés < 45j hors app). La modale informe et permet de
        // forcer l'envoi quand même si besoin.
        const ids = new Set(result.needsConfirmation.map((n) => n.targetId));
        const confirmTargets = targets.filter((t) => ids.has(t.id));
        setPendingConfirm({ targets: confirmTargets, details: result.needsConfirmation });
        // On rafraîchit : les envoyés partent et les « déjà contactés » basculent en attente.
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

  const onToContact = async (t: Target) => {
    try {
      await patchTarget(t.id, { action: "to-contact" });
      showToast("ok", `${t.firstname} remis dans « À contacter ».`);
      await loadTargets();
    } catch (e) {
      showToast("err", e instanceof Error ? e.message : "Erreur");
    }
  };

  const onToContactSelected = async () => {
    const list = selectedTargets.filter(
      (t) => t.status === "WAITING" || t.status === "TO_RECONTACT" || t.status === "STOPPED"
    );
    if (list.length === 0) return;
    try {
      for (const t of list) {
        await patchTarget(t.id, { action: "to-contact" });
      }
      showToast(
        "ok",
        `${list.length} contact${list.length > 1 ? "s" : ""} remis dans « À contacter ».`
      );
      setSelected(new Set());
      setActiveTab("TO_CONTACT");
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

  const startEditRelance = (t: Target, dueAt: Date) => {
    setEditingRelanceId(t.id);
    setEditingRelanceAt(toParisDatetimeLocal(dueAt));
  };

  const onSaveRelanceDate = async (t: Target) => {
    if (!editingRelanceAt.trim()) {
      showToast("err", "Indiquez une date de relance.");
      return;
    }
    setSavingRelance(true);
    try {
      const res = await fetch(`/api/agency-outreach/targets/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reschedule-relance",
          relanceScheduledAt: editingRelanceAt,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Reprogrammation impossible");
      showToast("ok", "Date de relance mise à jour.");
      setEditingRelanceId(null);
      setEditingRelanceAt("");
      await loadTargets();
    } catch (e) {
      showToast("err", e instanceof Error ? e.message : "Erreur");
    } finally {
      setSavingRelance(false);
    }
  };

  const openBulkRelance = () => {
    if (selectedRelanceEditable.length === 0) {
      showToast(
        "err",
        "Aucun contact sélectionné avec une relance encore à programmer (En attente, mail envoyé, pas encore relancé)."
      );
      return;
    }
    // Défaut : demain 10h00 (heure de Paris).
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const paris = toParisDatetimeLocal(tomorrow);
    const [d] = paris.split("T");
    setBulkRelanceAt(`${d}T10:00`);
    setBulkRelanceOpen(true);
    setEditingRelanceId(null);
  };

  const onSaveBulkRelanceDate = async () => {
    if (!bulkRelanceAt.trim()) {
      showToast("err", "Indiquez une date de relance.");
      return;
    }
    const ids = selectedRelanceEditable.map((t) => t.id);
    if (ids.length === 0) {
      showToast("err", "Aucun contact éligible dans la sélection.");
      return;
    }
    setSavingBulkRelance(true);
    try {
      const res = await fetch("/api/agency-outreach/reschedule-relance-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetIds: ids,
          relanceScheduledAt: bulkRelanceAt,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Reprogrammation impossible");
      const updated = Number(data.updated || 0);
      const skipped = Array.isArray(data.skipped) ? data.skipped.length : 0;
      showToast(
        "ok",
        skipped > 0
          ? `Date de relance mise à jour pour ${updated} contact${updated > 1 ? "s" : ""} (${skipped} ignoré${skipped > 1 ? "s" : ""}).`
          : `Date de relance mise à jour pour ${updated} contact${updated > 1 ? "s" : ""}.`
      );
      setBulkRelanceOpen(false);
      setBulkRelanceAt("");
      setSelected(new Set());
      await loadTargets();
    } catch (e) {
      showToast("err", e instanceof Error ? e.message : "Erreur");
    } finally {
      setSavingBulkRelance(false);
    }
  };

  const addExistingContact = async (contactId: string) => {
    setAddBusyId(contactId);
    try {
      const res = await fetch("/api/agency-outreach/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyContactId: contactId, market }),
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
      setNewContact({ partnerName: "", prenom: "", nom: "", email: "", poste: "", language: "fr", market });
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
          {/* Bascule marché : FR ↔ BENELUX (agences françaises vs belges/Benelux) */}
          <div
            className="inline-flex rounded-lg overflow-hidden border shrink-0"
            style={{ borderColor: "#E5E0DA" }}
            title="Basculer entre les agences françaises et Benelux"
          >
            {(["FR", "BENELUX"] as const).map((m) => {
              const active = market === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMarket(m);
                    setSelected(new Set());
                    setNewContact((p) => ({ ...p, market: m }));
                  }}
                  className="px-3 py-2 text-sm font-semibold transition"
                  style={
                    active
                      ? { backgroundColor: LICORICE, color: "white" }
                      : { backgroundColor: "white", color: "#9CA3AF" }
                  }
                >
                  {m === "FR" ? "🇫🇷 France" : "🇧🇪 BENELUX"}
                </button>
              );
            })}
          </div>
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
          {selectedRelanceEditable.length > 0 &&
            activeTab === "WAITING" &&
            (bulkRelanceOpen ? (
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 bg-amber-50"
                style={{ borderColor: "#F0C674" }}
              >
                <CalendarClock className="w-4 h-4 shrink-0" style={{ color: "#8A5A00" }} />
                <input
                  type="datetime-local"
                  value={bulkRelanceAt}
                  onChange={(e) => setBulkRelanceAt(e.target.value)}
                  className="rounded border border-amber-300 bg-white px-2 py-1 text-sm text-amber-900"
                  disabled={savingBulkRelance}
                />
                <button
                  type="button"
                  onClick={() => void onSaveBulkRelanceDate()}
                  disabled={savingBulkRelance}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg disabled:opacity-50"
                  style={{ backgroundColor: TEA_GREEN, color: LICORICE }}
                >
                  {savingBulkRelance ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  Appliquer ({selectedRelanceEditable.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBulkRelanceOpen(false);
                    setBulkRelanceAt("");
                  }}
                  disabled={savingBulkRelance}
                  className="p-1.5 rounded-lg hover:bg-amber-100 disabled:opacity-50"
                  title="Annuler"
                >
                  <X className="w-4 h-4" style={{ color: LICORICE }} />
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={openBulkRelance}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl border-2"
                style={{ borderColor: "#F0C674", color: "#8A5A00" }}
                title="Changer la date de relance pour toute la sélection"
              >
                <CalendarClock className="w-4 h-4" />
                Date relance ({selectedRelanceEditable.length})
              </button>
            ))}
          {selectedTargets.length > 0 &&
            (activeTab === "WAITING" ||
              activeTab === "TO_RECONTACT" ||
              activeTab === "STOPPED") && (
              <button
                type="button"
                onClick={() => void onToContactSelected()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl border-2"
                style={{ borderColor: "#3D8B40", color: "#2F6B32" }}
                title="Remettre la sélection dans « À contacter »"
              >
                <RotateCcw className="w-4 h-4" />
                À contacter ({selectedTargets.length})
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
                          {relance?.state === "scheduled" && editingRelanceId !== t.id && (
                            <span
                              className="inline-flex items-center gap-1 text-amber-700"
                              title="Relance automatique prévue — utilise le bouton calendrier pour changer la date"
                            >
                              <MessageSquareReply className="w-3.5 h-3.5" />
                              Relance {relance.at}
                            </span>
                          )}
                          {relance?.state === "scheduled" && editingRelanceId === t.id && (
                            <span className="inline-flex items-center gap-1.5 text-amber-700 flex-wrap">
                              <CalendarClock className="w-3.5 h-3.5 shrink-0" />
                              <input
                                type="datetime-local"
                                value={editingRelanceAt}
                                onChange={(e) => setEditingRelanceAt(e.target.value)}
                                className="rounded border border-amber-300 bg-white px-1.5 py-0.5 text-xs text-amber-900"
                                disabled={savingRelance}
                              />
                              <button
                                type="button"
                                onClick={() => void onSaveRelanceDate(t)}
                                disabled={savingRelance}
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold border border-amber-400 bg-amber-50 hover:bg-amber-100 disabled:opacity-50"
                                title="Enregistrer la date"
                              >
                                {savingRelance ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                )}
                                OK
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingRelanceId(null);
                                  setEditingRelanceAt("");
                                }}
                                disabled={savingRelance}
                                className="rounded-lg px-1.5 py-1 hover:bg-amber-100 disabled:opacity-50"
                                title="Annuler"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
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
                          {(t.status === "WAITING" ||
                            t.status === "TO_RECONTACT" ||
                            t.status === "STOPPED") && (
                            <button
                              type="button"
                              onClick={() => void onToContact(t)}
                              className="p-1.5 rounded-lg hover:bg-black/5"
                              title="Remettre dans À contacter"
                            >
                              <RotateCcw className="w-4 h-4" style={{ color: "#3D8B40" }} />
                            </button>
                          )}
                          {t.status === "WAITING" &&
                            touch &&
                            !touch.relanceSentAt &&
                            !touch.repliedAt &&
                            !touch.relanceCancelledAt &&
                            editingRelanceId !== t.id && (
                              <button
                                type="button"
                                onClick={() => {
                                  const due =
                                    relance?.dueAt ||
                                    (touch.sentAt
                                      ? businessDeadlineWithJitter(
                                          new Date(touch.sentAt),
                                          RELANCE_BUSINESS_DAYS,
                                          touch.id
                                        )
                                      : null);
                                  if (due) startEditRelance(t, due);
                                }}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border hover:bg-amber-50"
                                style={{ borderColor: "#F0C674", color: "#8A5A00" }}
                                title="Changer la date de relance"
                              >
                                <CalendarClock className="w-3.5 h-3.5" />
                                Date relance
                              </button>
                            )}
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
                  Langue dans laquelle <strong>tu écris</strong>. Les contacts d&apos;une autre
                  langue reçoivent une traduction auto.
                </p>
                {(() => {
                  const toTranslate = selectedTargets.filter(
                    (t) => (t.language === "en" ? "en" : "fr") !== language
                  ).length;
                  if (toTranslate === 0) return null;
                  return (
                    <p className="text-[11px] mt-1 font-medium text-amber-700">
                      {toTranslate} contact{toTranslate > 1 ? "s" : ""} recevront une traduction
                      auto en {language === "fr" ? "anglais" : "français"}.
                    </p>
                  );
                })()}
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
                      <span className="text-sm px-1 self-center select-none" style={{ color: OLD_ROSE }}>|</span>
                      <button
                        type="button"
                        onClick={runGenerateEmail}
                        disabled={isGenerating}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium disabled:opacity-50"
                        style={{ backgroundColor: OLD_ROSE, color: "white" }}
                        title={
                          market === "BENELUX"
                            ? "Rédige un mail de prospection agence (présentation de nos créateurs benelux, agence FR développant le Benelux)"
                            : "Rédige un mail de prospection agence (présentation de nos créateurs)"
                        }
                      >
                        {isGenerating ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                            Rédaction en cours…
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5" />
                            Rédiger automatiquement
                          </>
                        )}
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
                  <button
                    type="button"
                    onClick={() => {
                      setSendMode("at");
                      if (!scheduledAt) {
                        // Défaut : dans 1h, arrondi, en heure de Paris.
                        const d = new Date(Date.now() + 60 * 60 * 1000);
                        d.setMinutes(0, 0, 0);
                        setScheduledAt(toParisDatetimeLocal(d));
                      }
                    }}
                    className="text-left rounded-xl border-2 px-3 py-2"
                    style={{
                      borderColor: sendMode === "at" ? TEA_GREEN : `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)`,
                      backgroundColor: sendMode === "at" ? `color-mix(in srgb, ${TEA_GREEN} 25%, white)` : "transparent",
                    }}
                  >
                    <span className="block text-sm font-semibold" style={{ color: LICORICE }}>
                      À une heure précise
                    </span>
                    <span className="block text-[11px] opacity-70" style={{ color: LICORICE }}>
                      Tu choisis la date et l'heure (heure FR).
                    </span>
                  </button>
                </div>

                {sendMode === "at" && (
                  <div className="pt-1">
                    <label className="block text-[11px] font-medium mb-1" style={{ color: LICORICE }}>
                      Date et heure d&apos;envoi (heure française)
                    </label>
                    <input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      className="w-full rounded-xl border px-3 py-2 text-sm"
                      style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 45%, transparent)`, color: LICORICE }}
                    />
                    <p className="text-[11px] opacity-70 mt-1" style={{ color: LICORICE }}>
                      Les mails sont légèrement étalés (~1/min) à partir de cette heure.
                    </p>
                  </div>
                )}
              </div>

              {/* Date de relance (optionnelle) — appliquée à tous les destinataires */}
              <div
                className="rounded-xl border p-3 space-y-2"
                style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium" style={{ color: LICORICE }}>
                    Date de relance
                  </p>
                  {relanceAtSend ? (
                    <button
                      type="button"
                      onClick={() => setRelanceAtSend("")}
                      className="text-[11px] underline opacity-70"
                      style={{ color: LICORICE }}
                    >
                      Auto J+3
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        // Défaut : demain 10h00 (heure de Paris).
                        const tomorrow = new Date();
                        tomorrow.setDate(tomorrow.getDate() + 1);
                        const paris = toParisDatetimeLocal(tomorrow);
                        const [d] = paris.split("T");
                        setRelanceAtSend(`${d}T10:00`);
                      }}
                      className="text-[11px] underline opacity-70"
                      style={{ color: LICORICE }}
                    >
                      Choisir une date
                    </button>
                  )}
                </div>
                {relanceAtSend ? (
                  <>
                    <input
                      type="datetime-local"
                      value={relanceAtSend}
                      onChange={(e) => setRelanceAtSend(e.target.value)}
                      className="w-full rounded-xl border px-3 py-2 text-sm"
                      style={{
                        borderColor: `color-mix(in srgb, ${OLD_ROSE} 45%, transparent)`,
                        color: LICORICE,
                      }}
                    />
                    <p className="text-[11px] opacity-70" style={{ color: LICORICE }}>
                      Même date pour tous les destinataires de cet envoi (heure française).
                    </p>
                  </>
                ) : (
                  <p className="text-[11px] opacity-70" style={{ color: LICORICE }}>
                    Relance auto à J+3 ouvrés après l&apos;envoi (comportement par défaut).
                  </p>
                )}
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
                {sendMode !== "now"
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
                {pendingConfirm.targets.length > 1 ? "s" : ""} mis en attente
                {" "}(déjà contacté{pendingConfirm.targets.length > 1 ? "s" : ""})
              </h2>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm" style={{ color: LICORICE }}>
                Ces contacts ont reçu un mail depuis la boîte d&apos;envoi il y a moins de
                45 jours, en dehors de la prospection agences. Ils ont été{" "}
                <strong>mis en attente automatiquement</strong> (recontact à J+45 après
                le dernier mail) et ne sont plus dans « À contacter ».
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
                OK, laisser en attente
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
                  <select
                    value={newContact.market}
                    onChange={(e) => setNewContact((p) => ({ ...p, market: e.target.value === "BENELUX" ? "BENELUX" : "FR" }))}
                    className="rounded-xl border px-3 py-2 text-sm bg-white"
                    style={{ borderColor: OLD_ROSE, color: LICORICE }}
                    title="Marché de l'agence"
                  >
                    <option value="FR">🇫🇷 France</option>
                    <option value="BENELUX">🇧🇪 BENELUX</option>
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
          market={market}
          onClose={() => setImportOpen(false)}
          onError={(m) => showToast("err", m)}
          onImported={(r: AgencyImportResult) => {
            const parts = [
              r.linked > 0 ? `${r.linked} rattaché(s) à la fiche` : null,
              `${r.created} contact(s) importé(s)`,
              r.addedToCycle > 0 ? `${r.addedToCycle} ajouté(s) au cycle` : null,
              r.queued > 0 ? `${r.queued} en enrichissement` : null,
              r.skipped > 0 ? `${r.skipped} ignoré(s)` : null,
            ].filter(Boolean);
            showToast("ok", `${r.company} : ${parts.join(", ")}.`);
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
