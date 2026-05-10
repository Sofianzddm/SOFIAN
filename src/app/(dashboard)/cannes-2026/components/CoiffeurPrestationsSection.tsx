"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import Modal from "./Modal";

type PrestRow = {
  id: string;
  title: string;
  slug: string;
  durationMinutes: number;
  bufferMinutes: number;
  description: string | null;
  sortOrder: number;
  active: boolean;
};

export default function CoiffeurPrestationsSection() {
  const [rows, setRows] = useState<PrestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<false | { mode: "create" } | { mode: "edit"; row: PrestRow }>(false);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [bufferMinutes, setBufferMinutes] = useState(5);
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [active, setActive] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cannes/coiffeur/prestations", { cache: "no-store" });
      if (!res.ok) throw new Error("load");
      setRows(await res.json());
    } catch {
      toast.error("Impossible de charger les prestations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetCreate = () => {
    setTitle("");
    setSlug("");
    setDurationMinutes(45);
    setBufferMinutes(5);
    setDescription("");
    setSortOrder(rows.length ? Math.max(...rows.map((r) => r.sortOrder)) + 1 : 0);
    setActive(true);
  };

  const openCreate = () => {
    resetCreate();
    setModal({ mode: "create" });
  };

  const openEdit = (row: PrestRow) => {
    setTitle(row.title);
    setSlug(row.slug);
    setDurationMinutes(row.durationMinutes);
    setBufferMinutes(row.bufferMinutes);
    setDescription(row.description || "");
    setSortOrder(row.sortOrder);
    setActive(row.active);
    setModal({ mode: "edit", row });
  };

  const save = async () => {
    const body = {
      title: title.trim(),
      slug: slug.trim() || undefined,
      durationMinutes,
      bufferMinutes,
      description: description.trim() || null,
      sortOrder,
      active,
    };
    const isEdit = modal && modal.mode === "edit";
    const url = isEdit ? `/api/cannes/coiffeur/prestations/${modal.row.id}` : "/api/cannes/coiffeur/prestations";
    const method = isEdit ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      toast.error(err.error || "Enregistrement impossible");
      return;
    }
    toast.success(isEdit ? "Mis à jour" : "Créée");
    setModal(false);
    void load();
  };

  const remove = async (row: PrestRow) => {
    if (!confirm(`Supprimer « ${row.title} » ?`)) return;
    const res = await fetch(`/api/cannes/coiffeur/prestations/${row.id}`, { method: "DELETE" });
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      toast.error(err.error || "Suppression impossible");
      return;
    }
    toast.success("Supprimée");
    void load();
  };

  return (
    <div className="rounded-xl border border-[#E5E0D8] bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-[Spectral] text-2xl text-[#1A1110]">Prestations coiffeur</h2>
          <p className="mt-1 text-sm text-[#1A1110]/60">
            Durée du rendez-vous et espace après chaque créneau : ces valeurs régissent la grille sur le{" "}
            <strong>lien public sans compte</strong>. Chaque règle de disponibilité est liée à une prestation. Tant
            qu&apos;une prestation est utilisée dans <strong>Disponibilités</strong>, tu ne peux pas la supprimer :
            édite les règles pour les rattacher à une autre prestation, ou <strong>désactive</strong> la prestation (elle
            ne s&apos;affiche plus sur le lien).
          </p>
        </div>
        <button
          type="button"
          onClick={() => openCreate()}
          className="rounded-lg bg-[#C08B8B] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#1A1110]"
        >
          Nouvelle prestation
        </button>
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-[#1A1110]/50">Chargement…</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-sm text-[#1A1110]/50">Aucune prestation — crée-en une avant les disponibilités.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-[#E5E0D8] bg-[#FDFBF8] px-4 py-3 text-sm text-[#1A1110]"
            >
              <div>
                <div className="font-medium">{r.title}</div>
                <div className="text-[#1A1110]/70">
                  <code className="rounded bg-[#F5EBE0] px-1 text-[11px]">{r.slug}</code>
                  {" · "}
                  {r.durationMinutes} min + buffer {r.bufferMinutes} min
                  {!r.active && (
                    <span className="ml-2 rounded bg-[#EEE] px-1.5 py-0.5 text-[11px] text-[#665]">
                      désactivée
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(r)}
                  className="rounded border border-[#E5E0D8] px-3 py-1 text-xs hover:bg-[#F5EBE0]"
                >
                  Modifier
                </button>
                <button
                  type="button"
                  onClick={() => void remove(r)}
                  className="rounded border border-[#F0C4C4] px-3 py-1 text-xs text-[#7A3535] hover:bg-[#FFF3F3]"
                >
                  Supprimer
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={!!modal}
        title={modal && modal.mode === "edit" ? "Modifier prestation" : "Nouvelle prestation"}
        onClose={() => setModal(false)}
      >
        <div className="space-y-4 text-sm text-[#1A1110]">
          <label className="block">
            Titre
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded border border-[#E5E0D8] p-2"
            />
          </label>
          <label className="block">
            Slug URL (vide = dérivé du titre)
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="ex. seance-45"
              className="mt-1 w-full rounded border border-[#E5E0D8] p-2 font-mono text-xs"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label>
              Durée créneau (min)
              <input
                type="number"
                min={5}
                max={480}
                step={5}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="mt-1 w-full rounded border border-[#E5E0D8] p-2"
              />
            </label>
            <label>
              Buffer (min)
              <input
                type="number"
                min={0}
                max={120}
                value={bufferMinutes}
                onChange={(e) => setBufferMinutes(Number(e.target.value))}
                className="mt-1 w-full rounded border border-[#E5E0D8] p-2"
              />
            </label>
          </div>
          <label className="block">
            Ordre d&apos;affichage
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              className="mt-1 w-full rounded border border-[#E5E0D8] p-2"
            />
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="rounded border-[#E5E0D8]"
            />
            Prestation réservable publiquement
          </label>
          <label className="block">
            Description courte (sur le lien · optionnel)
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded border border-[#E5E0D8] p-2"
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModal(false)} className="rounded border border-[#E5E0D8] px-4 py-2 text-xs">
              Annuler
            </button>
            <button
              type="button"
              onClick={() => void save()}
              className="rounded bg-[#1A1110] px-4 py-2 text-xs text-[#F5EBE0] hover:bg-[#C08B8B]"
            >
              Enregistrer
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
