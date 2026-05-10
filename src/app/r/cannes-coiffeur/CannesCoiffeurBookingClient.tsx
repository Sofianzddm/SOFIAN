"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DayPicker } from "react-day-picker";
import { fr } from "date-fns/locale";
import { formatInTimeZone } from "date-fns-tz";
import { GlowUpLogo } from "@/components/ui/logo";
import { Loader2 } from "lucide-react";
import CannesCoiffeurIntro from "@/components/cannes-coiffeur/CannesCoiffeurIntro";

import "react-day-picker/style.css";
import "./coiffeur-public-picker.css";

import { formatParisTime, PARIS_TZ } from "@/lib/cannes-coiffeur/formatParisTime";
import { CoiffeurPublicProfileEncart } from "@/app/r/cannes-coiffeur/CoiffeurPublicProfileEncart";

type PrestationPub = {
  slug: string;
  title: string;
  durationMinutes: number;
  bufferMinutes: number;
  description: string | null;
};

type ApiSlot = {
  startsAt: string;
  endsAt: string;
  label: string | null;
  prestationSlug: string;
  prestationTitle: string;
  displayStartParis: string;
};

function ymdParis(d: Date): string {
  return formatInTimeZone(d, PARIS_TZ, "yyyy-MM-dd");
}

const MAY_2026 = new Date(2026, 4, 1);
const MAY_2026_END = new Date(2026, 4, 31);

const rdpStyle = {
  ["--rdp-accent-color"]: "#b06f70",
  ["--rdp-accent-background-color"]: "rgba(176, 111, 112, 0.22)",
} as React.CSSProperties;

