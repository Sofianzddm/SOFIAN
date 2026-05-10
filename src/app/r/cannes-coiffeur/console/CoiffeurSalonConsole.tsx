"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fr } from "date-fns/locale";
import { formatInTimeZone } from "date-fns-tz";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { toast, Toaster } from "sonner";

import CoiffeurAvailabilitiesSection from "@/app/(dashboard)/cannes-2026/components/CoiffeurAvailabilitiesSection";
import CoiffeurPrestationsSection from "@/app/(dashboard)/cannes-2026/components/CoiffeurPrestationsSection";
import CoiffeurProfilePhotoSection from "@/app/(dashboard)/cannes-2026/components/CoiffeurProfilePhotoSection";
import Modal from "@/app/(dashboard)/cannes-2026/components/Modal";
import { GlowUpLogo } from "@/components/ui/logo";
import { PARIS_TZ } from "@/lib/cannes-coiffeur/formatParisTime";

import CoiffeurSalonWeekAgenda, {
  computeWeekParisDays,
  type WeekAgendaSlot,
} from "./CoiffeurSalonWeekAgenda";

function formatRange(isoStart: string, isoEnd: string) {
  try {
    const s = new Date(isoStart);
    const e = new Date(isoEnd);
    return `${formatInTimeZone(s, PARIS_TZ, "EEE d MMM · HH:mm", { locale: fr })} → ${formatInTimeZone(e, PARIS_TZ, "HH:mm")}`;
  } catch {
    return `${isoStart} → ${isoEnd}`;
  }
}

/** Liste type planning dashboard : « mar. 12 mai, 10:00 — 10:30 ». */
function formatRangeListe(isoStart: string, isoEnd: string) {
  try {
    const s = new Date(isoStart);
    const e = new Date(isoEnd);
    let datePart = formatInTimeZone(s, PARIS_TZ, "EEE d MMM", { locale: fr });
    datePart = datePart.charAt(0).toUpperCase() + datePart.slice(1);
    return `${datePart}, ${formatInTimeZone(s, PARIS_TZ, "HH:mm")} — ${formatInTimeZone(e, PARIS_TZ, "HH:mm")}`;
  } catch {
    return `${isoStart} → ${isoEnd}`;
  }
}

type Tab = "agenda" | "prestations" | "dispos" | "photo";

type Props = {
  displayName: string;
  /** Mot de passe salon activé (`CANNES_COIFFEUR_CONSOLE_PASSWORD`) — affiche le bouton pour effacer le cookie. */
  salonPasswordActive?: boolean;
};

const ENV_COIFFEUR_PROFILE_FALLBACK =
  typeof process.env.NEXT_PUBLIC_CANNES_COIFFEUR_PROFILE_IMAGE_URL === "string"
    ? process.env.NEXT_PUBLIC_CANNES_COIFFEUR_PROFILE_IMAGE_URL.trim()
    : "";

