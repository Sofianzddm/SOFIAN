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

type TalentOption = {
  id: string;
  name: string;
};

export default function EventDetailModal({ event, presences, isAdmin, onClose }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [localAttendees, setLocalAttendees] = useState(event?.attendees || []);
  const [inviteValue, setInviteValue] = useState("");
  const [talentOptions, setTalentOptions] = useState<TalentOption[]>([]);

  const currentEvent = event;
  const currentEventId = currentEvent?.id;
  const badge = currentEvent ? TYPE_COLORS[currentEvent.type] || TYPE_COLORS.AUTRE : TYPE_COLORS.AUTRE;

  useEffect(() => {
    setLocalAttendees(event?.attendees || []);
  }, [event]);

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/cannes/talents-list")
      .then(async (res) => (res.ok ? res.json() : []))
      .then((data) => {
        setTalentOptions(
          (Array.isArray(data) ? data : []).map((t: { id: string; name: string }) => ({
            id: t.id,
            name: t.name,
          }))
        );
      })
      .catch(() => setTalentOptions([]));
  }, [isAdmin]);

  const available = useMemo(() => {
    if (!currentEvent) return [];
    const eventDay = new Date(currentEvent.date).toISOString().slice(0, 10);
    const existing = new Set(localAttendees.map((a) => a.presenceId));
    return presences.filter((p) => {
      if (existing.has(p.id)) return false;
      const startDay = new Date(p.arrivalDate).toISOString().slice(0, 10);
      const endDay = new Date(p.departureDate).toISOString().slice(0, 10);
      return startDay <= eventDay && endDay >= eventDay;
    });
  }, [currentEvent, localAttendees, presences]);

  const availableTalents = useMemo(() => {
    const attendeeTalentIds = new Set(
      localAttendees
        .map((a) => a.presence.talent?.id)
        .filter((id): id is string => Boolean(id))
    );
    return talentOptions.filter((t) => !attendeeTalentIds.has(t.id));
  }, [localAttendees, talentOptions]);

  if (!currentEvent) return null;

  async function addAttendee() {
    if (!inviteValue || !currentEventId) return;
    const [kind, value] = inviteValue.split(":");
    if (!kind || !value) return;

    try {
      let res: Response;

      if (kind === "presence") {
        const selected = presences.find((p) => p.id === value);
        if (!selected) return;

        setLocalAttendees((prev) => [...prev, { id: `tmp-${value}`, presenceId: value, presence: selected }]);
        res = await fetch(`/api/cannes/events/${currentEventId}/attendees`, {
          method: "POST",
          body: JSON.stringify({ presenceId: value }),
        });
      } else if (kind === "talent") {
        const eventDate = new Date(currentEvent.date).toISOString().slice(0, 10);
        res = await fetch(`/api/cannes/events/${currentEventId}/attendees`, {
          method: "POST",
          body: JSON.stringify({ talentId: value, eventDate }),
        });
      } else {
        return;
      }

      if (!res.ok) throw new Error();
      toast.success("Participant ajoute");
      setInviteValue("");
      router.refresh();
    } catch {
      toast.error("Erreur lors de l'ajout");
      if (kind === "presence") {
        setLocalAttendees((prev) => prev.filter((a) => a.presenceId !== value));
      }
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
              <select value={inviteValue} onChange={(e) => setInviteValue(e.target.value)} className="w-full rounded border border-[#E5E0D8] p-2 text-sm">
                <option value="">Ajouter une personne</option>
                {availableTalents.length > 0 && (
                  <optgroup label="Tous les talents">
                    {availableTalents.map((t) => (
                      <option key={`talent-${t.id}`} value={`talent:${t.id}`}>
                        {t.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {available.length > 0 && (
                  <optgroup label="Personnes deja sur place">
                    {available.map((p) => (
                      <option key={`presence-${p.id}`} value={`presence:${p.id}`}>
                        {p.user
                          ? `${p.user.prenom} ${p.user.nom}`
                          : `${p.talent?.prenom || ""} ${p.talent?.nom || ""}`.trim()}
                      </option>
                    ))}
                  </optgroup>
                )}
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
