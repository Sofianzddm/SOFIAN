"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { EVENT_TYPE_OPTIONS } from "../constants";
import type { CannesEvent } from "../../types";

type EventFormData = Partial<
  Pick<
    CannesEvent,
    | "id"
    | "date"
    | "startTime"
    | "endTime"
    | "title"
    | "type"
    | "location"
    | "address"
    | "organizer"
    | "contactInfo"
    | "dressCode"
    | "invitationLink"
    | "description"
    | "notes"
  >
>;

type Props = {
  mode?: "create" | "edit";
  initialData?: EventFormData | null;
  defaultDate?: string;
  defaultStartTime?: string;
  onClose: () => void;
};

export default function EventForm({
  mode,
  initialData,
  defaultDate,
  defaultStartTime,
  onClose,
}: Props) {
  const router = useRouter();
  const isEdit = mode ? mode === "edit" : Boolean(initialData?.id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    date: initialData?.date
      ? new Date(initialData.date).toISOString().slice(0, 10)
      : defaultDate || "",
    startTime: initialData?.startTime || defaultStartTime || "",
    endTime: initialData?.endTime || "",
    title: initialData?.title || "",
    type: initialData?.type || "SOIREE",
    location: initialData?.location || "",
    address: initialData?.address || "",
    organizer: initialData?.organizer || "",
    contactInfo: initialData?.contactInfo || "",
    dressCode: initialData?.dressCode || "",
    invitationLink: initialData?.invitationLink || "",
    description: initialData?.description || "",
    notes: initialData?.notes || "",
  });

  async function submit() {
    setLoading(true);
    try {
      const res = await fetch(isEdit ? `/api/cannes/events/${initialData?.id}` : "/api/cannes/events", {
        method: isEdit ? "PATCH" : "POST",
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      toast.success(isEdit ? "Evenement modifie" : "Evenement cree");
      onClose();
      router.refresh();
    } catch {
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setLoading(false);
    }
  }

  async function remove() {
    if (!initialData?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/cannes/events/${initialData.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Evenement supprime");
      onClose();
      router.refresh();
    } catch {
      toast.error("Erreur lors de la suppression");
    } finally {
      setLoading(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="space-y-5 text-sm text-[#1A1110]">
      <section className="space-y-3">
        <h4 className="font-medium">Details evenement</h4>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <input type="date" min="2026-05-12" max="2026-05-23" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} className="rounded border border-[#E5E0D8] p-2" />
          <input type="time" required value={form.startTime} onChange={(e) => setForm((p) => ({ ...p, startTime: e.target.value }))} className="rounded border border-[#E5E0D8] p-2" />
          <input type="time" value={form.endTime} onChange={(e) => setForm((p) => ({ ...p, endTime: e.target.value }))} className="rounded border border-[#E5E0D8] p-2" />
          <select value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))} className="rounded border border-[#E5E0D8] p-2">
            {EVENT_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Titre" className="rounded border border-[#E5E0D8] p-2 md:col-span-2" />
          <input value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} placeholder="Lieu" className="rounded border border-[#E5E0D8] p-2 md:col-span-2" />
        </div>
      </section>
      <section className="space-y-3">
        <h4 className="font-medium">Infos pratiques</h4>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <input value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} placeholder="Adresse" className="rounded border border-[#E5E0D8] p-2 md:col-span-2" />
          <input value={form.organizer} onChange={(e) => setForm((p) => ({ ...p, organizer: e.target.value }))} placeholder="Organisateur" className="rounded border border-[#E5E0D8] p-2" />
          <input value={form.dressCode} onChange={(e) => setForm((p) => ({ ...p, dressCode: e.target.value }))} placeholder="Dress code" className="rounded border border-[#E5E0D8] p-2" />
          <input type="url" value={form.invitationLink} onChange={(e) => setForm((p) => ({ ...p, invitationLink: e.target.value }))} placeholder="Lien invitation" className="rounded border border-[#E5E0D8] p-2 md:col-span-2" />
          <textarea rows={2} value={form.contactInfo} onChange={(e) => setForm((p) => ({ ...p, contactInfo: e.target.value }))} placeholder="Contact" className="rounded border border-[#E5E0D8] p-2 md:col-span-2" />
          <textarea rows={3} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Description" className="rounded border border-[#E5E0D8] p-2 md:col-span-2" />
          <textarea rows={3} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Notes" className="rounded border border-[#E5E0D8] p-2 md:col-span-2" />
        </div>
      </section>
      {confirmDelete && (
        <div className="rounded-lg border border-[#E5E0D8] bg-[#F5EBE0] p-3 text-sm">
          <p>Supprimer cet evenement ? Cette action est irreversible.</p>
          <div className="mt-2 flex gap-2">
            <button onClick={remove} className="rounded bg-[#C08B8B] px-3 py-1.5 text-white">Confirmer</button>
            <button onClick={() => setConfirmDelete(false)} className="rounded border border-[#E5E0D8] px-3 py-1.5">Annuler</button>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between pt-2">
        <div>
          {isEdit && (
            <button onClick={() => setConfirmDelete(true)} className="rounded border border-[#C08B8B] px-3 py-2 text-[#C08B8B]">
              Supprimer
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="rounded border border-[#E5E0D8] px-4 py-2">Annuler</button>
          <button disabled={loading} onClick={submit} className="rounded bg-[#1A1110] px-4 py-2 text-[#F5EBE0] hover:bg-[#C08B8B]">{loading ? "..." : "Enregistrer"}</button>
        </div>
      </div>
    </div>
  );
}
