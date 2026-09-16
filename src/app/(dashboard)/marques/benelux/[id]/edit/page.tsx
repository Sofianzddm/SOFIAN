"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Save } from "lucide-react";

const INK = "#16110F";
const ROSE = "#C08B8B";

export default function EditBeneluxCompanyPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    nom: "",
    secteur: "",
    siteWeb: "",
    ville: "",
    notes: "",
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/benelux-outreach/companies/${params.id}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (!cancelled) setError(data.error || "Chargement impossible");
          return;
        }
        if (!cancelled) {
          setForm({
            nom: data.nom || "",
            secteur: data.secteur || "",
            siteWeb: data.siteWeb || "",
            ville: data.ville || "",
            notes: data.notes || "",
          });
        }
      } catch {
        if (!cancelled) setError("Chargement impossible");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const save = async () => {
    if (!form.nom.trim()) {
      setError("Le nom est requis.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/benelux-outreach/companies/${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Enregistrement impossible");
      router.push(`/marques/benelux/${params.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="min-h-full" style={{ backgroundColor: "#FAF9F7" }}>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <Link
            href={`/marques/benelux/${params.id}`}
            className="inline-flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-800"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour
          </Link>
          <span
            className="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md"
            style={{ backgroundColor: "#FEF3C7", color: "#92400E" }}
          >
            🇧🇪 BENELUX
          </span>
        </div>

        <div className="rounded-2xl bg-white ring-1 ring-black/[0.06] p-6 space-y-4">
          <h1 className="text-xl font-bold" style={{ color: INK }}>
            Modifier l&apos;entreprise
          </h1>

          {(
            [
              ["nom", "Nom", true],
              ["secteur", "Secteur", false],
              ["siteWeb", "Site web", false],
              ["ville", "Ville", false],
            ] as const
          ).map(([key, label, required]) => (
            <label key={key} className="block">
              <span className="text-[12px] font-semibold text-gray-500">
                {label}
                {required ? " *" : ""}
              </span>
              <input
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[14px] outline-none focus:ring-2 focus:ring-black/10"
              />
            </label>
          ))}

          <label className="block">
            <span className="text-[12px] font-semibold text-gray-500">Notes</span>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={4}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[14px] outline-none focus:ring-2 focus:ring-black/10"
            />
          </label>

          {error && <p className="text-[13px] text-red-600">{error}</p>}

          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: INK }}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" style={{ color: ROSE }} />
            )}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
