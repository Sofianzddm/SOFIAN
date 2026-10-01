"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ArrowLeft,
  Building2,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Globe,
  Instagram,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import {
  PRESTATAIRE_CATEGORIES,
  PRESTATAIRE_CATEGORIE_LABEL,
  PRESTATAIRE_STATUT_LABEL,
  PRESTATAIRE_VILLES,
  type PrestataireCategorie,
  type PrestataireStatut,
} from "@/lib/projets-outreach";
import { canWritePrestataireCrm } from "@/lib/prestataire-crm-access";
import { PrestataireImportCartoModal } from "@/components/prestataires/PrestataireImportCartoModal";

const INK = "#16110F";

type Contact = {
  id: string;
  prenom: string | null;
  nom: string | null;
  email: string | null;
  telephone: string | null;
  role: string | null;
  principal: boolean;
};

type Prestataire = {
  id: string;
  nom: string;
  categorie: string;
  siteWeb: string | null;
  email: string | null;
  telephone: string | null;
  instagram: string | null;
  adresse: string | null;
  ville: string | null;
  notes: string | null;
  contacts: Contact[];
  cartoFiles?: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    size: number;
    kind: string;
    createdAt: string;
  }>;
  projets: Array<{
    linkId: string;
    statut: string;
    campaignId: string;
    campaignTitle: string;
    talentName: string;
  }>;
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
      {label}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function inputClass(canWrite: boolean) {
  return `w-full rounded-lg border-0 bg-[#FAF9F7] px-3 py-2.5 text-[13px] ring-1 ring-black/[0.06] outline-none focus:ring-2 focus:ring-black/10 disabled:opacity-70 ${
    canWrite ? "" : "cursor-default"
  }`;
}

