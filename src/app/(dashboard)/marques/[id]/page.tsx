"use client";

/**
 * Fiche marque — layout « record page » SaaS moderne :
 * topbar breadcrumb + actions, identité, stat cards, puis panneau latéral
 * de détails (à propos, facturation, notes) et zone principale à onglets
 * (Activité 360°, Contacts avec carto + statut outreach, Collaborations).
 */

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Globe,
  MapPin,
  Mail,
  Phone,
  Calendar,
  Euro,
  Loader2,
  Handshake,
  Users,
  Copy,
  Check,
  Clock,
  Banknote,
  Activity,
  Linkedin,
  Plus,
  Repeat,
  Send,
  X,
  StickyNote,
  FileSpreadsheet,
  MessageSquareReply,
  Building2,
  ReceiptText,
  Star,
  Download,
} from "lucide-react";
import { MarqueCrmTab } from "./MarqueCrmTab";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type OutreachInfo = {
  id: string;
  status: "TO_CONTACT" | "WAITING" | "TO_RECONTACT" | "STOPPED";
  cycleCount: number;
  lastSentAt: string | null;
  nextRecontactAt: string | null;
  lastRepliedAt: string | null;
};

type Contact = {
  id: string;
  prenom?: string | null;
  nom: string;
  email: string | null;
  telephone: string | null;
  poste: string | null;
  principal: boolean;
  priorite?: string | null;
  perimetre?: string | null;
  localisation?: string | null;
  linkedinUrl?: string | null;
  source?: string | null;
  outreachTargets?: OutreachInfo[];
};

