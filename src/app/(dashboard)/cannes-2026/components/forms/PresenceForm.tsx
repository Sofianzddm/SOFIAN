"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { CannesPresence } from "../../types";

type UserLite = { id: string; name: string; image: string | null; role: string };
type TalentLite = { id: string; name: string; photoUrl: string | null };
type PresenceKind = "user" | "talent";

type Props = {
  initialData?: CannesPresence | null;
  forcedType?: PresenceKind;
  onClose: () => void;
};

export default function PresenceForm({ initialData, forcedType, onClose }: Props) {
  const router = useRouter();
  const isEdit = Boolean(initialData?.id);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [users, setUsers] = useState<UserLite[]>([]);
  const [talents, setTalents] = useState<TalentLite[]>([]);
  const [kind, setKind] = useState<PresenceKind>(
    forcedType || (initialData?.talentId ? "talent" : "user")
  );
  const [form, setForm] = useState({
    userId: initialData?.userId || "",
    talentId: initialData?.talentId || "",
    arrivalDate: initialData ? new Date(initialData.arrivalDate).toISOString().slice(0, 10) : "2026-05-12",
    departureDate: initialData ? new Date(initialData.departureDate).toISOString().slice(0, 10) : "2026-05-12",
    hotel: initialData?.hotel || "",
    hotelAddress: initialData?.hotelAddress || "",
    flightArrival: initialData?.flightArrival || "",
    flightDeparture: initialData?.flightDeparture || "",
    roomNumber: initialData?.roomNumber || "",
    notes: initialData?.notes || "",
  });

  useEffect(() => {
    fetch("/api/cannes/users-list").then(async (r) => r.ok && setUsers(await r.json()));
    fetch("/api/cannes/talents-list").then(async (r) => r.ok && setTalents(await r.json()));
  }, []);

  const selectedValue = useMemo(
    () => (kind === "user" ? form.userId : form.talentId),
    [form.talentId, form.userId, kind]
  );

  async function submit() {
    setLoading(true);
    try {
      const payload = {
        ...form,
        userId: kind === "user" ? form.userId || null : null,
        talentId: kind === "talent" ? form.talentId || null : null,
      };
      const res = await fetch(isEdit ? `/api/cannes/presences/${initialData!.id}` : "/api/cannes/presences", {
        method: isEdit ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      toast.success(isEdit ? "Presence modifiee" : "Presence ajoutee");
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
      const res = await fetch(`/api/cannes/presences/${initialData.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Presence supprimee");
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
      <div className="flex gap-2">
        <button disabled={isEdit} onClick={() => setKind("user")} className={`rounded-full px-3 py-1 text-xs ${kind === "user" ? "bg-[#1A1110] text-[#F5EBE0]" : "border border-[#E5E0D8]"}`}>Collaborateur</button>
        <button disabled={isEdit} onClick={() => setKind("talent")} className={`rounded-full px-3 py-1 text-xs ${kind === "talent" ? "bg-[#1A1110] text-[#F5EBE0]" : "border border-[#E5E0D8]"}`}>Talent</button>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {kind === "user" ? (
          <select disabled={isEdit} value={selectedValue} onChange={(e) => setForm((p) => ({ ...p, userId: e.target.value }))} className="rounded border border-[#E5E0D8] p-2 md:col-span-2">
            <option value="">Selectionner un collaborateur</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        ) : (
          <select disabled={isEdit} value={selectedValue} onChange={(e) => setForm((p) => ({ ...p, talentId: e.target.value }))} className="rounded border border-[#E5E0D8] p-2 md:col-span-2">
            <option value="">Selectionner un talent</option>
            {talents.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        <input type="date" value={form.arrivalDate} onChange={(e) => setForm((p) => ({ ...p, arrivalDate: e.target.value }))} className="rounded border border-[#E5E0D8] p-2" />
        <input type="date" value={form.departureDate} onChange={(e) => setForm((p) => ({ ...p, departureDate: e.target.value }))} className="rounded border border-[#E5E0D8] p-2" />
        <input value={form.hotel} onChange={(e) => setForm((p) => ({ ...p, hotel: e.target.value }))} placeholder="Hotel" className="rounded border border-[#E5E0D8] p-2" />
        <input value={form.hotelAddress} onChange={(e) => setForm((p) => ({ ...p, hotelAddress: e.target.value }))} placeholder="Adresse hotel" className="rounded border border-[#E5E0D8] p-2" />
        <input value={form.flightArrival} onChange={(e) => setForm((p) => ({ ...p, flightArrival: e.target.value }))} placeholder="Vol arrivee" className="rounded border border-[#E5E0D8] p-2" />
        <input value={form.flightDeparture} onChange={(e) => setForm((p) => ({ ...p, flightDeparture: e.target.value }))} placeholder="Vol depart" className="rounded border border-[#E5E0D8] p-2" />
        <input value={form.roomNumber} onChange={(e) => setForm((p) => ({ ...p, roomNumber: e.target.value }))} placeholder="Numero de chambre" className="rounded border border-[#E5E0D8] p-2" />
        <textarea rows={3} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Notes" className="rounded border border-[#E5E0D8] p-2 md:col-span-2" />
      </div>
      {confirmDelete && (
        <div className="rounded-lg border border-[#E5E0D8] bg-[#F5EBE0] p-3">
          <p>Supprimer cette presence ? Cette action est irreversible.</p>
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