export default function CoiffeurSalonConsole({ displayName, salonPasswordActive = false }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("agenda");
  /** `undefined` = chargement ; photo API ou null après réponse */
  const [profilePhotoApi, setProfilePhotoApi] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/cannes/coiffeur/profile-photo", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const j = (await res.json().catch(() => ({}))) as { photoUrl?: string | null };
        if (cancelled) return;
        const u = j?.photoUrl;
        setProfilePhotoApi(typeof u === "string" && u.trim() ? u.trim() : null);
      })
      .catch(() => {
        if (!cancelled) setProfilePhotoApi(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const portraitSrc =
    profilePhotoApi !== undefined
      ? (profilePhotoApi || ENV_COIFFEUR_PROFILE_FALLBACK)
      : ENV_COIFFEUR_PROFILE_FALLBACK;
  const [slots, setSlots] = useState<WeekAgendaSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [showCancelledSlots, setShowCancelledSlots] = useState(false);
  /** Dans l’onglet Agenda : grille semaine ou tableau liste. */
  const [planningVue, setPlanningVue] = useState<"semaine" | "liste">("semaine");

  const [dateStr, setDateStr] = useState("");
  const [timeStr, setTimeStr] = useState("10:00");
  const [durationMin, setDurationMin] = useState(45);
  const [slotLabel, setSlotLabel] = useState("");

  const [detailSlot, setDetailSlot] = useState<WeekAgendaSlot | null>(null);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cannes/coiffeur/schedule", { cache: "no-store" });
      if (!res.ok) {
        toast.error("Impossible de charger le planning");
        return;
      }
      setSlots((await res.json()) as WeekAgendaSlot[]);
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

  const weekLabel = useMemo(() => {
    const days = computeWeekParisDays(new Date(), weekOffset);
    const a = days[0].ymd;
    const b = days[6].ymd;
    return `${a.slice(8, 10)}/${a.slice(5, 7)} – ${b.slice(8, 10)}/${b.slice(5, 7)}/${b.slice(0, 4)}`;
  }, [weekOffset]);

  const visibleSlots = useMemo(
    () => slots.filter((s) => showCancelledSlots || !s.cancelledAt),
    [slots, showCancelledSlots]
  );

  const listeRows = useMemo(
    () => [...visibleSlots].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
    [visibleSlots]
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
      toast.error(err.error || "Création impossible");
      return;
    }
    toast.success("Créneau créé");
    setSlotLabel("");
    void load();
  };

  const cancelSlot = async (id: string) => {
    if (!confirm("Retirer ce créneau ? (aucune réservation active)")) return;
    const res = await fetch(`/api/cannes/coiffeur/slots/${id}`, { method: "PATCH" });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(err.error || "Annulation impossible");
      return;
    }
    toast.success("Créneau retiré");
    setDetailSlot(null);
    void load();
  };

  const cancelBooking = async (bookingId: string) => {
    if (!confirm("Annuler cette réservation ?")) return;
    const res = await fetch(`/api/cannes/coiffeur/bookings/${bookingId}`, { method: "PATCH" });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(err.error || "Annulation impossible");
      return;
    }
    toast.success("Réservation annulée");
    setDetailSlot(null);
    void load();
  };

  const submitBooking = async () => {
    if (!detailSlot) return;
    const name = guestName.trim();
    const email = guestEmail.trim().toLowerCase();
    if (!name || !email) {
      toast.error("Nom et email requis");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Email invalide");
      return;
    }
    const res = await fetch("/api/cannes/coiffeur/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slotId: detailSlot.id,
        guestName: name,
        guestEmail: email,
        notes: notes.trim() || null,
      }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(err.error || "Réservation impossible");
      return;
    }
    toast.success("Réservation enregistrée");
    setDetailSlot(null);
    setGuestName("");
    setGuestEmail("");
    setNotes("");
    void load();
  };

  const openDetail = (s: WeekAgendaSlot) => {
    setDetailSlot(s);
    setGuestName("");
    setGuestEmail("");
    setNotes("");
  };

  return (
    <div className="flex min-h-dvh min-h-screen flex-col bg-gradient-login pt-[max(0.75rem,env(safe-area-inset-top,0px))] pb-[max(5.5rem,env(safe-area-inset-bottom,0px))] pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] sm:py-10">
      <Toaster
        position="top-center"
        richColors
        offset={16}
        mobileOffset={{
          top: "max(12px, calc(env(safe-area-inset-top, 0px) + 8px))",
        }}
      />
      <div className="mx-auto flex w-full max-w-6xl animate-fade-in flex-col gap-6 sm:gap-8 md:gap-10">
        <header className="flex flex-col gap-5 sm:gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col items-center gap-4 sm:items-start md:flex-row md:items-center md:gap-5">
            <GlowUpLogo className="h-auto w-36 shrink-0 sm:w-44 lg:w-52" variant="light" />
            <div className="flex w-full min-w-0 flex-1 items-center gap-3 sm:w-auto sm:items-start md:items-center md:gap-4">
              <button
                type="button"
                aria-label="Photo publique : ouvrir l’onglet Photo salon pour la modifier"
                title="Photo affichée sur la page publique — modifier dans l’onglet « Photo salon »"
                onClick={() => setTab("photo")}
                className={`group shrink-0 rounded-xl border bg-black/20 transition hover:border-glowup-rose/45 hover:bg-black/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-glowup-rose-light/60 ${
                  portraitSrc ? "border-glowup-rose/20 p-0" : "border-glowup-rose/15"
                }`}
              >
                {portraitSrc ? (
                  <img
                    src={portraitSrc}
                    alt=""
                    className="h-16 w-16 rounded-xl object-cover sm:h-20 sm:w-20"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div
                    className="flex h-16 w-16 items-center justify-center rounded-xl text-xl text-glowup-lace/45 sm:h-20 sm:w-20"
                    aria-hidden
                  >
                    ✂
                  </div>
                )}
              </button>
              <div className="min-w-0 text-center sm:text-left">
                <p className="text-xs uppercase tracking-[0.22em] text-glowup-lace/50">Cannes 2026 · Salon</p>
                <h1 className="mt-1 font-[Spectral] text-[1.35rem] font-semibold leading-snug text-glowup-lace sm:text-2xl lg:text-3xl">
                  Ton espace coiffeur
                </h1>
                <p className="mt-2 mx-auto max-w-md text-sm leading-relaxed text-glowup-lace/65 sm:mx-0">
                  Bonjour {displayName}&nbsp;! Gère prestations, disponibilités, photo publique et crénaux depuis une vue agenda.
                </p>
              </div>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end lg:max-w-none lg:shrink-0">
            {salonPasswordActive && (
              <button
                type="button"
                onClick={() => {
                  void (async () => {
                    await fetch("/api/cannes/coiffeur/console-unlock", { method: "DELETE" });
                    router.refresh();
                  })();
                }}
                className="inline-flex w-full items-center justify-center rounded-xl border border-white/15 bg-black/20 px-4 py-2.5 text-center text-sm text-glowup-lace/75 backdrop-blur-sm transition hover:bg-black/35 hover:text-glowup-lace sm:w-auto"
              >
                Oublier ce poste (redemander le code)
              </button>
            )}
            <Link
              href="/cannes-2026"
              className="inline-flex w-full items-center justify-center rounded-xl border border-glowup-rose/40 bg-black/25 px-4 py-2.5 text-sm text-glowup-lace/90 backdrop-blur-sm transition hover:border-glowup-rose hover:bg-black/35 sm:w-auto"
            >
              Retour espace Cannes
            </Link>
          </div>
        </header>

        <nav
          className="flex gap-2 overflow-x-auto pb-0.5 [-webkit-overflow-scrolling:touch] sm:flex-wrap sm:overflow-visible sm:pb-0 [&>button]:shrink-0"
          aria-label="Sections de la console"
        >
          {(
            [
              ["agenda", "Agenda"],
              ["prestations", "Prestations"],
              ["dispos", "Disponibilités"],
              ["photo", "Photo salon"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-xl border px-3.5 py-2.5 text-sm font-medium transition sm:px-4 ${
                tab === key
                  ? "border-glowup-rose bg-glowup-rose/30 text-glowup-lace shadow-glow"
                  : "border-glowup-rose/25 bg-black/20 text-glowup-lace/75 hover:bg-black/35"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {tab === "agenda" && (
          <>
            <section className="glass-dark rounded-2xl p-4 shadow-2xl sm:p-6 md:p-7">
              <div className="flex flex-col gap-3 border-b border-glowup-rose/25 pb-4 sm:gap-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <div className="flex w-full max-w-full flex-wrap items-center gap-2 rounded-xl border border-glowup-rose/25 bg-black/20 p-1 sm:w-auto">
                    <button
                      type="button"
                      onClick={() => setPlanningVue("semaine")}
                      className={`rounded-lg px-3 py-2 text-xs font-medium transition sm:text-sm ${
                        planningVue === "semaine"
                          ? "bg-glowup-rose/40 text-glowup-lace"
                          : "text-glowup-lace/65 hover:bg-white/5"
                      }`}
                    >
                      Vue semaine
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlanningVue("liste")}
                      className={`rounded-lg px-3 py-2 text-xs font-medium transition sm:text-sm ${
                        planningVue === "liste"
                          ? "bg-glowup-rose/40 text-glowup-lace"
                          : "text-glowup-lace/65 hover:bg-white/5"
                      }`}
                    >
                      Vue liste
                    </button>
                  </div>
                  <label className="flex max-w-full cursor-pointer items-start gap-2 text-sm text-glowup-lace/70 sm:items-center">
                    <input
                      type="checkbox"
                      checked={showCancelledSlots}
                      onChange={(e) => setShowCancelledSlots(e.target.checked)}
                      className="rounded border-glowup-rose/40 bg-black/30"
                    />
                    Afficher créneaux retirés
                  </label>
                </div>

                {planningVue === "semaine" ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
                    <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                      <button
                        type="button"
                        onClick={() => setWeekOffset((w) => w - 1)}
                        className="min-h-[44px] min-w-[44px] rounded-lg border border-glowup-rose/35 p-2 text-glowup-lace hover:bg-glowup-rose/20"
                        aria-label="Semaine précédente"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setWeekOffset((w) => w + 1)}
                        className="min-h-[44px] min-w-[44px] rounded-lg border border-glowup-rose/35 p-2 text-glowup-lace hover:bg-glowup-rose/20"
                        aria-label="Semaine suivante"
                      >
                        <ChevronRight className="h-5 w-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setWeekOffset(0)}
                        className="min-h-[44px] rounded-lg border border-white/15 px-3 py-2 text-xs text-glowup-lace/80 hover:bg-white/10 sm:min-h-0 sm:py-1.5"
                      >
                        Aujourd’hui
                      </button>
                    </div>
                    <span className="text-center font-[Spectral] text-base leading-tight text-glowup-lace sm:text-left sm:text-lg">
                      Semaine du {weekLabel}
                    </span>
                  </div>
                ) : null}
              </div>

              {loading ? (
                <div className="flex justify-center py-16 text-glowup-lace/50">
                  <Loader2 className="h-9 w-9 animate-spin" />
                </div>
              ) : planningVue === "semaine" ? (
                <div className="pt-6">
                  <CoiffeurSalonWeekAgenda
                    weekOffset={weekOffset}
                    slots={visibleSlots}
                    showCancelled={showCancelledSlots}
                    onSelectSlot={openDetail}
                  />
                </div>
              ) : (
                <div className="pt-6">
                  <div className="overflow-hidden rounded-2xl border border-[#E5E0D8] bg-[#FDFBF8] shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E0D8] px-3 py-3 sm:px-5 sm:py-4">
                      <h2 className="font-[Spectral] text-lg text-[#1A1110] sm:text-xl">Planning</h2>
                    </div>
                    {listeRows.length === 0 ? (
                      <p className="px-3 py-8 text-center text-sm text-[#1A1110]/50 sm:px-5 sm:py-10">
                        Aucun créneau à afficher. Ajoute-en un avec « Créneau rapide » ci‑dessous.
                      </p>
                    ) : (
                      <div className="overflow-x-auto overscroll-x-contain px-3 pb-4 [-webkit-overflow-scrolling:touch] sm:px-5 sm:pb-5">
                        <table className="w-full min-w-[520px] text-left text-xs sm:min-w-[640px] sm:text-sm">
                          <thead>
                            <tr className="border-b border-[#E5E0D8] text-[#1A1110]/55">
                              <th className="pb-2 pr-4 font-medium">Créneau</th>
                              <th className="pb-2 pr-4 font-medium">Statut</th>
                              <th className="pb-2 pr-4 font-medium">Réservant</th>
                              <th className="pb-2 font-medium">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {listeRows.map((s) => {
                              const cancelled = !!s.cancelledAt;
                              const b = s.booking;
                              const confirmed = b?.status === "CONFIRMED";
                              const displayNameCell =
                                b?.guestName?.trim() ||
                                (b?.talent ? `${b.talent.prenom} ${b.talent.nom}` : "—");
                              const displayEmail = b?.guestEmail?.trim() || "—";
                              const prestLabel = b?.prestation?.title || s.label;

                              return (
                                <tr
                                  key={s.id}
                                  className={`border-b border-[#F0E8E0] last:border-0 ${cancelled ? "opacity-50" : ""}`}
                                >
                                  <td className="py-3 pr-4 text-[#1A1110]">
                                    <div className="font-medium">{formatRangeListe(s.startsAt, s.endsAt)}</div>
                                    {prestLabel ? (
                                      <div className="mt-0.5 text-xs text-[#C08B8B]">{prestLabel}</div>
                                    ) : null}
                                  </td>
                                  <td className="py-3 pr-4">
                                    {cancelled ? (
                                      <span className="rounded-full bg-[#E5E0D8] px-2 py-0.5 text-xs">
                                        Créneau retiré
                                      </span>
                                    ) : confirmed ? (
                                      <span className="rounded-full bg-[#C8F285]/80 px-2 py-0.5 text-xs text-[#1A1110]">
                                        Réservé
                                      </span>
                                    ) : b?.status === "CANCELLED" ? (
                                      <span className="rounded-full bg-[#F5EBE0] px-2 py-0.5 text-xs">
                                        Libre (ex-annulation)
                                      </span>
                                    ) : (
                                      <span className="rounded-full bg-[#E8F4FF] px-2 py-0.5 text-xs">Libre</span>
                                    )}
                                  </td>
                                  <td className="py-3 pr-4">
                                    <div>{displayNameCell}</div>
                                    {displayEmail !== "—" ? (
                                      <div className="text-xs text-[#1A1110]/55">{displayEmail}</div>
                                    ) : null}
                                    {b?.notes ? (
                                      <div className="mt-1 text-xs italic text-[#1A1110]/45">{b.notes}</div>
                                    ) : null}
                                  </td>
                                  <td className="py-3">
                                    <div className="flex flex-wrap gap-2">
                                      {!cancelled && !confirmed && (
                                        <button
                                          type="button"
                                          onClick={() => openDetail(s)}
                                          className="rounded border border-[#1A1110] px-2 py-1 text-xs text-[#1A1110] hover:bg-[#1A1110] hover:text-[#F5EBE0]"
                                        >
                                          Réserver
                                        </button>
                                      )}
                                      {!cancelled && confirmed && b ? (
                                        <button
                                          type="button"
                                          onClick={() => void cancelBooking(b.id)}
                                          className="rounded border border-[#C08B8B] px-2 py-1 text-xs text-[#C08B8B] hover:bg-[#C08B8B] hover:text-white"
                                        >
                                          Annuler résa
                                        </button>
                                      ) : null}
                                      {!cancelled && !confirmed ? (
                                        <button
                                          type="button"
                                          onClick={() => void cancelSlot(s.id)}
                                          className="rounded border border-[#E5E0D8] px-2 py-1 text-xs text-[#1A1110]/60 hover:bg-[#F5EBE0]"
                                        >
                                          Retirer créneau
                                        </button>
                                      ) : null}
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
                </div>
              )}
            </section>

            <section className="glass-dark rounded-2xl p-4 shadow-2xl sm:p-6 md:p-7">
              <h2 className="font-[Spectral] text-lg text-glowup-lace sm:text-xl">Créneau rapide</h2>
              <p className="mt-2 text-sm text-glowup-lace/60">
                Crée un bloc horaire puis clique dessus dans l’agenda pour y attacher une réservation (nom + email).
              </p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
                <label className="text-sm text-glowup-lace/85">
                  Date
                  <input
                    type="date"
                    value={dateStr}
                    onChange={(e) => setDateStr(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-glowup-rose/35 bg-black/35 px-3 py-2 text-glowup-lace outline-none ring-glowup-rose/30 focus:ring-2"
                  />
                </label>
                <label className="text-sm text-glowup-lace/85">
                  Début (France)
                  <input
                    type="time"
                    value={timeStr}
                    onChange={(e) => setTimeStr(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-glowup-rose/35 bg-black/35 px-3 py-2 text-glowup-lace outline-none ring-glowup-rose/30 focus:ring-2"
                  />
                </label>
                <label className="text-sm text-glowup-lace/85">
                  Durée (min)
                  <input
                    type="number"
                    min={15}
                    step={5}
                    value={durationMin}
                    onChange={(e) => setDurationMin(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-glowup-rose/35 bg-black/35 px-3 py-2 text-glowup-lace outline-none ring-glowup-rose/30 focus:ring-2"
                  />
                </label>
                <label className="text-sm text-glowup-lace/85 lg:col-span-2">
                  Libellé (optionnel)
                  <input
                    value={slotLabel}
                    onChange={(e) => setSlotLabel(e.target.value)}
                    placeholder="ex. brushing express"
                    className="mt-1 w-full rounded-lg border border-glowup-rose/35 bg-black/35 px-3 py-2 text-glowup-lace placeholder:text-glowup-lace/35 outline-none ring-glowup-rose/30 focus:ring-2"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() => void createSlot()}
                className="mt-5 min-h-[44px] w-full rounded-xl bg-glowup-rose px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-glowup-rose-dark sm:w-auto"
              >
                Ajouter le créneau
              </button>
            </section>
          </>
        )}

        {tab !== "agenda" && (
          <section className="rounded-2xl border border-glowup-rose/25 bg-[#FDFBF8]/96 p-3 shadow-xl sm:p-5 md:p-6">
            {tab === "prestations" && <CoiffeurPrestationsSection />}
            {tab === "dispos" && <CoiffeurAvailabilitiesSection />}
            {tab === "photo" && <CoiffeurProfilePhotoSection />}
          </section>
        )}

        <p className="text-center text-sm text-glowup-lace/40">
          © 2026 Glow Up Agence · Heures affichées en fuseau Paris
        </p>
      </div>

      <Modal
        open={!!detailSlot}
        title={detailSlot ? formatRange(detailSlot.startsAt, detailSlot.endsAt) : ""}
        onClose={() => setDetailSlot(null)}
      >
        {detailSlot && (
          <div className="space-y-4 text-sm text-[#1A1110]">
            {detailSlot.cancelledAt && (
              <p className="rounded-lg bg-[#EEE] px-3 py-2 text-xs text-[#664]">
                Ce créneau a été retiré de l&apos;agenda exporté.
              </p>
            )}
            {detailSlot.booking?.prestation && (
              <p className="text-[#C08B8B] font-medium">{detailSlot.booking.prestation.title}</p>
            )}
            {detailSlot.label && !detailSlot.booking?.prestation && (
              <p className="text-[#1A1110]/60">{detailSlot.label}</p>
            )}

            {!detailSlot.cancelledAt && detailSlot.booking?.status === "CONFIRMED" && detailSlot.booking && (
              <>
                <div>
                  <p className="text-xs uppercase tracking-wide text-[#1A1110]/45">Réservant</p>
                  <p className="font-medium">
                    {detailSlot.booking.guestName ||
                      (detailSlot.booking.talent
                        ? `${detailSlot.booking.talent.prenom} ${detailSlot.booking.talent.nom}`
                        : "—")}
                  </p>
                  {detailSlot.booking.guestEmail && (
                    <p className="text-xs text-[#1A1110]/60">{detailSlot.booking.guestEmail}</p>
                  )}
                  {detailSlot.booking.notes && (
                    <p className="mt-2 text-xs italic text-[#1A1110]/50">{detailSlot.booking.notes}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void cancelBooking(detailSlot.booking!.id)}
                  className="w-full rounded-lg border border-[#C08B8B] px-4 py-2 text-[#C08B8B] hover:bg-[#FFF3F3]"
                >
                  Annuler la réservation (email envoyé)
                </button>
              </>
            )}

            {!detailSlot.cancelledAt && detailSlot.booking?.status !== "CONFIRMED" && (
              <>
                <p className="text-[#1A1110]/60">Ce créneau est libre. Réservation sans compte :</p>
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
                <button
                  type="button"
                  onClick={() => void submitBooking()}
                  className="w-full rounded-lg bg-[#1A1110] py-2.5 text-[#F5EBE0] hover:bg-[#C08B8B]"
                >
                  Enregistrer la réservation
                </button>
                <button
                  type="button"
                  onClick={() => void cancelSlot(detailSlot.id)}
                  className="w-full rounded-lg border border-[#E5E0D8] py-2 text-[#1A1110]/60 hover:bg-[#F5EBE0]"
                >
                  Retirer ce créneau vide
                </button>
              </>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setDetailSlot(null)}
                className="rounded border border-[#E5E0D8] px-4 py-2 text-xs"
              >
                Fermer
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
