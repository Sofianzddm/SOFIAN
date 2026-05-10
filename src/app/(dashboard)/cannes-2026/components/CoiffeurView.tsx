"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import Modal from "./Modal";
import CoiffeurPrestationsSection from "./CoiffeurPrestationsSection";
import CoiffeurAvailabilitiesSection from "./CoiffeurAvailabilitiesSection";
import CoiffeurProfilePhotoSection from "./CoiffeurProfilePhotoSection";

type BookingLite = {
  id: string;
  status: string;
  talent: { id: string; prenom: string; nom: string } | null;
  guestName: string | null;
  guestEmail: string | null;
  notes: string | null;
  prestation: { id: string; title: string; slug: string } | null;
};

type SlotRow = {
  id: string;
  startsAt: string;
  endsAt: string;
  label: string | null;
  cancelledAt: string | null;
  booking: BookingLite | null;
};

function formatRange(isoStart: string, isoEnd: string) {
  try {
    const s = new Date(isoStart);
    const e = new Date(isoEnd);
    const dtf = new Intl.DateTimeFormat("fr-FR", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Paris",
    });
    const dtfTime = new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Paris",
    });
    return `${dtf.format(s)} — ${dtfTime.format(e)}`;
  } catch {
    return `${isoStart} → ${isoEnd}`;
  }
}

