"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CONTACT_CATEGORY_OPTIONS } from "../constants";
import type { CannesContact } from "../../types";

type Props = { initialData?: CannesContact | null; onClose: () => void };

export default function ContactForm({ initialData, onClose }: Props) {
  const router = useRouter();
  const isEdit = Boolean(initialData?.id);
  const [loading, setLoading] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState({
    firstName: initialData?.firstName || "",
    lastName: initialData?.lastName || "",
    company: initialData?.company || "",
    role: initialData?.role || "",
    phone: initialData?.phone || "",
    email: initialData?.email || "",
    instagram: initialData?.instagram || "",
    category: initialData?.category || "AUTRE",
    hotel: initialData?.hotel || "",
    arrivalDate: initialData?.arrivalDate ? new Date(initialData.arrivalDate).toISOString().slice(0, 10) : "",
    departureDate: initialData?.departureDate ? new Date(initialData.departureDate).toISOString().slice(0, 10) : "",
    pdfAttachmentUrl: initialData?.pdfAttachmentUrl || "",
    notes: initialData?.notes || "",
  });

  async function uploadPdf(file: File | null) {
    if (!file) return;
    setUploadingPdf(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/cannes/upload-pdf", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || "Upload impossible");
      setForm((p) => ({ ...p, pdfAttachmentUrl: data.url! }));
      toast.success("PDF uploadé");
    } catch {
      toast.error("Erreur lors de l'upload du PDF");
    } finally {
      setUploadingPdf(false);
    }
  }

  async function submit() {
    setLoading(true);
    try {
      const res = await fetch(isEdit ? `/api/cannes/contacts/${initialData!.id}` : "/api/cannes/contacts", {
        method: isEdit ? "PATCH" : "POST",
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      toast.success(isEdit ? "Contact modifie" : "Contact cree");
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
      const res = await fetch(`/api/cannes/contacts/${initialData.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Contact supprime");
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
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <input value={form.firstName} onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))} placeholder="Prenom" className="rounded border border-[#E5E0D8] p-2" />
        <input value={form.lastName} onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))} placeholder="Nom" className="rounded border border-[#E5E0D8] p-2" />
        <input value={form.company} onChange={(e) => setForm((p) => ({ ...p, company: e.target.value }))} placeholder="Societe" className="rounded border border-[#E5E0D8] p-2" />
        <input value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))} placeholder="Fonction" className="rounded border border-[#E5E0D8] p-2" />
        <input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="Telephone" className="rounded border border-[#E5E0D8] p-2" />
        <input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="Email" className="rounded border border-[#E5E0D8] p-2" />
        <input value={form.instagram} onChange={(e) => setForm((p) => ({ ...p, instagram: e.target.value }))} placeholder="Instagram" className="rounded border border-[#E5E0D8] p-2" />
        <select value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} className="rounded border border-[#E5E0D8] p-2">
          {CONTACT_CATEGORY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <input value={form.hotel} onChange={(e) => setForm((p) => ({ ...p, hotel: e.target.value }))} placeholder="Hotel" className="rounded border border-[#E5E0D8] p-2" />
        <input type="date" value={form.arrivalDate} onChange={(e) => setForm((p) => ({ ...p, arrivalDate: e.target.value }))} className="rounded border border-[#E5E0D8] p-2" />
        <input type="date" value={form.departureDate} onChange={(e) => setForm((p) => ({ ...p, departureDate: e.target.value }))} className="rounded border border-[#E5E0D8] p-2" />
        <input
          type="file"
          accept="application/pdf,.pdf"
          onChange={(e) => void uploadPdf(e.target.files?.[0] ?? null)}
          className="rounded border border-[#E5E0D8] p-2 md:col-span-2"
        />
        {uploadingPdf && <p className="text-xs text-[#1A1110]/60 md:col-span-2">Upload PDF en cours...</p>}
        <input type="url" value={form.pdfAttachmentUrl} onChange={(e) => setForm((p) => ({ ...p, pdfAttachmentUrl: e.target.value }))} placeholder="Piece jointe PDF (URL)" className="rounded border border-[#E5E0D8] p-2 md:col-span-2" />
        {form.pdfAttachmentUrl && (
          <a href={form.pdfAttachmentUrl} target="_blank" rel="noreferrer" className="text-xs underline md:col-span-2">
            Ouvrir le PDF actuel
          </a>
        )}
        <textarea rows={3} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Notes" className="rounded border border-[#E5E0D8] p-2 md:col-span-2" />
      </div>
      {confirmDelete && (
        <div className="rounded-lg border border-[#E5E0D8] bg-[#F5EBE0] p-3">
          <p>Supprimer ce contact ? Cette action est irreversible.</p>
          <div className="mt-2 flex gap-2">
            <button onClick={remove} className="rounded bg-[#C08B8B] px-3 py-1.5 text-white">Confirmer</button>
            <button onClick={() => setConfirmDelete(false)} className="rounded border border-[#E5E0D8] px-3 py-1.5">Annuler</button>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>{isEdit && <button onClick={() => setConfirmDelete(true)} className="rounded border border-[#C08B8B] px-3 py-2 text-[#C08B8B]">Supprimer</button>}</div>
        <div className="flex gap-2">
          <button onClick={onClose} className="rounded border border-[#E5E0D8] px-4 py-2">Annuler</button>
          <button disabled={loading} onClick={submit} className="rounded bg-[#1A1110] px-4 py-2 text-[#F5EBE0] hover:bg-[#C08B8B]">{loading ? "..." : "Enregistrer"}</button>
        </div>
      </div>
    </div>
  );
}
