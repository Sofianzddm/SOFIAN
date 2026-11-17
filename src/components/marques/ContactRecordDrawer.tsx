"use client";

import { useEffect, useState } from "react";
import {
  X,
  Loader2,
  Mail,
  Phone,
  Linkedin,
  Star,
  Check,
  Copy,
  ExternalLink,
  Briefcase,
} from "lucide-react";
import Link from "next/link";
import { ContactActivitiesPanel } from "@/components/marques/ContactActivitiesPanel";
import {
  agencyNameFromEmailDomain,
  agencyNameFromPerimetre,
} from "@/lib/agency-domains";

const INK = "#16110F";
const ROSE = "#C08B8B";

export type DrawerContact = {
  id: string;
  prenom?: string | null;
  nom: string;
  email: string | null;
  telephone: string | null;
  poste: string | null;
  principal: boolean;
  language?: string | null;
  priorite?: string | null;
  perimetre?: string | null;
  localisation?: string | null;
  linkedinUrl?: string | null;
  source?: string | null;
  _count?: { activities?: number };
};

type LinkedAgency = {
  id: string;
  name: string;
  slug?: string;
};

type FormState = {
  prenom: string;
  nom: string;
  poste: string;
  email: string;
  telephone: string;
  linkedinUrl: string;
  priorite: string;
  perimetre: string;
  localisation: string;
  language: "fr" | "en";
  principal: boolean;
};