export default function CoiffeurView() {
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCancelledSlots, setShowCancelledSlots] = useState(false);

  const [dateStr, setDateStr] = useState("");
  const [timeStr, setTimeStr] = useState("10:00");
  const [durationMin, setDurationMin] = useState(45);
  const [slotLabel, setSlotLabel] = useState("");

  const [bookModalSlot, setBookModalSlot] = useState<SlotRow | null>(null);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cannes/coiffeur/schedule", { cache: "no-store" });
      if (!res.ok) {
        toast.error("Impossible de charger le planning coiffeur");
        return;
      }
      setSlots((await res.json()) as SlotRow[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!dateStr) {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      setDateStr(d.toISOString().slice(0, 10));
    }
  }, [dateStr]);

  const visibleSlots = useMemo(
    () => slots.filter((s) => showCancelledSlots || !s.cancelledAt),
    [slots, showCancelledSlots]
  );

  const createSlot = async () => {
    if (!dateStr || !timeStr) {
      toast.error("Date et heure requises");
      return;
    }
    const start = new Date(`${dateStr}T${timeStr}:00`);
    const end = new Date(start.getTime() + Math.max(15, durationMin) * 60_000);
    const res = await fetch("/api/cannes/coiffeur/slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        label: slotLabel.trim() || null,
      }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(err.error || "Creation impossible");
      return;
    }
    toast.success("Creneau créé");
    setSlotLabel("");
    void load();
  };

  const cancelSlot = async (id: string) => {
    if (!confirm("Retirer ce creneau ? (aucune reservation active)")) return;
    const res = await fetch(`/api/cannes/coiffeur/slots/${id}`, { method: "PATCH" });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(err.error || "Annulation impossible");
      return;
    }
    toast.success("Creneau annulé");
    void load();
  };

  const cancelBooking = async (bookingId: string) => {
    if (!confirm("Annuler cette reservation ?")) return;
    const res = await fetch(`/api/cannes/coiffeur/bookings/${bookingId}`, { method: "PATCH" });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(err.error || "Annulation impossible");
      return;
    }
    toast.success("Reservation annulée");
    void load();
  };

  const submitBooking = async () => {
    if (!bookModalSlot) return;
    const name = guestName.trim();
    const email = guestEmail.trim().toLowerCase();
    if (!name || !email) {
      toast.error("Nom et email sont requis");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Email invalide");
      return;
    }
    const body: Record<string, unknown> = {
      slotId: bookModalSlot.id,
      guestName: name,
      guestEmail: email,
      notes: notes.trim() || null,
    };
    const res = await fetch("/api/cannes/coiffeur/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(err.error || "Reservation impossible");
      return;
    }
    toast.success("Reservation enregistrée");
    setBookModalSlot(null);
    setNotes("");
    setGuestName("");
    setGuestEmail("");
    void load();
  };

  const openBook = (slot: SlotRow) => {
    setBookModalSlot(slot);
    setNotes("");
    setGuestName("");
    setGuestEmail("");
  };

  return (
    <div className="space-y-8">
      <CoiffeurProfilePhotoSection />
      <CoiffeurPrestationsSection />
      <CoiffeurAvailabilitiesSection />

      <div className="rounded-xl border border-[#E5E0D8] bg-white p-6 shadow-sm">
        <h2 className="font-[Spectral] text-2xl text-[#1A1110]">Nouveau creneau</h2>
        <p className="mt-2 text-sm text-[#1A1110]/60">
          Définis les plages où le coiffeur à l&apos;agence est disponible ; puis bloque un créneau libre avec le nom et l’email de
          la personne (sans compte).
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm text-[#1A1110]/80">
            Date
            <input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#E5E0D8] bg-[#FDFBF8] p-2 text-[#1A1110]"
            />
          </label>
          <label className="text-sm text-[#1A1110]/80">
            Heure de debut (France)
            <input
              type="time"
              value={timeStr}
              onChange={(e) => setTimeStr(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#E5E0D8] bg-[#FDFBF8] p-2 text-[#1A1110]"
            />
          </label>
          <label className="text-sm text-[#1A1110]/80">
            Duree (minutes)
            <input
              type="number"
              min={15}
              step={5}
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-[#E5E0D8] bg-[#FDFBF8] p-2 text-[#1A1110]"
            />
          </label>
          <label className="text-sm text-[#1A1110]/80">
            Libelle (optionnel)
            <input
              value={slotLabel}
              onChange={(e) => setSlotLabel(e.target.value)}
              placeholder="ex. brushing"
              className="mt-1 w-full rounded-lg border border-[#E5E0D8] bg-[#FDFBF8] p-2 text-[#1A1110]"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => void createSlot()}
          className="mt-4 rounded-lg bg-[#1A1110] px-4 py-2.5 text-sm font-medium text-[#F5EBE0] hover:bg-[#C08B8B]"
        >
          Ajouter le creneau
        </button>
      </div>

      <div className="rounded-xl border border-[#E5E0D8] bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-[Spectral] text-2xl text-[#1A1110]">Planning</h2>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-[#1A1110]/70">
            <input
              type="checkbox"
              checked={showCancelledSlots}
              onChange={(e) => setShowCancelledSlots(e.target.checked)}
              className="rounded border-[#E5E0D8]"
            />
            Afficher creneaux retirés
          </label>
        </div>

        {loading ? (
          <p className="mt-6 text-sm text-[#1A1110]/50">Chargement…</p>
        ) : visibleSlots.length === 0 ? (
          <p className="mt-6 text-sm text-[#1A1110]/50">Aucun creneau. Ajoute-en un ci-dessus.</p>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#E5E0D8] text-[#1A1110]/55">
                  <th className="pb-2 pr-4 font-medium">Creneau</th>
                  <th className="pb-2 pr-4 font-medium">Statut</th>
                  <th className="pb-2 pr-4 font-medium">Réservant</th>
                  <th className="pb-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleSlots.map((s) => {
                  const cancelled = !!s.cancelledAt;
                  const b = s.booking;
                  const confirmed = b?.status === "CONFIRMED";
                  const displayName =
                    b?.guestName?.trim() ||
                    (b?.talent ? `${b.talent.prenom} ${b.talent.nom}` : "—");
                  const displayEmail = b?.guestEmail?.trim() || "—";

                  return (
                    <tr
                      key={s.id}
                      className={`border-b border-[#F0E8E0] last:border-0 ${cancelled ? "opacity-50" : ""}`}
                    >
                      <td className="py-3 pr-4 text-[#1A1110]">
                        <div>{formatRange(s.startsAt, s.endsAt)}</div>
                        {b?.prestation && (
                          <div className="text-xs text-[#C08B8B]">{b.prestation.title}</div>
                        )}
                        {s.label && <div className="text-xs text-[#1A1110]/50">{s.label}</div>}
                      </td>
                      <td className="py-3 pr-4">
                        {cancelled ? (
                          <span className="rounded-full bg-[#E5E0D8] px-2 py-0.5 text-xs">Creneau retiré</span>
                        ) : confirmed ? (
                          <span className="rounded-full bg-[#C8F285]/80 px-2 py-0.5 text-xs text-[#1A1110]">
                            Réservé
                          </span>
                        ) : b?.status === "CANCELLED" ? (
                          <span className="rounded-full bg-[#F5EBE0] px-2 py-0.5 text-xs">Libre (ex-annulation)</span>
                        ) : (
                          <span className="rounded-full bg-[#E8F4FF] px-2 py-0.5 text-xs">Libre</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <div>{displayName}</div>
                        {displayEmail !== "—" && (
                          <div className="text-xs text-[#1A1110]/55">{displayEmail}</div>
                        )}
                        {b?.notes && <div className="mt-1 text-xs italic text-[#1A1110]/45">{b.notes}</div>}
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-2">
                          {!cancelled && !confirmed && (
                            <button
                              type="button"
                              onClick={() => openBook(s)}
                              className="rounded border border-[#1A1110] px-2 py-1 text-xs text-[#1A1110] hover:bg-[#1A1110] hover:text-[#F5EBE0]"
                            >
                              Réserver
                            </button>
                          )}
                          {!cancelled && confirmed && b && (
                            <button
                              type="button"
                              onClick={() => void cancelBooking(b.id)}
                              className="rounded border border-[#C08B8B] px-2 py-1 text-xs text-[#C08B8B] hover:bg-[#C08B8B] hover:text-white"
                            >
                              Annuler resa
                            </button>
                          )}
                          {!cancelled && !confirmed && (
                            <button
                              type="button"
                              onClick={() => void cancelSlot(s.id)}
                              className="rounded border border-[#E5E0D8] px-2 py-1 text-xs text-[#1A1110]/60 hover:bg-[#F5EBE0]"
                            >
                              Retirer creneau
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={!!bookModalSlot}
        title="Réserver (sans compte)"
        onClose={() => setBookModalSlot(null)}
      >
        {bookModalSlot && (
          <div className="space-y-4 text-sm text-[#1A1110]">
            <p className="text-[#1A1110]/65">{formatRange(bookModalSlot.startsAt, bookModalSlot.endsAt)}</p>
            <p className="text-xs text-[#1A1110]/50">
              Comme sur le lien public : nom affiché + email pour la confirmation et les changements éventuels.
            </p>
            <label className="block">
              Nom
              <input
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                className="mt-1 w-full rounded border border-[#E5E0D8] p-2"
              />
            </label>
            <label className="block">
              Email
              <input
                type="email"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                className="mt-1 w-full rounded border border-[#E5E0D8] p-2"
              />
            </label>
            <label className="block">
              Notes (optionnel)
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded border border-[#E5E0D8] p-2"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setBookModalSlot(null)}
                className="rounded border border-[#E5E0D8] px-3 py-2 text-xs"
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={() => void submitBooking()}
                className="rounded bg-[#1A1110] px-3 py-2 text-xs text-[#F5EBE0] hover:bg-[#C08B8B]"
              >
                Enregistrer
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