export default function PrestataireDetailPage() {
  const params = useParams();
  const id = String(params?.id || "");
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role ?? "";
  const canWrite = canWritePrestataireCrm(role);

  const [p, setP] = useState<Prestataire | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    nom: "",
    categorie: "AUTRE",
    siteWeb: "",
    email: "",
    telephone: "",
    instagram: "",
    adresse: "",
    ville: "",
    notes: "",
  });
  const [contactForm, setContactForm] = useState({
    prenom: "",
    nom: "",
    email: "",
    telephone: "",
    role: "",
  });
  const [showAddContact, setShowAddContact] = useState(false);
  const [showCartoModal, setShowCartoModal] = useState(false);
  const [droppedCarto, setDroppedCarto] = useState<File | null>(null);
  const [cartoDragOver, setCartoDragOver] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/prestataires/${id}`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Introuvable.");
      const row = data.prestataire as Prestataire;
      setP(row);
      setForm({
        nom: row.nom || "",
        categorie: row.categorie || "AUTRE",
        siteWeb: row.siteWeb || "",
        email: row.email || "",
        telephone: row.telephone || "",
        instagram: row.instagram || "",
        adresse: row.adresse || "",
        ville: row.ville || "",
        notes: row.notes || "",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) void load();
  }, [id, load]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!canWrite) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/prestataires/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Sauvegarde impossible.");
      setSuccess("Fiche enregistrée.");
      setEditing(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function addContact(e: FormEvent) {
    e.preventDefault();
    if (!canWrite) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/prestataires/${id}/contacts`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contactForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Ajout impossible.");
      setContactForm({
        prenom: "",
        nom: "",
        email: "",
        telephone: "",
        role: "",
      });
      setShowAddContact(false);
      setSuccess("Contact ajouté.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function removeContact(contactId: string) {
    if (!canWrite) return;
    if (!window.confirm("Supprimer ce contact ?")) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/prestataires/${id}/contacts?contactId=${encodeURIComponent(contactId)}`,
        { method: "DELETE", credentials: "include" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Suppression impossible.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function removeCartoFile(fileId: string) {
    if (!canWrite) return;
    if (!window.confirm("Supprimer ce fichier carto ?")) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/prestataires/${id}/carto-files/${fileId}`,
        { method: "DELETE", credentials: "include" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Suppression impossible.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  function openCarto(file?: File | null) {
    setDroppedCarto(file || null);
    setShowCartoModal(true);
  }

  function formatBytes(n: number) {
    if (n < 1024) return `${n} o`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
    return `${(n / (1024 * 1024)).toFixed(1)} Mo`;
  }

  if (loading) {
    return (
      <div
        className="flex min-h-full items-center justify-center gap-2 text-[13px] text-gray-400"
        style={{ backgroundColor: "#FAF9F7" }}
      >
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement de la fiche…
      </div>
    );
  }

  if (!p) {
    return (
      <div className="p-8 text-sm text-red-600" style={{ backgroundColor: "#FAF9F7" }}>
        {error || "Fiche introuvable."}
      </div>
    );
  }

  const catLabel =
    PRESTATAIRE_CATEGORIE_LABEL[p.categorie as PrestataireCategorie] ||
    p.categorie;
  const backHref = `/prestataires?categorie=${p.categorie}`;
  const initial = (p.nom.trim()[0] || "?").toUpperCase();
  const siteDisplay = p.siteWeb
    ? p.siteWeb.replace(/^https?:\/\//, "").replace(/\/$/, "")
    : null;

  return (
    <div className="min-h-full" style={{ backgroundColor: "#FAF9F7" }}>
      <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 md:px-6">
        {/* Topbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-500 no-underline hover:text-gray-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {catLabel}
          </Link>
          <div className="flex items-center gap-2">
            {canWrite && !editing && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-lg bg-white px-3.5 py-2 text-[13px] font-semibold text-gray-700 ring-1 ring-black/[0.08] transition hover:bg-gray-50"
              >
                Modifier
              </button>
            )}
            {canWrite && editing && (
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setForm({
                    nom: p.nom || "",
                    categorie: p.categorie || "AUTRE",
                    siteWeb: p.siteWeb || "",
                    email: p.email || "",
                    telephone: p.telephone || "",
                    instagram: p.instagram || "",
                    adresse: p.adresse || "",
                    ville: p.ville || "",
                    notes: p.notes || "",
                  });
                }}
                className="rounded-lg bg-white px-3.5 py-2 text-[13px] font-semibold text-gray-500 ring-1 ring-black/[0.08]"
              >
                Annuler
              </button>
            )}
          </div>
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

        {/* Identity */}
        <div className="rounded-xl bg-white p-5 ring-1 ring-black/[0.06] sm:p-6">
          <div className="flex flex-wrap items-start gap-4">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-[20px] font-bold text-white"
              style={{ backgroundColor: INK }}
            >
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1
                  className="text-[24px] font-bold tracking-[-0.02em]"
                  style={{ color: INK }}
                >
                  {p.nom}
                </h1>
                <span className="rounded-md bg-[#FAF9F7] px-2 py-0.5 text-[11px] font-semibold text-gray-600 ring-1 ring-black/[0.05]">
                  {catLabel}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-gray-500">
                {p.ville ? (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-gray-300" />
                    {p.ville}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-gray-300">
                    <MapPin className="h-3.5 w-3.5" />
                    Ville non renseignée
                  </span>
                )}
                {p.email ? (
                  <a
                    href={`mailto:${p.email}`}
                    className="inline-flex items-center gap-1.5 text-gray-500 no-underline hover:text-gray-900"
                  >
                    <Mail className="h-3.5 w-3.5 text-gray-300" />
                    {p.email}
                  </a>
                ) : null}
                {p.telephone ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-gray-300" />
                    {p.telephone}
                  </span>
                ) : null}
                {siteDisplay ? (
                  <a
                    href={
                      p.siteWeb!.startsWith("http")
                        ? p.siteWeb!
                        : `https://${p.siteWeb}`
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-gray-500 no-underline hover:text-gray-900"
                  >
                    <Globe className="h-3.5 w-3.5 text-gray-300" />
                    {siteDisplay}
                  </a>
                ) : null}
                {p.instagram ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Instagram className="h-3.5 w-3.5 text-gray-300" />
                    {p.instagram}
                  </span>
                ) : null}
              </div>
              {p.adresse ? (
                <p className="mt-2 text-[12.5px] text-gray-400">{p.adresse}</p>
              ) : null}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-black/[0.04] pt-4 sm:grid-cols-3">
            {[
              {
                label: "Contacts",
                value: p.contacts.length,
                icon: Users,
              },
              {
                label: "Projets",
                value: p.projets.length,
                icon: Building2,
              },
              {
                label: "Ville",
                value: p.ville || "—",
                icon: MapPin,
                text: true,
              },
            ].map((s) => {
              const Icon = s.icon;
              return (
                <div
                  key={s.label}
                  className="rounded-lg bg-[#FAF9F7] px-3.5 py-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-gray-400">
                      {s.label}
                    </span>
                    <Icon className="h-3.5 w-3.5 text-gray-300" />
                  </div>
                  <div
                    className={`mt-1 font-bold tracking-tight ${
                      s.text ? "text-[15px]" : "text-[20px]"
                    }`}
                    style={{ color: INK }}
                  >
                    {s.value}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Edit / infos */}
        {editing && canWrite ? (
          <form
            onSubmit={onSave}
            className="space-y-4 rounded-xl bg-white p-5 ring-1 ring-black/[0.06]"
          >
            <h2
              className="text-[14px] font-semibold"
              style={{ color: INK }}
            >
              Informations
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nom">
                <input
                  required
                  className={inputClass(true)}
                  style={{ color: INK }}
                  value={form.nom}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, nom: e.target.value }))
                  }
                />
              </Field>
              <Field label="Catégorie">
                <select
                  className={inputClass(true)}
                  style={{ color: INK }}
                  value={form.categorie}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, categorie: e.target.value }))
                  }
                >
                  {PRESTATAIRE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {PRESTATAIRE_CATEGORIE_LABEL[c]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Ville">
                <input
                  list="prestataire-villes"
                  className={inputClass(true)}
                  style={{ color: INK }}
                  value={form.ville}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, ville: e.target.value }))
                  }
                  placeholder="Paris, Lyon…"
                />
                <datalist id="prestataire-villes">
                  {PRESTATAIRE_VILLES.map((v) => (
                    <option key={v} value={v} />
                  ))}
                </datalist>
              </Field>
              <Field label="Adresse">
                <input
                  className={inputClass(true)}
                  style={{ color: INK }}
                  value={form.adresse}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, adresse: e.target.value }))
                  }
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  className={inputClass(true)}
                  style={{ color: INK }}
                  value={form.email}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, email: e.target.value }))
                  }
                />
              </Field>
              <Field label="Téléphone">
                <input
                  className={inputClass(true)}
                  style={{ color: INK }}
                  value={form.telephone}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, telephone: e.target.value }))
                  }
                />
              </Field>
              <Field label="Site web">
                <input
                  className={inputClass(true)}
                  style={{ color: INK }}
                  value={form.siteWeb}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, siteWeb: e.target.value }))
                  }
                  placeholder="https://"
                />
              </Field>
              <Field label="Instagram">
                <input
                  className={inputClass(true)}
                  style={{ color: INK }}
                  value={form.instagram}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, instagram: e.target.value }))
                  }
                  placeholder="@…"
                />
              </Field>
            </div>
            <Field label="Notes">
              <textarea
                rows={3}
                className={inputClass(true)}
                style={{ color: INK }}
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
              />
            </Field>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: INK }}
            >
              {saving ? (
                <Loader2 className="inline h-4 w-4 animate-spin" />
              ) : (
                "Enregistrer la fiche"
              )}
            </button>
          </form>
        ) : p.notes ? (
          <div className="rounded-xl bg-white p-5 ring-1 ring-black/[0.06]">
            <h2
              className="text-[13px] font-semibold"
              style={{ color: INK }}
            >
              Notes
            </h2>
            <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-gray-600">
              {p.notes}
            </p>
          </div>
        ) : null}

        {/* Cartographie — sur la fiche uniquement (pas sur la liste) */}
        <section className="overflow-hidden rounded-xl bg-white ring-1 ring-black/[0.06]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.04] px-5 py-3.5">
            <div>
              <h2
                className="text-[14px] font-semibold"
                style={{ color: INK }}
              >
                Cartographie
              </h2>
              <p className="text-[12px] text-gray-400">
                CSV / Excel → contacts ajoutés à cette fiche
              </p>
            </div>
            {canWrite && (
              <button
                type="button"
                onClick={() => openCarto(null)}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white"
                style={{ backgroundColor: INK }}
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Importer une carto
              </button>
            )}
          </div>

          {canWrite ? (
            <div
              className={`mx-5 my-4 rounded-xl border-2 border-dashed px-4 py-7 text-center transition ${
                cartoDragOver
                  ? "border-gray-900 bg-gray-50"
                  : "border-gray-200 bg-[#FAF9F7]"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setCartoDragOver(true);
              }}
              onDragLeave={() => setCartoDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setCartoDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) openCarto(f);
              }}
            >
              <FileSpreadsheet className="mx-auto h-6 w-6 text-gray-300" />
              <p
                className="mt-2 text-[13px] font-semibold"
                style={{ color: INK }}
              >
                Glisse une carto CSV / Excel ici
              </p>
              <p className="mt-1 text-[12px] text-gray-400">
                Même format qu’enrichissement · .csv ou .xlsx
              </p>
              <label
                className="mt-3 inline-flex cursor-pointer rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white"
                style={{ backgroundColor: INK }}
              >
                Choisir un fichier
                <input
                  type="file"
                  accept=".csv,.tsv,.xlsx,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) openCarto(f);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          ) : null}

          {(p.cartoFiles || []).length === 0 ? (
            !canWrite ? (
              <p className="px-5 py-6 text-[13px] text-gray-400">
                Aucun fichier carto.
              </p>
            ) : null
          ) : (
            <ul className="border-t border-black/[0.04]">
              {(p.cartoFiles || []).map((f, idx) => (
                <li
                  key={f.id}
                  className="flex flex-wrap items-center gap-3 px-5 py-3"
                  style={{
                    borderTop:
                      idx === 0 ? "none" : "1px solid rgba(0,0,0,0.04)",
                  }}
                >
                  <FileSpreadsheet className="h-4 w-4 shrink-0 text-gray-300" />
                  <div className="min-w-0 flex-1">
                    <div
                      className="truncate text-[13px] font-semibold"
                      style={{ color: INK }}
                    >
                      {f.fileName}
                    </div>
                    <div className="text-[11px] text-gray-400">
                      {formatBytes(f.size)} ·{" "}
                      {new Date(f.createdAt).toLocaleDateString("fr-FR")}
                    </div>
                  </div>
                  <a
                    href={`/api/prestataires/${p.id}/carto-files/${f.id}`}
                    className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-semibold text-gray-600 no-underline ring-1 ring-black/[0.08] hover:bg-gray-50"
                  >
                    <Download className="h-3 w-3" />
                    Télécharger
                  </a>
                  {canWrite && (
                    <button
                      type="button"
                      className="rounded-md p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500"
                      onClick={() => void removeCartoFile(f.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Contacts */}
        <section className="overflow-hidden rounded-xl bg-white ring-1 ring-black/[0.06]">
          <div className="flex items-center justify-between border-b border-black/[0.04] px-5 py-3.5">
            <div>
              <h2
                className="text-[14px] font-semibold"
                style={{ color: INK }}
              >
                Contacts
              </h2>
              <p className="text-[12px] text-gray-400">
                Destinataires pour les mails depuis le projet
              </p>
            </div>
            {canWrite && (
              <button
                type="button"
                onClick={() => setShowAddContact((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white"
                style={{ backgroundColor: INK }}
              >
                <Plus className="h-3.5 w-3.5" />
                Ajouter
              </button>
            )}
          </div>

          {showAddContact && canWrite && (
            <form
              onSubmit={addContact}
              className="grid gap-2 border-b border-black/[0.04] bg-[#FAF9F7] px-5 py-4 sm:grid-cols-5"
            >
              {(
                [
                  ["prenom", "Prénom"],
                  ["nom", "Nom"],
                  ["role", "Rôle"],
                  ["email", "Email"],
                  ["telephone", "Tél"],
                ] as const
              ).map(([key, ph]) => (
                <input
                  key={key}
                  className={inputClass(true)}
                  style={{ color: INK }}
                  placeholder={ph}
                  value={contactForm[key]}
                  onChange={(e) =>
                    setContactForm((f) => ({ ...f, [key]: e.target.value }))
                  }
                />
              ))}
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg px-3 py-2 text-[12px] font-semibold text-white sm:col-span-5 sm:w-fit"
                style={{ backgroundColor: INK }}
              >
                Enregistrer le contact
              </button>
            </form>
          )}

          {p.contacts.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <Users className="mx-auto h-5 w-5 text-gray-300" />
              <p
                className="mt-2 text-[13px] font-semibold"
                style={{ color: INK }}
              >
                Aucun contact
              </p>
              <p className="mt-1 text-[12px] text-gray-400">
                Ajoute un contact pour pouvoir envoyer des mails depuis le
                projet.
              </p>
            </div>
          ) : (
            <ul>
              {p.contacts.map((c, idx) => {
                const name =
                  [c.prenom, c.nom].filter(Boolean).join(" ") || "Sans nom";
                return (
                  <li
                    key={c.id}
                    className="flex items-center gap-3 px-5 py-3.5"
                    style={{
                      borderTop:
                        idx === 0 ? "none" : "1px solid rgba(0,0,0,0.04)",
                    }}
                  >
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold text-white"
                      style={{ backgroundColor: INK }}
                    >
                      {name[0]?.toUpperCase() || "?"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className="text-[13px] font-semibold"
                        style={{ color: INK }}
                      >
                        {name}
                        {c.role ? (
                          <span className="ml-2 text-[12px] font-normal text-gray-400">
                            {c.role}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-[12px] text-gray-400">
                        {c.email ? (
                          <a
                            href={`mailto:${c.email}`}
                            className="hover:text-gray-700"
                          >
                            {c.email}
                          </a>
                        ) : null}
                        {c.telephone ? <span>{c.telephone}</span> : null}
                      </div>
                    </div>
                    {canWrite && (
                      <button
                        type="button"
                        className="rounded-md p-1.5 text-gray-300 transition hover:bg-red-50 hover:text-red-500"
                        onClick={() => void removeContact(c.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Projets */}
        <section className="overflow-hidden rounded-xl bg-white ring-1 ring-black/[0.06]">
          <div className="border-b border-black/[0.04] px-5 py-3.5">
            <h2
              className="text-[14px] font-semibold"
              style={{ color: INK }}
            >
              Projets liés
            </h2>
            <p className="text-[12px] text-gray-400">
              Ajoute cette fiche à un projet outreach
            </p>
          </div>
          <div className="px-5 py-4">
            <AddToProjectBlock
              prestataireId={p.id}
              canWrite={canWrite}
              onAdded={() => void load()}
            />
          </div>
          {p.projets.length === 0 ? (
            <p className="px-5 pb-5 text-[13px] text-gray-400">
              Pas encore lié à un projet.
            </p>
          ) : (
            <ul className="border-t border-black/[0.04]">
              {p.projets.map((pr, idx) => (
                <li
                  key={pr.linkId}
                  className="flex items-center justify-between gap-3 px-5 py-3"
                  style={{
                    borderTop:
                      idx === 0 ? "none" : "1px solid rgba(0,0,0,0.04)",
                  }}
                >
                  <div>
                    <Link
                      href={`/projets-outreach/${pr.campaignId}`}
                      className="text-[13px] font-semibold no-underline hover:underline"
                      style={{ color: INK }}
                    >
                      {pr.campaignTitle}
                    </Link>
                    <div className="text-[12px] text-gray-400">
                      {pr.talentName} ·{" "}
                      {PRESTATAIRE_STATUT_LABEL[
                        pr.statut as PrestataireStatut
                      ] || pr.statut}
                    </div>
                  </div>
                  <Link
                    href={`/projets-outreach/${pr.campaignId}`}
                    className="inline-flex items-center gap-1 text-[12px] font-semibold text-gray-500 no-underline hover:text-gray-900"
                  >
                    Ouvrir <ExternalLink className="h-3 w-3" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {showCartoModal && (
        <PrestataireImportCartoModal
          prestataireId={p.id}
          prestataireNom={p.nom}
          initialFile={droppedCarto}
          onClose={() => {
            setShowCartoModal(false);
            setDroppedCarto(null);
          }}
          onImported={(result) => {
            setSuccess(
              `${result.created} contact${result.created > 1 ? "s" : ""} importé${result.created > 1 ? "s" : ""}${
                result.skipped
                  ? ` · ${result.skipped} ignoré${result.skipped > 1 ? "s" : ""}`
                  : ""
              }${result.fileSaved ? " · fichier conservé" : ""}.`
            );
            void load();
          }}
          onError={(message) => setError(message)}
        />
      )}
    </div>
  );
}

function AddToProjectBlock({
  prestataireId,
  canWrite,
  onAdded,
}: {
  prestataireId: string;
  canWrite: boolean;
  onAdded?: () => void;
}) {
  const [projects, setProjects] = useState<
    Array<{ id: string; title: string; talentName: string }>
  >([]);
  const [campaignId, setCampaignId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!canWrite) return;
    void (async () => {
      const res = await fetch("/api/projets-outreach?active=1", {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      setProjects(
        (Array.isArray(data.campaigns) ? data.campaigns : []).map(
          (c: { id: string; title: string; talentName?: string }) => ({
            id: c.id,
            title: c.title,
            talentName: c.talentName || "",
          })
        )
      );
    })();
  }, [canWrite]);

  if (!canWrite) return null;

  async function add() {
    if (!campaignId) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(
        `/api/prestataires/${prestataireId}/ajouter-au-projet`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignId }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok && !data.already) throw new Error(data.error || "Erreur");
      setMsg(
        data.already
          ? data.resetToContact
            ? "Déjà dans le projet — statut remis à « À contacter »."
            : "Déjà dans ce projet."
          : `Ajouté à « ${data.campaignTitle} » · À contacter.`
      );
      onAdded?.();
      if (!data.already || data.resetToContact) {
        window.location.href = `/projets-outreach/${campaignId}?tab=prestas`;
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
        Ajouter au projet
        <select
          className="mt-1.5 block min-w-[240px] rounded-lg border-0 bg-[#FAF9F7] px-3 py-2 text-[13px] font-medium ring-1 ring-black/[0.06] outline-none"
          style={{ color: INK }}
          value={campaignId}
          onChange={(e) => setCampaignId(e.target.value)}
        >
          <option value="">Choisir un projet…</option>
          {projects.map((pr) => (
            <option key={pr.id} value={pr.id}>
              {pr.title}
              {pr.talentName ? ` · ${pr.talentName}` : ""}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={!campaignId || busy}
        onClick={() => void add()}
        className="rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-35"
        style={{ backgroundColor: INK }}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          "Ajouter au projet"
        )}
      </button>
      {msg ? <span className="text-[12px] text-gray-500">{msg}</span> : null}
    </div>
  );
}