interface MarqueDetail {
  id: string;
  nom: string;
  secteur: string | null;
  siteWeb: string | null;
  notes: string | null;
  raisonSociale: string | null;
  formeJuridique: string | null;
  siret: string | null;
  numeroTVA: string | null;
  adresseRue: string | null;
  adresseComplement: string | null;
  codePostal: string | null;
  ville: string | null;
  pays: string | null;
  delaiPaiement: number | null;
  modePaiement: string | null;
  devise: string | null;
  createdAt: string;
  contacts: Contact[];
  cartoFiles?: {
    id: string;
    fileName: string;
    size: number;
    createdAt: string;
  }[];
  collaborations: {
    id: string;
    reference: string;
    typeContenu: string;
    montantBrut: number;
    statut: string;
    talent: { prenom: string; nom: string };
  }[];
  _count: { collaborations: number };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const INK = "#16110F";
const ROSE = "#C08B8B";

const COLLAB_STATUS_STYLE: Record<string, string> = {
  PAYE: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  NEGO: "bg-amber-50 text-amber-700 ring-amber-600/20",
  PERDU: "bg-red-50 text-red-600 ring-red-600/20",
};

function collabStatusClass(statut: string): string {
  return `${COLLAB_STATUS_STYLE[statut] || "bg-blue-50 text-blue-700 ring-blue-600/20"} ring-1 ring-inset`;
}

function prioriteStyle(priorite: string): string {
  const p = priorite.toUpperCase();
  if (p === "P1") return "bg-red-50 text-red-600 ring-red-600/20";
  if (p === "P2") return "bg-amber-50 text-amber-700 ring-amber-600/20";
  return "bg-gray-100 text-gray-500 ring-gray-500/10";
}

function initials(prenom: string | null | undefined, nom: string): string {
  return (((prenom || "").charAt(0) + (nom || "").charAt(0)) || nom.slice(0, 2)).toUpperCase();
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/* ------------------------------------------------------------------ */
/* Petits composants                                                   */
/* ------------------------------------------------------------------ */

function OutreachBadge({ info }: { info: OutreachInfo }) {
  const base = "inline-flex items-center gap-1 text-[11px] font-medium px-2 py-[3px] rounded-md ring-1 ring-inset";
  if (info.status === "WAITING") {
    const days = daysUntil(info.nextRecontactAt);
    return (
      <span className={`${base} bg-emerald-50 text-emerald-700 ring-emerald-600/20`}>
        <Repeat className="w-3 h-3" />
        En cycle{days !== null && days > 0 ? ` · J-${days}` : " · imminent"}
      </span>
    );
  }
  if (info.status === "TO_CONTACT") {
    return (
      <span className={`${base} bg-amber-50 text-amber-700 ring-amber-600/20`}>
        <Send className="w-3 h-3" />À contacter
      </span>
    );
  }
  if (info.status === "TO_RECONTACT") {
    return (
      <span className={`${base} bg-orange-50 text-orange-700 ring-orange-600/20`}>
        <Repeat className="w-3 h-3" />À recontacter
      </span>
    );
  }
  return <span className={`${base} bg-gray-100 text-gray-500 ring-gray-500/10`}>Stoppé</span>;
}

function SectionCard({
  title,
  icon: Icon,
  children,
  action,
}: {
  title: string;
  icon: typeof Globe;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white ring-1 ring-black/[0.06] shadow-[0_1px_2px_rgba(16,12,10,0.04)]">
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
        <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
          <Icon className="w-3.5 h-3.5" />
          {title}
        </h3>
        {action}
      </div>
      <div className="px-4 pb-4">{children}</div>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-[7px] border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400 shrink-0 pt-0.5">{label}</span>
      <span className={`text-[13px] text-right ${mono ? "font-mono" : ""}`} style={{ color: INK }}>
        {value}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function MarqueDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  // STRATEGY_PLANNER : fiche en lecture seule (accès depuis les projets
  // strategy type Ski Trip) — pas de modification/suppression ni de liens
  // vers des espaces auxquels le rôle n'a pas accès.
  const readOnly = (session?.user?.role || "") === "STRATEGY_PLANNER";
  // Lancer un contact dans le cycle Outreach est réservé aux rôles qui y ont
  // accès côté API (ADMIN / CASTING_MANAGER).
  const canOutreach = ["ADMIN", "CASTING_MANAGER"].includes(session?.user?.role || "");
  const [marque, setMarque] = useState<MarqueDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"activite" | "contacts" | "carto" | "collabs">("activite");
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [logoError, setLogoError] = useState(false);

  const [exporting, setExporting] = useState(false);

  // Ajout rapide d'un contact
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContact, setNewContact] = useState({
    prenom: "",
    nom: "",
    poste: "",
    email: "",
    telephone: "",
    linkedinUrl: "",
  });
  const [newContactLang, setNewContactLang] = useState<"fr" | "en" | null>(null);
  const [savingContact, setSavingContact] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  // Lancement d'un contact dans le cycle Outreach depuis la fiche marque
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState<{ id: string; message: string } | null>(null);

  // Suppression d'un contact depuis la fiche marque
  const [deletingContactId, setDeletingContactId] = useState<string | null>(null);

  const fetchMarque = useCallback(async () => {
    try {
      const res = await fetch(`/api/marques/${params.id}`);
      if (res.ok) setMarque(await res.json());
    } catch (error) {
      console.error("Erreur:", error);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    if (params.id) fetchMarque();
  }, [params.id, fetchMarque]);

  const handleDelete = async () => {
    if (!confirm("Supprimer cette marque ?")) return;
    try {
      await fetch(`/api/marques/${params.id}`, { method: "DELETE" });
      router.push("/marques");
    } catch {
      alert("Erreur lors de la suppression");
    }
  };

  const copyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    setCopiedEmail(email);
    setTimeout(() => setCopiedEmail(null), 2000);
  };

  const submitNewContact = async () => {
    if (savingContact) return;
    setContactError(null);
    setSavingContact(true);
    try {
      const res = await fetch(`/api/marques/${params.id}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newContact, language: newContactLang }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setNewContact({ prenom: "", nom: "", poste: "", email: "", telephone: "", linkedinUrl: "" });
      setNewContactLang(null);
      setShowAddContact(false);
      await fetchMarque();
    } catch (e) {
      setContactError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSavingContact(false);
    }
  };

  /** Supprime un contact de la marque. */
  const deleteContact = async (contact: Contact) => {
    if (deletingContactId) return;
    const fullName = [contact.prenom, contact.nom].filter(Boolean).join(" ") || "ce contact";
    if (!confirm(`Supprimer ${fullName} ?`)) return;
    setDeletingContactId(contact.id);
    try {
      const res = await fetch(
        `/api/marques/${params.id}/contacts?contactId=${encodeURIComponent(contact.id)}`,
        { method: "DELETE" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erreur lors de la suppression.");
      await fetchMarque();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erreur lors de la suppression.");
    } finally {
      setDeletingContactId(null);
    }
  };

  /** Envoie un contact (avec email) dans le cycle Outreach « À contacter ». */
  const launchOutreach = async (contact: Contact) => {
    if (launchingId || !contact.email) return;
    setLaunchError(null);
    setLaunchingId(contact.id);
    try {
      const res = await fetch("/api/outreach/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marqueContactId: contact.id, email: contact.email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Impossible de lancer le contact.");
      await fetchMarque();
    } catch (e) {
      setLaunchError({ id: contact.id, message: e instanceof Error ? e.message : "Erreur" });
    } finally {
      setLaunchingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: ROSE }} />
      </div>
    );
  }

  if (!marque) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Marque non trouvée</p>
        <Link href="/marques" className="hover:underline mt-2 inline-block" style={{ color: ROSE }}>
          Retour à la liste
        </Link>
      </div>
    );
  }

  const totalCA = marque.collaborations
    .filter((c) => c.statut !== "PERDU" && c.statut !== "NEGO")
    .reduce((acc, c) => acc + Number(c.montantBrut), 0);
  const contactsInCycle = marque.contacts.filter((c) =>
    (c.outreachTargets || []).some((t) => t.status !== "STOPPED")
  ).length;
  const cartoCount = marque.contacts.filter((c) => c.source === "CARTO").length;
  const repliedCount = marque.contacts.filter((c) =>
    (c.outreachTargets || []).some((t) => t.lastRepliedAt)
  ).length;
  const siteDomain = marque.siteWeb ? marque.siteWeb.replace(/^https?:\/\//, "").split("/")[0] : null;
  const collabStatusCounts = marque.collaborations.reduce<Record<string, number>>((acc, c) => {
    acc[c.statut] = (acc[c.statut] || 0) + 1;
    return acc;
  }, {});

  const STATS: { label: string; value: string; sub: string | null; icon: typeof Euro; tint: string }[] = [
    {
      label: "CA total",
      value: formatMoney(totalCA),
      sub: marque._count.collaborations > 0 ? `${marque._count.collaborations} collab${marque._count.collaborations > 1 ? "s" : ""}` : "aucune collab",
      icon: Euro,
      tint: "text-emerald-600 bg-emerald-50",
    },
    {
      label: "Contacts",
      value: String(marque.contacts.length),
      sub: cartoCount > 0 ? `${cartoCount} via carto` : null,
      icon: Users,
      tint: "text-blue-600 bg-blue-50",
    },
    {
      label: "En cycle outreach",
      value: String(contactsInCycle),
      sub: repliedCount > 0 ? `${repliedCount} a répondu` : "relance auto J+3 · 45j",
      icon: Repeat,
      tint: "text-purple-600 bg-purple-50",
    },
    {
      label: "Paiement",
      value: `${marque.delaiPaiement || 30}j`,
      sub: marque.modePaiement || "Virement",
      icon: Clock,
      tint: "text-orange-600 bg-orange-50",
    },
  ];

  const cartoContacts = marque.contacts
    .filter((c) => c.source === "CARTO")
    .sort((a, b) => (a.priorite || "P9").localeCompare(b.priorite || "P9"));
  const cartoFiles = marque.cartoFiles || [];

  /** Regénère le fichier Excel de la cartographie (emails et statuts à jour). */
  const downloadCartoExcel = async () => {
    if (exporting || cartoContacts.length === 0) return;
    setExporting(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet("Cartographie");

      ws.columns = [
        { width: 10 },
        { width: 14 },
        { width: 16 },
        { width: 46 },
        { width: 36 },
        { width: 18 },
        { width: 32 },
        { width: 48 },
        { width: 26 },
      ];

      // Titre
      ws.mergeCells("A1:I1");
      const title = ws.getCell("A1");
      title.value = `${marque.nom} — Cartographie contacts influence`;
      title.font = { bold: true, size: 14 };

      // Ligne vide puis en-tête
      ws.addRow([]);
      const headerRow = ws.addRow([
        "Priorité",
        "Prénom",
        "Nom",
        "Rôle",
        "Périmètre",
        "Localisation",
        "Email",
        "URL LinkedIn",
        "Statut outreach",
      ]);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF16110F" } };
        cell.alignment = { vertical: "middle" };
      });

      const statusLabel = (info: OutreachInfo | null): string => {
        if (!info) return "";
        if (info.status === "WAITING") {
          const days = daysUntil(info.nextRecontactAt);
          return `En cycle${days !== null && days > 0 ? ` (recontact J-${days})` : ""}`;
        }
        if (info.status === "TO_CONTACT") return "À contacter";
        if (info.status === "TO_RECONTACT") return "À recontacter";
        return "Stoppé";
      };

      for (const contact of cartoContacts) {
        const outreach = (contact.outreachTargets || [])[0] || null;
        const row = ws.addRow([
          contact.priorite?.toUpperCase() || "",
          contact.prenom || "",
          contact.nom || "",
          contact.poste || "",
          contact.perimetre || "",
          contact.localisation || "",
          contact.email || "",
          contact.linkedinUrl || "",
          statusLabel(outreach),
        ]);
        if (contact.linkedinUrl) {
          row.getCell(8).value = { text: contact.linkedinUrl, hyperlink: contact.linkedinUrl };
          row.getCell(8).font = { color: { argb: "FF2563A8" }, underline: true };
        }
        if (contact.email) {
          row.getCell(7).value = { text: contact.email, hyperlink: `mailto:${contact.email}` };
        }
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${marque.nom} - Cartographie contacts.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export carto:", e);
      alert("Impossible de générer le fichier Excel.");
    } finally {
      setExporting(false);
    }
  };

  const TABS = [
    { id: "activite" as const, label: "Activité 360°", icon: Activity, badge: null as number | null },
    { id: "contacts" as const, label: "Contacts", icon: Users, badge: marque.contacts.length || null },
    ...(cartoContacts.length > 0 || cartoFiles.length > 0
      ? [{ id: "carto" as const, label: "Cartographie", icon: FileSpreadsheet, badge: (cartoContacts.length || null) as number | null }]
      : []),
    { id: "collabs" as const, label: "Collaborations", icon: Handshake, badge: marque._count.collaborations || null },
  ];

  return (
    <div className="min-h-full" style={{ backgroundColor: "#FAF9F7" }}>
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-5 space-y-5">
        {/* ====================== Topbar ====================== */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm min-w-0">
            {readOnly ? (
              <button
                type="button"
                onClick={() => router.back()}
                className="flex items-center gap-1.5 text-gray-400 hover:text-gray-700 transition-colors shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                Retour
              </button>
            ) : (
              <Link
                href="/marques"
                className="flex items-center gap-1.5 text-gray-400 hover:text-gray-700 transition-colors shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                Marques
              </Link>
            )}
            <span className="text-gray-300">/</span>
            <span className="font-medium truncate" style={{ color: INK }}>
              {marque.nom}
            </span>
          </div>

          {!readOnly && (
            <div className="flex items-center gap-2 shrink-0">
              <Link
                href="/outreach"
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-lg ring-1 ring-black/[0.08] bg-white hover:bg-gray-50 transition-colors"
                style={{ color: INK }}
              >
                <Repeat className="w-3.5 h-3.5" style={{ color: ROSE }} />
                Outreach
              </Link>
              <Link
                href={`/collaborations/new?marque=${marque.id}`}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-lg ring-1 ring-black/[0.08] bg-white hover:bg-gray-50 transition-colors"
                style={{ color: INK }}
              >
                <Plus className="w-3.5 h-3.5" style={{ color: ROSE }} />
                Collab
              </Link>
              <Link
                href={`/marques/${marque.id}/edit`}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-semibold rounded-lg text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: INK }}
              >
                <Pencil className="w-3.5 h-3.5" />
                Modifier
              </Link>
              <button
                onClick={handleDelete}
                className="p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                title="Supprimer la marque"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* ====================== Identité ====================== */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-white ring-1 ring-black/[0.07] shadow-sm flex items-center justify-center overflow-hidden shrink-0">
            {siteDomain && !logoError ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`https://www.google.com/s2/favicons?domain=${siteDomain}&sz=128`}
                alt={marque.nom}
                className="w-9 h-9 object-contain"
                onError={() => setLogoError(true)}
              />
            ) : (
              <span className="text-2xl font-bold" style={{ color: ROSE }}>
                {marque.nom.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight truncate" style={{ color: INK }}>
              {marque.nom}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[13px] text-gray-500">
              {marque.secteur && (
                <span
                  className="px-2 py-[2px] rounded-md text-xs font-medium ring-1 ring-inset ring-black/[0.06]"
                  style={{ backgroundColor: "#F5EBE0", color: INK }}
                >
                  {marque.secteur}
                </span>
              )}
              {siteDomain && (
                <a
                  href={marque.siteWeb!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:underline"
                  style={{ color: ROSE }}
                >
                  <Globe className="w-3.5 h-3.5" />
                  {siteDomain}
                </a>
              )}
              {marque.ville && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {marque.ville}
                  {marque.pays ? `, ${marque.pays}` : ""}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                Client depuis{" "}
                {new Date(marque.createdAt).toLocaleDateString("fr-FR", { month: "short", year: "numeric" })}
              </span>
            </div>
          </div>
        </div>

        {/* ====================== Stat cards ====================== */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {STATS.map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl bg-white ring-1 ring-black/[0.06] shadow-[0_1px_2px_rgba(16,12,10,0.04)] px-4 py-3.5 flex items-start justify-between"
            >
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">{stat.label}</p>
                <p className="text-[22px] font-bold tabular-nums mt-0.5 truncate" style={{ color: INK }}>
                  {stat.value}
                </p>
                {stat.sub && <p className="text-xs text-gray-400 mt-0.5 truncate">{stat.sub}</p>}
              </div>
              <div className={`p-2 rounded-xl shrink-0 ${stat.tint}`}>
                <stat.icon className="w-4 h-4" />
              </div>
            </div>
          ))}
        </div>

        {/* ====================== Body ====================== */}
        <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-5 items-start">
          {/* ---------- Panneau latéral ---------- */}
          <aside className="space-y-4 lg:sticky lg:top-5">
            <SectionCard title="À propos" icon={Building2}>
              <div>
                {marque.siteWeb && (
                  <DetailRow
                    label="Site"
                    value={
                      <a href={marque.siteWeb} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: ROSE }}>
                        {siteDomain}
                      </a>
                    }
                  />
                )}
                {marque.secteur && <DetailRow label="Secteur" value={marque.secteur} />}
                {(marque.adresseRue || marque.ville) && (
                  <DetailRow
                    label="Adresse"
                    value={
                      <span className="block leading-snug">
                        {marque.adresseRue && (
                          <>
                            {marque.adresseRue}
                            <br />
                          </>
                        )}
                        {marque.adresseComplement && (
                          <>
                            {marque.adresseComplement}
                            <br />
                          </>
                        )}
                        {[marque.codePostal, marque.ville].filter(Boolean).join(" ")}
                        {marque.pays ? `, ${marque.pays}` : ""}
                      </span>
                    }
                  />
                )}
                <DetailRow
                  label="Créée le"
                  value={new Date(marque.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                />
              </div>
            </SectionCard>

            <SectionCard title="Facturation" icon={ReceiptText}>
              <div>
                {marque.raisonSociale && <DetailRow label="Raison sociale" value={marque.raisonSociale} />}
                {marque.formeJuridique && <DetailRow label="Forme" value={marque.formeJuridique} />}
                {marque.siret && <DetailRow label="SIRET" value={marque.siret} mono />}
                {marque.numeroTVA && <DetailRow label="TVA" value={marque.numeroTVA} mono />}
                <DetailRow label="Délai" value={`${marque.delaiPaiement || 30} jours`} />
                <DetailRow
                  label="Mode"
                  value={
                    <span className="inline-flex items-center gap-1">
                      <Banknote className="w-3.5 h-3.5 text-gray-300" />
                      {marque.modePaiement || "Virement"}
                    </span>
                  }
                />
                <DetailRow label="Devise" value={marque.devise || "EUR"} />
                {!marque.raisonSociale && !marque.siret && (
                  <p className="text-xs text-gray-300 italic pt-2">
                    Infos légales à compléter via « Modifier »
                  </p>
                )}
              </div>
            </SectionCard>

            {marque.notes && (
              <SectionCard title="Notes" icon={StickyNote}>
                <p className="text-[13px] text-gray-600 leading-relaxed whitespace-pre-line">{marque.notes}</p>
              </SectionCard>
            )}
          </aside>

          {/* ---------- Zone principale ---------- */}
          <main className="min-w-0 space-y-4">
            {/* Tabs segmentés */}
            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-white ring-1 ring-black/[0.06] shadow-[0_1px_2px_rgba(16,12,10,0.04)]">
              {TABS.map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
                      active ? "text-white shadow-sm" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
                    }`}
                    style={active ? { backgroundColor: INK } : undefined}
                  >
                    <tab.icon className="w-3.5 h-3.5" />
                    {tab.label}
                    {tab.badge !== null && (
                      <span
                        className={`text-[10px] font-bold px-1.5 rounded-full tabular-nums ${
                          active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ============ Activité ============ */}
            {activeTab === "activite" && (
              <div className="rounded-2xl bg-white ring-1 ring-black/[0.06] shadow-[0_1px_2px_rgba(16,12,10,0.04)] p-5">
                <MarqueCrmTab marqueId={marque.id} />
              </div>
            )}

            {/* ============ Contacts ============ */}
            {activeTab === "contacts" && (
              <div className="rounded-2xl bg-white ring-1 ring-black/[0.06] shadow-[0_1px_2px_rgba(16,12,10,0.04)] overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-gray-100">
                  <div className="text-[13px] text-gray-500">
                    <span className="font-semibold" style={{ color: INK }}>
                      {marque.contacts.length}
                    </span>{" "}
                    contact{marque.contacts.length > 1 ? "s" : ""}
                    {cartoCount > 0 && (
                      <span className="inline-flex items-center gap-1 ml-2 text-xs text-gray-400">
                        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                        {cartoCount} via cartographie
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setShowAddContact((v) => !v)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-semibold rounded-lg transition-colors ${
                      showAddContact ? "text-gray-500 ring-1 ring-black/[0.08] bg-white hover:bg-gray-50" : "text-white hover:opacity-90"
                    }`}
                    style={showAddContact ? undefined : { backgroundColor: INK }}
                  >
                    {showAddContact ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                    {showAddContact ? "Annuler" : "Ajouter"}
                  </button>
                </div>

                {/* Ajout rapide */}
                {showAddContact && (
                  <div className="px-5 py-4 border-b border-gray-100" style={{ backgroundColor: "#FAF9F7" }}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                      {(
                        [
                          ["prenom", "Prénom", "text"],
                          ["nom", "Nom", "text"],
                          ["poste", "Poste / rôle", "text"],
                          ["email", "Email", "email"],
                          ["telephone", "Téléphone", "tel"],
                          ["linkedinUrl", "URL LinkedIn", "url"],
                        ] as const
                      ).map(([key, placeholder, type]) => (
                        <input
                          key={key}
                          type={type}
                          placeholder={placeholder}
                          value={newContact[key]}
                          onChange={(e) => setNewContact({ ...newContact, [key]: e.target.value })}
                          className="px-3 py-2 rounded-lg bg-white ring-1 ring-black/[0.08] text-[13px] focus:outline-none focus:ring-2"
                        />
                      ))}
                    </div>
                    <div className="mt-3">
                      <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                        Langue du contact <span className="text-red-500">*</span>
                      </label>
                      <div className="flex gap-1.5">
                        {(["fr", "en"] as const).map((lang) => {
                          const active = newContactLang === lang;
                          return (
                            <button
                              key={lang}
                              type="button"
                              onClick={() => setNewContactLang(lang)}
                              className="px-3 py-1.5 rounded-lg text-[13px] font-medium transition ring-1 ring-black/[0.08]"
                              style={
                                active
                                  ? { backgroundColor: INK, color: "white" }
                                  : { backgroundColor: "white", color: INK }
                              }
                            >
                              {lang === "fr" ? "🇫🇷 Français" : "🇬🇧 English"}
                            </button>
                          );
                        })}
                      </div>
                      {newContactLang === null && (
                        <p className="text-[11px] text-gray-400 mt-1">
                          Obligatoire : ses mails et relances auto partiront dans cette langue.
                        </p>
                      )}
                    </div>
                    {contactError && <p className="text-xs text-red-600 mt-2">{contactError}</p>}
                    <div className="flex justify-end mt-3">
                      <button
                        onClick={submitNewContact}
                        disabled={
                          savingContact ||
                          (!newContact.prenom.trim() && !newContact.nom.trim()) ||
                          newContactLang === null
                        }
                        className="flex items-center gap-2 px-4 py-2 text-[13px] font-semibold text-white rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity"
                        style={{ backgroundColor: INK }}
                      >
                        {savingContact && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        Enregistrer
                      </button>
                    </div>
                  </div>
                )}

                {marque.contacts.length === 0 && !showAddContact ? (
                  <div className="text-center py-14">
                    <Users className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                    <p className="text-sm text-gray-400">Aucun contact enregistré</p>
                    <p className="text-xs text-gray-300 mt-1">
                      Ajoute un contact ici, ou importe une cartographie depuis Outreach.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {marque.contacts.map((contact) => {
                      const outreach = (contact.outreachTargets || [])[0] || null;
                      return (
                        <div key={contact.id} className="group px-5 py-3.5 hover:bg-gray-50/60 transition-colors">
                          <div className="flex items-start gap-3.5">
                            {/* Avatar */}
                            <div
                              className="w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-bold text-white shrink-0 mt-0.5"
                              style={{
                                background: contact.principal
                                  ? `linear-gradient(135deg, ${ROSE}, #9C6B6B)`
                                  : "linear-gradient(135deg, #3A2E2A, #16110F)",
                              }}
                            >
                              {initials(contact.prenom, contact.nom)}
                            </div>

                            {/* Identité */}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[14px] font-semibold" style={{ color: INK }}>
                                  {[contact.prenom, contact.nom].filter(Boolean).join(" ")}
                                </span>
                                {contact.principal && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-[2px] rounded-md ring-1 ring-inset ring-black/[0.06]" style={{ backgroundColor: "#F5EBE0", color: INK }}>
                                    <Star className="w-2.5 h-2.5" style={{ color: ROSE }} />
                                    Principal
                                  </span>
                                )}
                                {contact.priorite && (
                                  <span className={`text-[10px] font-bold px-1.5 py-[2px] rounded-md ring-1 ring-inset ${prioriteStyle(contact.priorite)}`}>
                                    {contact.priorite.toUpperCase()}
                                  </span>
                                )}
                                {outreach?.lastRepliedAt && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                                    <MessageSquareReply className="w-3 h-3" />A répondu
                                  </span>
                                )}
                              </div>
                              {contact.poste && (
                                <p className="text-[12.5px] text-gray-500 mt-0.5 leading-snug">{contact.poste}</p>
                              )}
                              {(contact.perimetre || contact.localisation) && (
                                <p className="text-xs text-gray-400 mt-0.5">
                                  {[contact.perimetre, contact.localisation].filter(Boolean).join(" · ")}
                                </p>
                              )}

                              {/* Coordonnées */}
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
                                {contact.email ? (
                                  <span className="inline-flex items-center gap-1">
                                    <a
                                      href={`mailto:${contact.email}`}
                                      className="inline-flex items-center gap-1.5 text-[12.5px] text-gray-600 hover:text-gray-900"
                                    >
                                      <Mail className="w-3.5 h-3.5 text-gray-300" />
                                      {contact.email}
                                    </a>
                                    <button
                                      onClick={() => copyEmail(contact.email!)}
                                      className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-gray-100 transition-all"
                                      title="Copier"
                                    >
                                      {copiedEmail === contact.email ? (
                                        <Check className="w-3 h-3 text-emerald-500" />
                                      ) : (
                                        <Copy className="w-3 h-3 text-gray-400" />
                                      )}
                                    </button>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 text-xs text-gray-300 italic">
                                    <Mail className="w-3.5 h-3.5" />
                                    email à compléter dans Outreach
                                  </span>
                                )}
                                {contact.telephone && (
                                  <span className="inline-flex items-center gap-1.5 text-[12.5px] text-gray-600">
                                    <Phone className="w-3.5 h-3.5 text-gray-300" />
                                    {contact.telephone}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Côté droit : outreach + LinkedIn */}
                            <div className="flex flex-col items-end gap-2 shrink-0">
                              <div className="flex items-center gap-1.5">
                                {contact.linkedinUrl && (
                                  <a
                                    href={contact.linkedinUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1.5 rounded-lg text-[#0A66C2] bg-[#0A66C2]/[0.07] hover:bg-[#0A66C2]/15 transition-colors"
                                    title="Profil LinkedIn"
                                  >
                                    <Linkedin className="w-3.5 h-3.5" />
                                  </a>
                                )}
                                {!readOnly && (
                                  <button
                                    type="button"
                                    onClick={() => deleteContact(contact)}
                                    disabled={deletingContactId === contact.id}
                                    className="p-1.5 rounded-lg text-red-500 bg-red-50 opacity-0 group-hover:opacity-100 hover:bg-red-100 transition-all disabled:opacity-60 disabled:cursor-wait"
                                    title="Supprimer ce contact"
                                  >
                                    {deletingContactId === contact.id ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Trash2 className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                )}
                              </div>
                              {outreach ? (
                                <OutreachBadge info={outreach} />
                              ) : (
                                contact.email &&
                                canOutreach && (
                                  <button
                                    type="button"
                                    onClick={() => launchOutreach(contact)}
                                    disabled={launchingId === contact.id}
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity hover:underline disabled:opacity-60 disabled:cursor-wait"
                                    style={{ color: ROSE }}
                                    title="Ajouter ce contact au cycle Outreach (À contacter)"
                                  >
                                    {launchingId === contact.id ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Send className="w-3 h-3" />
                                    )}
                                    Lancer le contact
                                  </button>
                                )
                              )}
                              {launchError?.id === contact.id && (
                                <span className="text-[10px] text-red-500 text-right max-w-[180px] leading-tight">
                                  {launchError.message}
                                </span>
                              )}
                              {outreach && outreach.cycleCount > 0 && (
                                <span className="text-[10px] text-gray-300 tabular-nums">Cycle {outreach.cycleCount}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ============ Collaborations ============ */}
            {/* ============ Cartographie importée ============ */}
            {activeTab === "carto" && (
              <div className="rounded-2xl bg-white ring-1 ring-black/[0.06] shadow-[0_1px_2px_rgba(16,12,10,0.04)] overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 border-b border-gray-100">
                  <div className="text-[13px] text-gray-500">
                    <span className="inline-flex items-center gap-1.5">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                      <span className="font-semibold" style={{ color: INK }}>
                        {cartoContacts.length}
                      </span>
                      contact{cartoContacts.length > 1 ? "s" : ""} importé{cartoContacts.length > 1 ? "s" : ""} — cartographie de l&apos;influence chez {marque.nom}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href="/outreach"
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg ring-1 ring-black/[0.08] bg-white hover:bg-gray-50 transition-colors"
                      style={{ color: INK }}
                    >
                      <Repeat className="w-3.5 h-3.5" style={{ color: ROSE }} />
                      Gérer dans Outreach
                    </Link>
                    <button
                      onClick={downloadCartoExcel}
                      disabled={exporting}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                      style={{ backgroundColor: INK }}
                      title="Regénère le fichier Excel avec les emails et statuts à jour"
                    >
                      {exporting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      Télécharger l&apos;Excel
                    </button>
                  </div>
                </div>

                {/* Fichiers originaux importés */}
                {cartoFiles.length > 0 && (
                  <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-300 mb-2">
                      Fichier{cartoFiles.length > 1 ? "s" : ""} d&apos;origine
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {cartoFiles.map((file) => (
                        <a
                          key={file.id}
                          href={`/api/marques/${marque.id}/carto-files/${file.id}`}
                          className="group inline-flex items-center gap-2 pl-2.5 pr-3 py-1.5 rounded-lg bg-white ring-1 ring-black/[0.07] hover:ring-black/20 transition-all text-[12.5px]"
                          style={{ color: INK }}
                          title="Télécharger le fichier tel qu'importé"
                        >
                          <FileSpreadsheet className="w-4 h-4 text-emerald-500 shrink-0" />
                          <span className="font-medium truncate max-w-[260px]">{file.fileName}</span>
                          <span className="text-[11px] text-gray-300">
                            {(file.size / 1024).toFixed(0)} Ko ·{" "}
                            {new Date(file.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                          </span>
                          <Download className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-600 transition-colors shrink-0" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-gray-100 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-300">
                        <th className="px-5 py-2.5 font-semibold w-16">Prio</th>
                        <th className="px-3 py-2.5 font-semibold">Contact</th>
                        <th className="px-3 py-2.5 font-semibold">Rôle</th>
                        <th className="px-3 py-2.5 font-semibold hidden lg:table-cell">Périmètre</th>
                        <th className="px-3 py-2.5 font-semibold hidden md:table-cell">Localisation</th>
                        <th className="px-3 py-2.5 font-semibold">Email</th>
                        <th className="px-5 py-2.5 font-semibold text-right">Statut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {cartoContacts.map((contact) => {
                        const outreach = (contact.outreachTargets || [])[0] || null;
                        return (
                          <tr key={contact.id} className="group hover:bg-gray-50/60 transition-colors align-top">
                            <td className="px-5 py-3">
                              {contact.priorite ? (
                                <span className={`inline-block text-[10px] font-bold px-1.5 py-[2px] rounded-md ring-1 ring-inset ${prioriteStyle(contact.priorite)}`}>
                                  {contact.priorite.toUpperCase()}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-200">—</span>
                              )}
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-2">
                                <span className="text-[13px] font-semibold whitespace-nowrap" style={{ color: INK }}>
                                  {[contact.prenom, contact.nom].filter(Boolean).join(" ")}
                                </span>
                                {contact.linkedinUrl && (
                                  <a
                                    href={contact.linkedinUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1 rounded-md text-[#0A66C2] bg-[#0A66C2]/[0.07] hover:bg-[#0A66C2]/15 transition-colors shrink-0"
                                    title="Profil LinkedIn"
                                  >
                                    <Linkedin className="w-3 h-3" />
                                  </a>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-[12.5px] text-gray-600 max-w-[260px]">
                              {contact.poste || <span className="text-gray-200">—</span>}
                            </td>
                            <td className="px-3 py-3 text-[12.5px] text-gray-500 hidden lg:table-cell max-w-[220px]">
                              {contact.perimetre || <span className="text-gray-200">—</span>}
                            </td>
                            <td className="px-3 py-3 text-[12.5px] text-gray-500 hidden md:table-cell whitespace-nowrap">
                              {contact.localisation || <span className="text-gray-200">—</span>}
                            </td>
                            <td className="px-3 py-3">
                              {contact.email ? (
                                <span className="inline-flex items-center gap-1">
                                  <a
                                    href={`mailto:${contact.email}`}
                                    className="text-[12.5px] text-gray-600 hover:text-gray-900 whitespace-nowrap"
                                  >
                                    {contact.email}
                                  </a>
                                  <button
                                    onClick={() => copyEmail(contact.email!)}
                                    className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-gray-100 transition-all"
                                    title="Copier"
                                  >
                                    {copiedEmail === contact.email ? (
                                      <Check className="w-3 h-3 text-emerald-500" />
                                    ) : (
                                      <Copy className="w-3 h-3 text-gray-400" />
                                    )}
                                  </button>
                                </span>
                              ) : (
                                <span className="text-xs text-gray-300 italic whitespace-nowrap">à compléter</span>
                              )}
                            </td>
                            <td className="px-5 py-3 text-right">
                              {outreach ? (
                                <OutreachBadge info={outreach} />
                              ) : contact.email && canOutreach ? (
                                <div className="flex flex-col items-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => launchOutreach(contact)}
                                    disabled={launchingId === contact.id}
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold transition-opacity hover:underline disabled:opacity-60 disabled:cursor-wait"
                                    style={{ color: ROSE }}
                                    title="Ajouter ce contact au cycle Outreach (À contacter)"
                                  >
                                    {launchingId === contact.id ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Send className="w-3 h-3" />
                                    )}
                                    Lancer
                                  </button>
                                  {launchError?.id === contact.id && (
                                    <span className="text-[10px] text-red-500 leading-tight max-w-[160px]">
                                      {launchError.message}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-gray-200">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="px-5 py-2.5 border-t border-gray-100 text-xs text-gray-300">
                  Importée via « Importer une carto » dans Outreach — complète les emails manquants là-bas pour lancer les cycles de contact.
                </div>
              </div>
            )}

            {activeTab === "collabs" && (
              <div className="rounded-2xl bg-white ring-1 ring-black/[0.06] shadow-[0_1px_2px_rgba(16,12,10,0.04)] overflow-hidden">
                {marque.collaborations.length === 0 ? (
                  <div className="text-center py-14">
                    <Handshake className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                    <p className="text-sm text-gray-400">Aucune collaboration pour l&apos;instant</p>
                    <Link
                      href={`/collaborations/new?marque=${marque.id}`}
                      className="inline-flex items-center gap-2 mt-4 px-4 py-2 text-[13px] font-semibold text-white rounded-lg hover:opacity-90 transition-opacity"
                      style={{ backgroundColor: INK }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Créer une collab
                    </Link>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                      <span className="text-[13px] font-semibold tabular-nums" style={{ color: INK }}>
                        {formatMoney(totalCA)}
                      </span>
                      <span className="text-xs text-gray-400">de CA</span>
                      <span className="text-gray-200">·</span>
                      {Object.entries(collabStatusCounts).map(([statut, count]) => (
                        <span key={statut} className={`text-[11px] font-medium px-2 py-[3px] rounded-md ${collabStatusClass(statut)}`}>
                          {count} {statut}
                        </span>
                      ))}
                      <Link
                        href={`/collaborations/new?marque=${marque.id}`}
                        className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white rounded-lg hover:opacity-90 transition-opacity"
                        style={{ backgroundColor: INK }}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Nouvelle
                      </Link>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {marque.collaborations.map((collab) => (
                        <Link
                          key={collab.id}
                          href={`/collaborations/${collab.id}`}
                          className="flex items-center gap-3.5 px-5 py-3.5 hover:bg-gray-50/60 transition-colors"
                        >
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                            style={{ background: "linear-gradient(135deg, #C08B8B, #9C6B6B)" }}
                          >
                            {initials(collab.talent.prenom, collab.talent.nom)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[14px] font-medium truncate" style={{ color: INK }}>
                              {collab.talent.prenom} {collab.talent.nom}
                            </p>
                            <p className="text-xs text-gray-400 truncate">
                              {collab.typeContenu} · {collab.reference}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[14px] font-semibold tabular-nums" style={{ color: INK }}>
                              {formatMoney(collab.montantBrut)}
                            </p>
                            <span className={`text-[10px] font-medium px-1.5 py-[2px] rounded-md ${collabStatusClass(collab.statut)}`}>
                              {collab.statut}
                            </span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
