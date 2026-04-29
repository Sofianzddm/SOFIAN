"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Modal from "./Modal";
import EventForm from "./forms/EventForm";
import { TYPE_COLORS } from "./constants";
import type { CannesEvent, CannesPresence } from "../types";

type Props = {
  event: CannesEvent | null;
  presences: CannesPresence[];
  isAdmin: boolean;
  onClose: () => void;
};

export default function EventDetailModal({ event, presences, isAdmin, onClose }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [localAttendees, setLocalAttendees] = useState(event?.attendees || []);
  const [presenceId, setPresenceId] = useState("");

  const currentEvent = event;
  const currentEventId = currentEvent?.id;
  const badge = currentEvent ? TYPE_COLORS[currentEvent.type] || TYPE_COLORS.AUTRE : TYPE_COLORS.AUTRE;

  useEffect(() => {
    setLocalAttendees(event?.attendees || []);
  }, [event]);

  const available = useMemo(() => {
    if (!currentEvent) return [];
    const eventTime = new Date(currentEvent.date).getTime();
    const existing = new Set(localAttendees.map((a) => a.presenceId));
    return presences.filter((p) => {
      if (existing.has(p.id)) return false;
      const start = new Date(p.arrivalDate).getTime();
      const end = new Date(p.departureDate).getTime();
      return start <= eventTime && end >= eventTime;
    });
  }, [currentEvent, localAttendees, presences]);

  if (!currentEvent) return null;

  async function addAttendee() {
    if (!presenceId || !currentEventId) return;
    try {
      const selected = presences.find((p) => p.id === presenceId);
      if (!selected) return;
      setLocalAttendees((prev) => [...prev, { id: `tmp-${presenceId}`, presenceId, presence: selected }]);
      const res = await fetch(`/api/cannes/events/${currentEventId}/attendees`, {
        method: "POST",
        body: JSON.stringify({ presenceId }),
      });
      if (!res.ok) throw new Error();
      toast.success("Participant ajoute");
      setPresenceId("");
      router.refresh();
    } catch {
      toast.error("Erreur lors de l'ajout");
      setLocalAttendees((prev) => prev.filter((a) => a.presenceId !== presenceId));
    }
  }

  async function removeAttendee(id: string) {
    if (!currentEventId) return;
    const backup = localAttendees;
    try {
      setLocalAttendees((prev) => prev.filter((a) => a.presenceId !== id));
      const res = await fetch(`/api/cannes/events/${currentEventId}/attendees?presenceId=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      toast.success("Participant retire");
      router.refresh();
    } catch {
      setLocalAttendees(backup);
      toast.error("Erreur lors du retrait");
    }
  }

  async function deleteEvent() {
    if (!currentEventId) return;
    const ok = window.confirm("Supprimer cet evenement ? Cette action est irreversible.");
    if (!ok) return;
    try {
      const res = await fetch(`/api/cannes/events/${currentEventId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Evenement supprime");
      onClose();
      router.refresh();
    } catch {
      toast.error("Erreur lors de la suppression");
    }
  }

  if (editing) {
    return (
      <Modal open title="Modifier evenement" onClose={() => setEditing(false)}>
        <EventForm initialData={currentEvent} onClose={() => { setEditing(false); onClose(); }} />
      </Modal>
    );
  }

  return (
    <Modal open title="Detail evenement" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <span className="rounded-full px-2 py-1 text-xs" style={{ background: badge.bg, color: badge.text }}>{badge.label}</span>
          <h3 className="mt-2 font-[Spectral] text-2xl text-[#1A1110]">{currentEvent.title}</h3>
          <p className="text-sm text-[#1A1110]/70">
            {new Date(currentEvent.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} · {currentEvent.startTime} {currentEvent.endTime ? `-> ${currentEvent.endTime}` : ""}
          </p>
          <p className="text-sm text-[#1A1110]/70">{currentEvent.location}</p>
        </div>
        <section className="space-y-1 text-sm">
          <p><strong>Organisateur :</strong> {currentEvent.organizer || "-"}</p>
          <p><strong>Contact :</strong> {currentEvent.contactInfo || "-"}</p>
          <p><strong>Dress code :</strong> {currentEvent.dressCode || "-"}</p>
          {currentEvent.invitationLink && <p><a className="text-[#1A1110] underline" href={currentEvent.invitationLink} target="_blank">Lien d'invitation</a></p>}
          {currentEvent.description && <p>{currentEvent.description}</p>}
        </section>
        {currentEvent.notes && <section className="rounded-lg bg-[#F5EBE0] p-3 text-sm">{currentEvent.notes}</section>}
        <section className="space-y-2">
          <h4 className="font-medium text-[#1A1110]">Qui y va ?</h4>
          <div className="flex flex-wrap gap-2">
            {localAttendees.map((a) => {
              const name = a.presence.user
                ? `${a.presence.user.prenom} ${a.presence.user.nom}`
                : `${a.presence.talent?.prenom || ""} ${a.presence.talent?.nom || ""}`.trim();
              return (
                <span key={a.presenceId} className="inline-flex items-center gap-2 rounded-full border border-[#E5E0D8] bg-white px-3 py-1 text-xs">
                  {name}
                  {isAdmin && <button onClick={() => removeAttendee(a.presenceId)} className="text-[#C08B8B]">x</button>}
                </span>
              );
            })}
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              <select value={presenceId} onChange={(e) => setPresenceId(e.target.value)} className="w-full rounded border border-[#E5E0D8] p-2 text-sm">
                <option value="">Ajouter une personne</option>
                {available.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.user ? `${p.user.prenom} ${p.user.nom}` : `${p.talent?.prenom || ""} ${p.talent?.nom || ""}`.trim()}
                  </option>
                ))}
              </select>
              <button onClick={addAttendee} className="rounded bg-[#1A1110] px-3 py-2 text-sm text-[#F5EBE0]">Ajouter</button>
            </div>
          )}
        </section>
        {isAdmin && (
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={deleteEvent} className="rounded border border-[#C08B8B] px-3 py-2 text-sm text-[#C08B8B]">Supprimer</button>
            <button onClick={() => setEditing(true)} className="rounded border border-[#E5E0D8] px-3 py-2 text-sm">Modifier</button>
          </div>
        )}
      </div>
    </Modal>
  );
}
