"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { fr } from "date-fns/locale";
import { GlowUpLogo } from "@/components/ui/logo";
import { Loader2, RefreshCw } from "lucide-react";
import { PARIS_TZ } from "@/lib/cannes-coiffeur/formatParisTime";

type TimelineItem =
  | {
      kind: "agenda_event";
      id: string;
      startTime: string;
      endTime: string | null;
      title: string;
      location: string;
      eventType: string;
      eventTypeLabel: string;
      description: string | null;
      talents: string[];
      team: string[];
    }
  | {
      kind: "board_item";
      id: string;
      timeLabel: string;
      endTimeLabel: string | null;
      title: string;
      body: string | null;
    };

type FeedDay = { ymd: string; weekdayLabel: string; timeline: TimelineItem[] };

const POLL_MS = 12_000;

/** Vitesse de défilement auto sur TV (px/s) — confort lecture à distance. */
const TV_AUTO_SCROLL_PX_PER_SEC = 26;
/** Pause en bas / en haut avant inversion (ms). */
const TV_AUTO_SCROLL_PAUSE_MS = 2800;

const BUBBLE_DRIFT_CLASS = {
  1: "motion-safe:animate-bubble-drift-1",
  2: "motion-safe:animate-bubble-drift-2",
  3: "motion-safe:animate-bubble-drift-3",
  4: "motion-safe:animate-bubble-drift-4",
} as const;

type BubbleDriftId = keyof typeof BUBBLE_DRIFT_CLASS;

type BubbleSpec = {
  left: number;
  top: number;
  size: number;
  drift: BubbleDriftId;
  dur: number;
  delay: number;
  blur: "blur-lg" | "blur-xl" | "blur-2xl" | "blur-3xl";
  surface: 0 | 1 | 2;
};

const BUBBLE_SURFACE_CLASS: Record<BubbleSpec["surface"], string> = {
  0: "bg-[radial-gradient(circle_at_32%_28%,rgba(245,237,224,0.14)_0%,rgba(196,139,140,0.07)_40%,transparent_70%)]",
  1: "bg-[radial-gradient(circle_at_68%_42%,rgba(176,111,112,0.11)_0%,rgba(34,1,1,0.14)_48%,transparent_74%)]",
  2: "bg-[radial-gradient(circle_at_48%_52%,rgba(245,237,224,0.1)_0%,rgba(176,111,112,0.05)_44%,transparent_68%)]",
};

const VILLA_TV_BUBBLES: BubbleSpec[] = Array.from({ length: 34 }, (_, i) => {
  const drifts = [1, 2, 3, 4] as const;
  const blurs = ["blur-lg", "blur-xl", "blur-2xl", "blur-3xl"] as const;
  const surfaces = [0, 1, 2] as const;
  return {
    left: 2 + (i * 37) % 90,
    top: 1 + (i * 29) % 87,
    size: 26 + (i % 9) * 7,
    drift: drifts[i % 4],
    dur: 24 + (i % 10) * 1.35,
    delay: -((i * 0.48) % 17),
    blur: blurs[i % 4],
    surface: surfaces[i % 3],
  };
});