export default function CannesCoiffeurBookingClient({
  seedPortraitUrl,
}: {
  seedPortraitUrl: string | null;
}) {
  const [introDone, setIntroDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [prestationsPub, setPrestationsPub] = useState<PrestationPub[]>([]);
  const [prestationsLoaded, setPrestationsLoaded] = useState(false);
  const [prestationSlug, setPrestationSlug] = useState<string | null>(null);
  const [datesLoaded, setDatesLoaded] = useState(false);
  const [availableDates, setAvailableDates] = useState<Set<string>>(new Set());
  const [selectedDay, setSelectedDay] = useState<Date | undefined>(undefined);

  const [slotsLoading, setSlotsLoading] = useState(false);
  const [daySlots, setDaySlots] = useState<ApiSlot[]>([]);
  const [pickedSlot, setPickedSlot] = useState<ApiSlot | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [bookCooldownUntil, setBookCooldownUntil] = useState<number>(0);
  const [bookCooldownLeftSec, setBookCooldownLeftSec] = useState(0);

  const [done, setDone] = useState(false);
  const [recap, setRecap] = useState("");

  useEffect(() => {
    if (!bookCooldownUntil) {
      setBookCooldownLeftSec(0);
      return;
    }
    const tick = () => {
      const leftMs = Math.max(0, bookCooldownUntil - Date.now());
      setBookCooldownLeftSec(Math.ceil(leftMs / 1000));
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [bookCooldownUntil]);

  const selectPrestation = useCallback((slug: string) => {
    setPrestationSlug(slug);
    setSelectedDay(undefined);
    setDaySlots([]);
    setPickedSlot(null);
    setErr(null);
  }, []);

  /** Catalogue des prestations réservables (durées affichées sur cette page). */
  useEffect(() => {
    let cancelled = false;
    setPrestationsLoaded(false);
    void (async () => {
      setErr(null);
      try {
        const res = await fetch("/api/pub/cannes-coiffeur/prestations", {
          cache: "no-store",
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          if (!cancelled) setErr(j.error || "Non autorisé");
          if (!cancelled) setPrestationsLoaded(true);
          return;
        }
        const data = (await res.json()) as { prestations: PrestationPub[] };
        const list = data.prestations ?? [];
        if (!cancelled) {
          setPrestationsPub(list);
          setPrestationsLoaded(true);
          if (list.length === 1) setPrestationSlug(list[0].slug);
          if (list.length === 0) {
            setErr("Aucune prestation n’est encore proposée — reviens plus tard ou contacte Glow Up.");
          }
        }
      } catch {
        if (!cancelled) setErr("Erreur réseau");
        if (!cancelled) setPrestationsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Jours avec au moins un créneau libre pour la prestation choisie. */
  useEffect(() => {
    if (!prestationSlug) {
      setDatesLoaded(false);
      setAvailableDates(new Set());
      return;
    }
    let cancelled = false;
    setDatesLoaded(false);
    void (async () => {
      try {
        const res = await fetch(
          `/api/pub/cannes-coiffeur/available-dates?prestation=${encodeURIComponent(prestationSlug)}`,
          { cache: "no-store" }
        );
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          if (!cancelled) setErr(j.error || "Impossible de charger le calendrier");
          if (!cancelled) setDatesLoaded(true);
          return;
        }
        const data = ((await res.json()) as { dates: string[] }).dates;
        if (!cancelled) {
          setAvailableDates(new Set(data));
          setDatesLoaded(true);
        }
      } catch {
        if (!cancelled) setErr("Erreur réseau");
        if (!cancelled) setDatesLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prestationSlug]);

  useEffect(() => {
    if (!selectedDay || !prestationSlug) {
      setDaySlots([]);
      setPickedSlot(null);
      return;
    }
    const ymd = ymdParis(selectedDay);
    let cancelled = false;
    setSlotsLoading(true);
    void (async () => {
      try {
        const res = await fetch(
          `/api/pub/cannes-coiffeur/availability?prestation=${encodeURIComponent(prestationSlug)}&date=${encodeURIComponent(ymd)}`,
          { cache: "no-store" }
        );
        if (!res.ok) {
          if (!cancelled) setDaySlots([]);
          return;
        }
        const raw = ((await res.json()) as { slots: ApiSlot[] }).slots;
        if (!cancelled) setDaySlots(raw);
      } finally {
        if (!cancelled) setSlotsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedDay, prestationSlug]);

  async function reloadDaySlots() {
    if (!selectedDay || !prestationSlug) return;
    const ymd = ymdParis(selectedDay);
    const res = await fetch(
      `/api/pub/cannes-coiffeur/availability?prestation=${encodeURIComponent(prestationSlug)}&date=${encodeURIComponent(ymd)}`,
      { cache: "no-store" }
    );
    if (res.ok) {
      const raw = ((await res.json()) as { slots: ApiSlot[] }).slots;
      setDaySlots(raw);
    }
    setPickedSlot(null);
  }

  async function confirmSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pickedSlot || !prestationSlug) return;
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch("/api/pub/cannes-coiffeur/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prestationSlug,
          startsAt: pickedSlot.startsAt,
          endsAt: pickedSlot.endsAt,
          guestName: name.trim(),
          guestEmail: email.trim(),
          note: note.trim() || null,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; recap?: string };

      if (res.status === 409) {
        setErr(j.error || "Ce créneau vient d’être pris. Choisis-en un autre ci-dessous.");
        await reloadDaySlots();
        return;
      }
      if (res.status === 429) {
        setErr(j.error || "Trop de tentatives. Réessaie dans quelques minutes.");
        setBookCooldownUntil(Date.now() + 10_000);
        return;
      }
      if (!res.ok) {
        setErr(j.error || "Impossible de confirmer");
        return;
      }
      const fullRecap =
        j.recap ||
        `${pickedSlot.prestationTitle} · ${formatParisTime(new Date(pickedSlot.startsAt), "EEEE d MMMM yyyy 'à' HH:mm")} → ${formatParisTime(new Date(pickedSlot.endsAt), "HH:mm")} (Paris)`;
      setRecap(fullRecap);
      setDone(true);
      setPickedSlot(null);
      setName("");
      setEmail("");
      setNote("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <CannesCoiffeurIntro onFinish={() => setIntroDone(true)} />
      <main
        className="flex min-h-dvh min-h-screen flex-col overflow-x-hidden bg-gradient-login pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:py-12"
        style={{ pointerEvents: introDone ? "auto" : "none" }}
      >
        <div className="animate-fade-in mx-auto flex w-full min-w-0 max-w-4xl flex-col gap-6 sm:gap-8 md:gap-10">
        <div className="flex justify-center px-1 pt-2 sm:pt-0">
          <GlowUpLogo className="h-auto w-40 shrink-0 sm:w-52 md:w-64" variant="light" />
        </div>

        <div className="min-w-0 px-0 sm:px-0">
          <CoiffeurPublicProfileEncart seedPortraitUrl={seedPortraitUrl} />
        </div>

        <div className="glass-dark min-w-0 rounded-2xl p-4 shadow-2xl sm:p-6 md:p-8 lg:p-10">
          <p className="text-center text-[10px] uppercase tracking-[0.2em] text-glowup-lace/50 sm:text-xs">
            Cannes 2026
          </p>
          <h1 className="mt-2 text-center text-[1.15rem] font-semibold leading-snug text-glowup-lace sm:text-xl md:text-2xl lg:text-[1.625rem]">
            Réserver un créneau coiffeur
          </h1>
          <p className="mx-auto mt-3 max-w-xl px-0.5 text-center text-[0.9375rem] leading-relaxed text-glowup-lace/65 sm:text-sm md:text-base">
            <strong>Réservation sans compte.</strong> Toutes les heures sont en heure française (Paris). Choisis ta
            prestation : la durée du rendez-vous et les créneaux proposés s&apos;adaptent. Puis indique nom et email et
            confirme.
          </p>

          {done && (
            <div className="mx-auto mt-6 max-w-lg rounded-xl border border-glowup-green/40 bg-glowup-green/10 p-4 text-center sm:mt-8 sm:p-5">
              <p className="font-medium text-glowup-lace">Merci — ta réservation est enregistrée.</p>
              <p className="mt-3 text-sm leading-relaxed text-glowup-lace/85 sm:text-base">{recap}</p>
              <p className="mt-3 text-xs leading-relaxed text-glowup-lace/55 sm:text-sm">
                Un email de confirmation t’a été envoyé (vérifie les spams). Pour toute question, écris à ton
                contact Glow Up habituel.
              </p>
            </div>
          )}

          {!done && (
            <>
              {err && (
                <div className="mt-6 rounded-xl border border-red-500/35 bg-red-500/15 p-3 text-center text-sm text-red-200 sm:mt-8 sm:p-4">
                  {err}
                </div>
              )}

              {!prestationsLoaded && (
                <div className="mt-12 flex flex-col items-center gap-3 text-glowup-lace/70">
                  <Loader2 className="w-10 h-10 animate-spin text-glowup-rose-light" />
                  <span className="text-sm text-center">Chargement des prestations…</span>
                </div>
              )}

              {prestationsLoaded && !err && prestationsPub.length > 0 && (
                <div className="mt-8 flex flex-col gap-8 sm:mt-10 sm:gap-10">
                  <div>
                    <span className="mb-3 block text-xs uppercase tracking-wide text-glowup-lace/45">
                      1 · Choisir ta prestation
                    </span>
                    <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
                      {prestationsPub.map((p) => {
                        const active = prestationSlug === p.slug;
                        return (
                          <button
                            key={p.slug}
                            type="button"
                            onClick={() => selectPrestation(p.slug)}
                            className={`touch-manipulation min-h-[72px] w-full rounded-xl border px-4 py-3 text-left transition active:opacity-95 sm:min-h-[76px] sm:w-auto sm:min-w-[10.5rem] sm:flex-none ${
                              active
                                ? "border-glowup-rose bg-glowup-rose/25 text-glowup-lace"
                                : "border-glowup-rose/35 bg-black/15 text-glowup-lace/90 hover:border-glowup-rose"
                            }`}
                          >
                            <span className="block font-medium text-sm leading-snug">{p.title}</span>
                            <span className="mt-1 block text-xs text-glowup-lace/60">
                              {p.durationMinutes} min (+ {p.bufferMinutes} min avant le suivant)
                            </span>
                            {p.description && (
                              <span className="mt-1 block text-[11px] text-glowup-lace/45 line-clamp-2">{p.description}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {prestationSlug && !datesLoaded && (
                    <div className="flex flex-col items-center gap-3 text-glowup-lace/70 py-4">
                      <Loader2 className="w-8 h-8 animate-spin text-glowup-rose-light" />
                      <span className="text-sm text-center">Chargement des jours disponibles…</span>
                    </div>
                  )}

                  {prestationSlug && datesLoaded && (
                    <div className="flex flex-col gap-8 md:flex-row md:items-start md:gap-8 lg:gap-12">
                      <div className="flex w-full shrink-0 flex-col items-center md:sticky md:top-[max(0.75rem,env(safe-area-inset-top))] md:z-[1] md:w-full md:max-w-[20rem] lg:w-auto lg:max-w-none">
                        <span className="mb-3 block w-full text-center text-xs uppercase tracking-wide text-glowup-lace/45 md:max-w-[320px] md:text-left">
                          2 · Choisir un jour · mai 2026
                        </span>
                        <div
                          className="mx-auto w-full max-w-full overflow-x-auto overscroll-x-contain rounded-xl bg-glowup-lace/[0.97] px-2 py-3 text-glowup-licorice shadow-inner [-webkit-overflow-scrolling:touch] sm:px-4 sm:py-4 md:mx-0 md:w-fit md:overflow-visible"
                          style={{ color: "#220101" }}
                        >
                          <DayPicker
                            mode="single"
                            locale={fr}
                            fixedWeeks
                            className="coiffeur-public-rdp mx-auto flex justify-center"
                            style={rdpStyle}
                            defaultMonth={MAY_2026}
                            startMonth={MAY_2026}
                            endMonth={MAY_2026_END}
                            disabled={(d) => {
                              const y = formatInTimeZone(d, PARIS_TZ, "yyyy-MM-dd");
                              const todayY = formatInTimeZone(new Date(), PARIS_TZ, "yyyy-MM-dd");
                              return y < todayY || y < "2026-05-01" || y > "2026-05-31" || !availableDates.has(y);
                            }}
                            selected={selectedDay}
                            onSelect={(day) => {
                              setSelectedDay(day);
                              setPickedSlot(null);
                              setErr(null);
                            }}
                          />
                        </div>
                        {availableDates.size === 0 && (
                          <p className="mt-4 text-xs text-center text-glowup-lace/45 max-w-xs">
                            Aucun jour libre pour cette prestation — essaie une autre formule ou reviens plus
                            tard.
                          </p>
                        )}
                      </div>

                      <div className="flex min-w-0 flex-1 flex-col gap-6 sm:gap-8">
                        <div>
                          <span className="mb-3 block text-xs uppercase tracking-wide text-glowup-lace/45">
                            3 · Choisir l&apos;heure
                          </span>
                          {!selectedDay ? (
                            <p className="text-sm text-glowup-lace/50 md:text-base">
                              Choisis d&apos;abord une date dans le calendrier.
                            </p>
                          ) : slotsLoading ? (
                            <div className="flex flex-wrap items-center gap-2 text-sm text-glowup-lace/60">
                              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                              <span className="min-w-0 leading-snug">
                                Chargement des horaires pour le {formatParisTime(selectedDay, "EEEE d MMMM")}…
                              </span>
                            </div>
                          ) : daySlots.length === 0 ? (
                            <p className="text-sm text-glowup-lace/55 md:text-base">
                              Aucun créneau libre ce jour — essaie un autre jour.
                            </p>
                          ) : (
                            <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
                              {daySlots.map((s) => {
                                const active =
                                  pickedSlot?.startsAt === s.startsAt && pickedSlot.endsAt === s.endsAt;
                                return (
                                  <button
                                    key={`${s.startsAt}_${s.endsAt}`}
                                    type="button"
                                    className={`touch-manipulation min-h-[44px] min-w-[5.25rem] rounded-lg border px-3 py-2 text-base font-medium transition active:opacity-95 sm:text-sm ${
                                      active
                                        ? "border-glowup-rose bg-glowup-rose text-white"
                                        : "border-glowup-rose/40 bg-glowup-lace/10 text-glowup-lace hover:border-glowup-rose"
                                    }`}
                                    onClick={() => {
                                      setPickedSlot(s);
                                      setErr(null);
                                    }}
                                  >
                                    {s.displayStartParis}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {pickedSlot && (
                          <form
                            onSubmit={confirmSubmit}
                            className="space-y-4 rounded-xl border border-glowup-rose/25 bg-black/25 p-4 sm:p-5"
                          >
                            <span className="block text-xs uppercase tracking-wide text-glowup-lace/45">
                              4 · Confirmation
                            </span>
                            <p className="text-sm font-medium leading-relaxed text-glowup-lace sm:text-base">
                              <span className="mb-1 block text-xs font-normal text-glowup-lace/75">
                                {pickedSlot.prestationTitle}
                              </span>
                              Récap (heure de Paris)&nbsp;:{" "}
                              <span className="font-normal text-glowup-lace/90">
                                {formatParisTime(new Date(pickedSlot.startsAt), "EEEE d MMMM yyyy")}
                                {" · de "}
                                {formatParisTime(new Date(pickedSlot.startsAt), "HH:mm")} à{" "}
                                {formatParisTime(new Date(pickedSlot.endsAt), "HH:mm")}
                              </span>
                            </p>

                            <div className="grid gap-4 sm:grid-cols-2">
                              <div className="min-w-0">
                                <label htmlFor="gn" className="mb-1.5 block text-xs font-medium text-glowup-lace">
                                  Nom complet
                                </label>
                                <input
                                  id="gn"
                                  required
                                  autoComplete="name"
                                  value={name}
                                  onChange={(e) => setName(e.target.value)}
                                  className="w-full rounded-lg border border-glowup-rose/50 bg-glowup-lace/10 px-4 py-3 text-base text-glowup-lace transition-all duration-200 placeholder:text-glowup-lace/40 focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/30"
                                />
                              </div>
                              <div className="min-w-0">
                                <label htmlFor="gm" className="mb-1.5 block text-xs font-medium text-glowup-lace">
                                  Email
                                </label>
                                <input
                                  id="gm"
                                  type="email"
                                  inputMode="email"
                                  autoComplete="email"
                                  required
                                  value={email}
                                  onChange={(e) => setEmail(e.target.value)}
                                  className="w-full rounded-lg border border-glowup-rose/50 bg-glowup-lace/10 px-4 py-3 text-base text-glowup-lace transition-all duration-200 placeholder:text-glowup-lace/40 focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/30"
                                  placeholder="toi@domaine.fr"
                                />
                              </div>
                            </div>
                            <div>
                              <label htmlFor="nte" className="mb-1.5 block text-xs font-medium text-glowup-lace">
                                Précisions (facultatif)
                              </label>
                              <textarea
                                id="nte"
                                rows={3}
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                className="w-full resize-none rounded-lg border border-glowup-rose/50 bg-glowup-lace/10 px-4 py-3 text-base text-glowup-lace transition-all duration-200 placeholder:text-glowup-lace/35 focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/30"
                                placeholder="Allergies cuir chevelu, coupe souhaitée…"
                              />
                            </div>
                            <button
                              type="submit"
                              disabled={submitting || bookCooldownLeftSec > 0}
                              className="flex min-h-[48px] w-full touch-manipulation items-center justify-center gap-2 rounded-lg bg-glowup-rose py-3.5 text-base font-semibold text-white transition duration-200 hover:bg-glowup-rose-dark disabled:cursor-not-allowed disabled:opacity-70 sm:text-[0.9375rem]"
                            >
                              {submitting ? (
                                <>
                                  <Loader2 className="h-5 w-5 animate-spin" />
                                  Envoi en cours…
                                </>
                              ) : bookCooldownLeftSec > 0 ? (
                                `Patiente ${bookCooldownLeftSec}s…`
                              ) : (
                                "Confirmer ma réservation"
                              )}
                            </button>
                          </form>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <p className="px-2 pb-2 text-center text-xs leading-relaxed text-glowup-lace/40 sm:text-sm">
          © 2026 Glow Up Agence ·{" "}
          <Link
            href="https://www.glowupagence.fr/"
            className="break-words text-glowup-rose underline-offset-2 transition-colors hover:underline"
          >
            glowupagence.fr
          </Link>
        </p>
        </div>
      </main>
    </>
  );
}