function toForm(c: DrawerContact): FormState {
  return {
    prenom: c.prenom || "",
    nom: c.nom || "",
    poste: c.poste || "",
    email: c.email || "",
    telephone: c.telephone || "",
    linkedinUrl: c.linkedinUrl || "",
    priorite: (c.priorite || "").toUpperCase(),
    perimetre: c.perimetre || "",
    localisation: c.localisation || "",
    language: c.language === "en" ? "en" : "fr",
    principal: Boolean(c.principal),
  };
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputClass =
  "w-full px-2.5 py-2 rounded-lg text-[13px] ring-1 ring-black/[0.08] bg-white focus:outline-none focus:ring-2 disabled:bg-gray-50 disabled:text-gray-500";

export function ContactRecordDrawer({
  open,
  marqueId,
  contact,
  readOnly,
  linkedAgencies,
  onClose,
  onSaved,
  onActivityCountChange,
}: {
  open: boolean;
  marqueId: string;
  contact: DrawerContact | null;
  readOnly?: boolean;
  /** Partners déjà liés à la marque (pour afficher le bon lien fiche agence). */
  linkedAgencies?: LinkedAgency[];
  onClose: () => void;
  onSaved: (contact: DrawerContact) => void;
  onActivityCountChange?: (contactId: string, n: number) => void;
}) {
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [copied, setCopied] = useState<"email" | "phone" | null>(null);
  const [tab, setTab] = useState<"about" | "activity">("about");

  useEffect(() => {
    if (open && contact) {
      setForm(toForm(contact));
      setError(null);
      setSavedFlash(false);
      setTab("about");
    }
  }, [open, contact?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !contact || !form) return null;

  const dirty =
    form.prenom !== (contact.prenom || "") ||
    form.nom !== (contact.nom || "") ||
    form.poste !== (contact.poste || "") ||
    form.email !== (contact.email || "") ||
    form.telephone !== (contact.telephone || "") ||
    form.linkedinUrl !== (contact.linkedinUrl || "") ||
    form.priorite !== (contact.priorite || "").toUpperCase() ||
    form.perimetre !== (contact.perimetre || "") ||
    form.localisation !== (contact.localisation || "") ||
    form.language !== (contact.language === "en" ? "en" : "fr") ||
    form.principal !== Boolean(contact.principal);

  const displayName =
    [form.prenom, form.nom].filter(Boolean).join(" ") || contact.nom;

  const detectedAgencyName =
    agencyNameFromEmailDomain(form.email) ||
    agencyNameFromEmailDomain(contact.email) ||
    agencyNameFromPerimetre(contact.perimetre);
  const linkedAgency =
    (detectedAgencyName &&
      linkedAgencies?.find(
        (a) => a.name.toLowerCase() === detectedAgencyName.toLowerCase()
      )) ||
    linkedAgencies?.find((a) => {
      const domain = (form.email || contact.email || "").toLowerCase().split("@")[1] || "";
      return (
        domain.includes(a.name.toLowerCase().replace(/\s+/g, "")) ||
        (a.slug && domain.includes(a.slug.replace(/-/g, "")))
      );
    }) ||
    null;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const save = async () => {
    if (readOnly || !dirty) return;
    if (!form.nom.trim() && !form.prenom.trim()) {
      setError("Nom ou prénom requis.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/marques/${marqueId}/contacts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: contact.id,
          prenom: form.prenom.trim(),
          nom: form.nom.trim() || form.prenom.trim(),
          poste: form.poste.trim(),
          email: form.email.trim(),
          telephone: form.telephone.trim(),
          linkedinUrl: form.linkedinUrl.trim(),
          priorite: form.priorite,
          perimetre: form.perimetre.trim(),
          localisation: form.localisation.trim(),
          language: form.language,
          principal: form.principal,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Enregistrement impossible");
      const updated = data.contact as DrawerContact;
      const merged: DrawerContact = {
        ...contact,
        ...updated,
        prenom: (updated.prenom ?? form.prenom.trim()) || null,
        nom: updated.nom || form.nom.trim(),
        poste: (updated.poste ?? form.poste.trim()) || null,
        email: (updated.email ?? form.email.trim()) || null,
        telephone: (updated.telephone ?? form.telephone.trim()) || null,
        linkedinUrl: (updated.linkedinUrl ?? form.linkedinUrl.trim()) || null,
        priorite: (updated.priorite ?? form.priorite) || null,
        perimetre: (updated.perimetre ?? form.perimetre.trim()) || null,
        localisation: (updated.localisation ?? form.localisation.trim()) || null,
        language: updated.language || form.language,
        principal: updated.principal ?? form.principal,
      };
      setForm(toForm(merged));
      onSaved(merged);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  const copy = async (kind: "email" | "phone", value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/25"
        aria-label="Fermer"
        onClick={onClose}
      />
      <aside
        className="relative h-full w-full max-w-[440px] bg-white shadow-2xl flex flex-col"
        style={{ color: INK }}
      >
        {/* Header */}
        <div className="shrink-0 border-b border-black/[0.06] px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-[18px] font-semibold tracking-[-0.02em] truncate">
                  {displayName}
                </h2>
                {form.principal && (
                  <span
                    className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-[2px] rounded-md"
                    style={{ backgroundColor: "#F5EBE0", color: INK }}
                  >
                    <Star className="w-2.5 h-2.5" style={{ color: ROSE }} />
                    Principal
                  </span>
                )}
                {(detectedAgencyName || linkedAgency) && (
                  <span
                    className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-[2px] rounded-md"
                    style={{ backgroundColor: "#EEF2FF", color: "#3730A3" }}
                  >
                    <Briefcase className="w-2.5 h-2.5" />
                    Agence · {linkedAgency?.name || detectedAgencyName}
                  </span>
                )}
              </div>
              {form.poste && (
                <p className="text-[13px] text-gray-500 mt-0.5 truncate">{form.poste}</p>
              )}
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {form.email && (
                  <a
                    href={`mailto:${form.email}`}
                    className="inline-flex items-center gap-1 text-[12px] font-medium px-2 py-1 rounded-md ring-1 ring-black/[0.08] hover:bg-gray-50"
                  >
                    <Mail className="w-3 h-3" style={{ color: ROSE }} />
                    Email
                  </a>
                )}
                {form.telephone && (
                  <a
                    href={`tel:${form.telephone.replace(/\s/g, "")}`}
                    className="inline-flex items-center gap-1 text-[12px] font-medium px-2 py-1 rounded-md ring-1 ring-black/[0.08] hover:bg-gray-50"
                  >
                    <Phone className="w-3 h-3" style={{ color: ROSE }} />
                    Appeler
                  </a>
                )}
                {form.linkedinUrl && (
                  <a
                    href={form.linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[12px] font-medium px-2 py-1 rounded-md ring-1 ring-black/[0.08] hover:bg-gray-50"
                  >
                    <Linkedin className="w-3 h-3 text-[#0A66C2]" />
                    LinkedIn
                    <ExternalLink className="w-3 h-3 text-gray-300" />
                  </a>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-end gap-0 mt-4 border-b border-black/[0.06] -mx-5 px-5">
            {(
              [
                { id: "about" as const, label: "About" },
                { id: "activity" as const, label: "Notes & appels" },
              ] as const
            ).map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`relative px-3 py-2 text-[13px] font-medium ${
                    active ? "" : "text-gray-500 hover:text-gray-800"
                  }`}
                  style={active ? { color: INK } : undefined}
                >
                  {t.label}
                  {active && (
                    <span
                      className="absolute left-2 right-2 bottom-0 h-0.5 rounded-full"
                      style={{ backgroundColor: INK }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === "about" && (
            <div className="space-y-4">
              {(detectedAgencyName || linkedAgency) && (
                <div className="rounded-lg ring-1 ring-indigo-100 bg-indigo-50/60 px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-indigo-400 mb-1">
                    Agence
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold" style={{ color: INK }}>
                        {linkedAgency?.name || detectedAgencyName}
                      </p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        Détecté via le domaine email — aussi dans l&apos;onglet Agences.
                      </p>
                    </div>
                    {linkedAgency && (
                      <Link
                        href={`/partners/manage/${linkedAgency.id}`}
                        className="shrink-0 text-[12px] font-medium hover:underline"
                        style={{ color: ROSE }}
                      >
                        Fiche agence
                      </Link>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Prénom">
                  <input
                    className={inputClass}
                    value={form.prenom}
                    disabled={readOnly}
                    onChange={(e) => set("prenom", e.target.value)}
                  />
                </Field>
                <Field label="Nom">
                  <input
                    className={inputClass}
                    value={form.nom}
                    disabled={readOnly}
                    onChange={(e) => set("nom", e.target.value)}
                  />
                </Field>
              </div>

              <Field label="Poste / rôle">
                <input
                  className={inputClass}
                  value={form.poste}
                  disabled={readOnly}
                  placeholder="ex. Brand Manager"
                  onChange={(e) => set("poste", e.target.value)}
                />
              </Field>

              <Field label="Email">
                <div className="flex gap-1.5">
                  <input
                    type="email"
                    className={inputClass}
                    value={form.email}
                    disabled={readOnly}
                    placeholder="prenom.nom@marque.com"
                    onChange={(e) => set("email", e.target.value)}
                  />
                  {form.email && (
                    <button
                      type="button"
                      onClick={() => void copy("email", form.email)}
                      className="px-2 rounded-lg ring-1 ring-black/[0.08] hover:bg-gray-50"
                      title="Copier"
                    >
                      {copied === "email" ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-gray-400" />
                      )}
                    </button>
                  )}
                </div>
              </Field>

              <Field label="Téléphone">
                <div className="flex gap-1.5">
                  <input
                    type="tel"
                    className={inputClass}
                    value={form.telephone}
                    disabled={readOnly}
                    placeholder="+33 6 12 34 56 78"
                    onChange={(e) => set("telephone", e.target.value)}
                  />
                  {form.telephone && (
                    <button
                      type="button"
                      onClick={() => void copy("phone", form.telephone)}
                      className="px-2 rounded-lg ring-1 ring-black/[0.08] hover:bg-gray-50"
                      title="Copier"
                    >
                      {copied === "phone" ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-gray-400" />
                      )}
                    </button>
                  )}
                </div>
              </Field>

              <Field label="LinkedIn">
                <input
                  className={inputClass}
                  value={form.linkedinUrl}
                  disabled={readOnly}
                  placeholder="https://www.linkedin.com/in/…"
                  onChange={(e) => set("linkedinUrl", e.target.value)}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Priorité">
                  <select
                    className={inputClass}
                    value={form.priorite}
                    disabled={readOnly}
                    onChange={(e) => set("priorite", e.target.value)}
                  >
                    <option value="">—</option>
                    <option value="P1">P1</option>
                    <option value="P2">P2</option>
                    <option value="P3">P3</option>
                  </select>
                </Field>
                <Field label="Langue">
                  <div className="flex gap-1.5">
                    {(["fr", "en"] as const).map((lang) => {
                      const active = form.language === lang;
                      return (
                        <button
                          key={lang}
                          type="button"
                          disabled={readOnly}
                          onClick={() => set("language", lang)}
                          className="flex-1 px-2 py-2 rounded-lg text-[12px] font-medium ring-1 ring-black/[0.08] disabled:opacity-50"
                          style={
                            active
                              ? { backgroundColor: INK, color: "white" }
                              : { backgroundColor: "white", color: INK }
                          }
                        >
                          {lang === "fr" ? "FR" : "EN"}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Périmètre">
                  <input
                    className={inputClass}
                    value={form.perimetre}
                    disabled={readOnly}
                    placeholder="ex. Influence FR"
                    onChange={(e) => set("perimetre", e.target.value)}
                  />
                </Field>
                <Field label="Localisation">
                  <input
                    className={inputClass}
                    value={form.localisation}
                    disabled={readOnly}
                    placeholder="ex. Paris"
                    onChange={(e) => set("localisation", e.target.value)}
                  />
                </Field>
              </div>

              {!readOnly && (
                <label className="flex items-start gap-2.5 cursor-pointer select-none rounded-lg px-3 py-2.5 ring-1 ring-black/[0.06] bg-[#FAF9F7]">
                  <input
                    type="checkbox"
                    checked={form.principal}
                    onChange={(e) => set("principal", e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-[13px] font-medium">Contact principal</span>
                    <span className="block text-[11px] text-gray-400 mt-0.5">
                      Mis en avant sur la fiche marque (un seul principal).
                    </span>
                  </span>
                </label>
              )}

              {contact.source && (
                <p className="text-[11px] text-gray-400">
                  Source : {contact.source}
                </p>
              )}

              {error && <p className="text-[12px] text-red-600">{error}</p>}
            </div>
          )}

          {tab === "activity" && (
            <ContactActivitiesPanel
              marqueId={marqueId}
              contactId={contact.id}
              contactName={displayName}
              readOnly={readOnly}
              onCountChange={(n) => onActivityCountChange?.(contact.id, n)}
            />
          )}
        </div>

        {/* Footer */}
        {tab === "about" && !readOnly && (
          <div className="shrink-0 border-t border-black/[0.06] px-5 py-3 flex items-center justify-between gap-3 bg-white">
            <p className="text-[12px] text-gray-400">
              {savedFlash ? (
                <span className="text-emerald-600 inline-flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Enregistré
                </span>
              ) : dirty ? (
                "Modifications non enregistrées"
              ) : (
                "À jour"
              )}
            </p>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !dirty}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold text-white rounded-lg hover:opacity-90 disabled:opacity-40"
              style={{ backgroundColor: INK }}
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Enregistrer
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