export default function CannesVillaTvClient() {
  const [days, setDays] = useState<FeedDay[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const scrollRegionRef = useRef<HTMLDivElement>(null);
  const [tvScrollOverflow, setTvScrollOverflow] = useState(false);

  const clock = useMemo(
    () => formatInTimeZone(now, PARIS_TZ, "EEEE d MMMM yyyy · HH:mm:ss", { locale: fr }),
    [now]
  );

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await fetch(`/api/pub/cannes-villa-tv/feed?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || "Erreur de chargement");
      }
      const data = (await res.json()) as { days: FeedDay[]; generatedAt: string };
      setDays(data.days ?? []);
      setGeneratedAt(data.generatedAt ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  /** Détecte si l’agenda dépasse la zone utile (pour défilement auto type kiosque TV). */
  useEffect(() => {
    const el = scrollRegionRef.current;
    if (!el) return;
    const measure = () => {
      const overflow = el.scrollHeight > el.clientHeight + 6;
      setTvScrollOverflow(overflow);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [days, err, loading]);

  useEffect(() => {
    const el = scrollRegionRef.current;
    if (!el || !tvScrollOverflow) return;
    if (typeof window === "undefined") return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduceMotion.matches) return;

    let raf = 0;
    let dir: 1 | -1 = 1;
    let pauseUntil = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;

      const maxScroll = el.scrollHeight - el.clientHeight;
      if (maxScroll <= 0) {
        raf = requestAnimationFrame(tick);
        return;
      }

      if (now < pauseUntil) {
        raf = requestAnimationFrame(tick);
        return;
      }

      const step = (TV_AUTO_SCROLL_PX_PER_SEC * dt) / 1000;
      el.scrollTop += dir * step;

      if (dir === 1 && el.scrollTop >= maxScroll - 2) {
        el.scrollTop = maxScroll;
        dir = -1;
        pauseUntil = now + TV_AUTO_SCROLL_PAUSE_MS;
      } else if (dir === -1 && el.scrollTop <= 2) {
        el.scrollTop = 0;
        dir = 1;
        pauseUntil = now + TV_AUTO_SCROLL_PAUSE_MS;
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [tvScrollOverflow, days]);

  return (
    <main className="fixed inset-0 z-0 flex flex-col overflow-hidden bg-glowup-licorice pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.35rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
        <div className="absolute inset-0 bg-gradient-login" />
        <div className="absolute inset-0 bg-villa-tv-depth opacity-[0.58]" />
        <div className="absolute inset-0 bg-villa-tv-vignette mix-blend-multiply opacity-90" />
        {VILLA_TV_BUBBLES.map((b, i) => (
          <div
            key={i}
            className={`absolute rounded-full will-change-transform mix-blend-soft-light ${BUBBLE_SURFACE_CLASS[b.surface]} ${b.blur} ${BUBBLE_DRIFT_CLASS[b.drift]}`}
            style={{
              left: `${b.left}%`,
              top: `${b.top}%`,
              width: b.size,
              height: b.size,
              animationDuration: `${b.dur}s`,
              animationDelay: `${b.delay}s`,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col gap-4 px-2 sm:gap-6 sm:px-4">
        <header className="shrink-0 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            <GlowUpLogo className="h-auto w-36 shrink-0 text-glowup-lace sm:w-44 md:w-52" variant="light" />
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-glowup-lace/50 sm:text-xs">
                Cannes 2026 · Villa
              </p>
              <h1 className="font-[Spectral] text-xl font-semibold leading-tight text-glowup-lace sm:text-2xl md:text-3xl">
                Agenda et annonces — 2 prochains jours
              </h1>
              <p className="mt-1 text-sm text-glowup-lace/60 sm:text-base">
                Brunchs, dîners, soirées, messages équipe (réunions, rappels…) · sans créneaux planning équipe interne
                · l’agenda en type « Autre » n’est pas diffusé ici · Europe/Paris
              </p>
            </div>
          </div>
          <div className="glass-dark flex flex-col items-stretch gap-2 rounded-2xl border border-glowup-rose/25 px-4 py-3 text-glowup-lace shadow-xl sm:min-w-[280px] sm:items-end">
            <p className="text-center text-lg font-semibold tabular-nums tracking-tight sm:text-right sm:text-xl md:text-2xl">
              {clock}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-end">
              {loading && days.length === 0 ? (
                <span className="flex items-center gap-2 text-xs text-glowup-lace/55">
                  <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
                </span>
              ) : (
                <>
                  <span className="text-[11px] text-glowup-lace/45">
                    MAJ auto ~{Math.round(POLL_MS / 1000)}s
                    {generatedAt
                      ? ` · serveur ${formatInTimeZone(new Date(generatedAt), PARIS_TZ, "HH:mm:ss", { locale: fr })}`
                      : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => void load()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-glowup-rose/40 bg-black/25 px-2.5 py-1 text-xs text-glowup-lace/90 transition hover:border-glowup-rose hover:bg-black/40"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Rafraîchir
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        {err && (
          <div className="shrink-0 rounded-xl border border-red-500/35 bg-red-500/15 px-4 py-3 text-center text-sm text-red-100">
            {err}
          </div>
        )}

        <div
          ref={scrollRegionRef}
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="grid gap-5 pb-3 lg:grid-cols-2 lg:gap-8">
          {days.map((day) => (
            <section
              key={day.ymd}
              className="glass-dark flex min-h-[280px] flex-col rounded-2xl border border-glowup-rose/20 p-4 shadow-2xl sm:min-h-[360px] sm:p-6 md:p-8"
            >
              <div className="mb-5 border-b border-glowup-rose/25 pb-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-glowup-lace/45">Journée</p>
                <h2 className="font-[Spectral] text-xl font-semibold text-glowup-lace sm:text-2xl md:text-3xl">
                  {day.weekdayLabel}
                </h2>
              </div>

              {day.timeline.length === 0 ? (
                <p className="text-base leading-relaxed text-glowup-lace/55 sm:text-lg">
                  Rien à afficher ce jour : ajoute des événements dans l’onglet Agenda (brunch, dîner, etc.) ou des
                  messages depuis l’espace Cannes (éditeurs). Les créneaux « planning équipe » (grille horaire interne)
                  ne sont pas affichés ici.
                </p>
              ) : (
                <ul className="flex flex-col gap-3 sm:gap-4">
                  {day.timeline.map((item) =>
                    item.kind === "board_item" ? (
                      <li
                        key={item.id}
                        className="rounded-xl border border-amber-400/40 bg-amber-950/30 px-4 py-3 sm:px-5 sm:py-4"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-lg font-bold tabular-nums text-amber-100 sm:text-xl">
                            {item.timeLabel}
                            {item.endTimeLabel ? ` – ${item.endTimeLabel}` : ""}
                          </span>
                          <span className="rounded-md bg-amber-500/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-50/95">
                            Annonce
                          </span>
                        </div>
                        <p className="mt-2 text-lg font-semibold leading-snug text-glowup-lace sm:text-xl">{item.title}</p>
                        {item.body ? (
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-glowup-lace/75 sm:text-base">
                            {item.body}
                          </p>
                        ) : null}
                      </li>
                    ) : (
                      <li
                        key={item.id}
                        className="rounded-xl border border-indigo-400/35 bg-indigo-950/25 px-4 py-3 sm:px-5 sm:py-4"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-lg font-bold tabular-nums text-indigo-100 sm:text-xl">
                            {item.startTime}
                            {item.endTime ? ` – ${item.endTime}` : ""}
                          </span>
                          <span className="rounded-md bg-indigo-500/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-100/90">
                            {item.eventTypeLabel}
                          </span>
                        </div>
                        <p className="mt-2 text-lg font-semibold leading-snug text-glowup-lace sm:text-xl">
                          {item.title}
                        </p>
                        <p className="mt-1 text-sm text-glowup-lace/70 sm:text-base">{item.location}</p>
                        {item.description ? (
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-glowup-lace/75 sm:text-base">
                            {item.description}
                          </p>
                        ) : null}
                        {item.talents.length > 0 ? (
                          <div className="mt-3">
                            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-glowup-lace/45">
                              Talents
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {item.talents.map((name) => (
                                <span
                                  key={`t-${name}`}
                                  className="rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-xs text-glowup-lace/90 sm:text-sm"
                                >
                                  {name}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {item.team.length > 0 ? (
                          <div className="mt-3">
                            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-glowup-lace/45">
                              Équipe
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {item.team.map((name) => (
                                <span
                                  key={`u-${name}`}
                                  className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-glowup-lace/75 sm:text-sm"
                                >
                                  {name}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {item.talents.length === 0 && item.team.length === 0 ? (
                          <p className="mt-3 text-xs italic text-glowup-lace/45">
                            Aucun participant lié — à compléter dans l’agenda
                          </p>
                        ) : null}
                      </li>
                    )
                  )}
                </ul>
              )}
            </section>
          ))}
          </div>

          <footer className="mt-4 pb-2 text-center text-xs text-glowup-lace/40 sm:text-sm">
            Glow Up · agenda Cannes et annonces équipe — pas de grille planning équipe interne
          </footer>
        </div>
      </div>
    </main>
  );
}
