"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  CalendarDays,
  ChevronRight,
  Clock3,
  Inbox,
  Laptop,
  Paintbrush,
  Receipt,
  Send,
  X,
} from "lucide-react";
import { RhButton } from "@/components/rh/ui/primitives";
import { EMP_COLORS } from "@/components/rh/employee/parts";
import type { EmployeeScreenId } from "@/components/rh/employee/HomeScreen";

/** Bump pour rejouer la visite (overlay + mails DA). */
const STORAGE_KEY = "rh-onboarding-v6";

type Step = {
  tab: EmployeeScreenId | "tabs";
  target: string;
  fallback?: string;
  title: string;
  where: string;
  desc: string;
  icon: typeof Laptop;
};

/** Visite courte — 8 étapes max, une idée par écran. */
const STEPS: Step[] = [
  {
    tab: "tabs",
    target: "[data-rh-tabbar]",
    title: "Ta barre d’onglets",
    where: "En haut",
    desc: "Présence, Temps, Absences, Frais… chaque onglet = une action. On te montre les essentiels.",
    icon: Laptop,
  },
  {
    tab: "home",
    target: '[data-tour="home-quick"]',
    fallback: "[data-rh-tabbar]",
    title: "Raccourcis du jour",
    where: "Accueil",
    desc: "Ces tuiles t’emmènent directement où tu dois agir. Les to-dos et ton TT de la semaine s’affichent aussi ici.",
    icon: ChevronRight,
  },
  {
    tab: "remote",
    target: '[data-tour="remote-brush"]',
    fallback: '[data-tab="remote"]',
    title: "Palette Bureau / TT",
    where: "Présence",
    desc: "Choisis le type (ex. Télétravail), puis peins les jours. Le TT part toujours en validation manager.",
    icon: Paintbrush,
  },
  {
    tab: "remote",
    target: '[data-tour="remote-days"]',
    fallback: '[data-tab="remote"]',
    title: "Peindre les jours",
    where: "Cases lun–ven",
    desc: "Un clic applique le type. Un TT apparaît en « en attente » jusqu’à validation. Reclique pour revenir au bureau.",
    icon: Laptop,
  },
  {
    tab: "time",
    target: '[data-tour="time-toolbar"]',
    fallback: '[data-tab="time"]',
    title: "Feuille de temps",
    where: "Temps",
    desc: "Semaine type → ajuste → envoie. Les heures supp. demandent un motif. Signature DocuSeal après validation.",
    icon: Clock3,
  },
  {
    tab: "leave",
    target: '[data-tour="leave-types"]',
    fallback: '[data-tab="leave"]',
    title: "Poser une absence",
    where: "Absences",
    desc: "Type → durée → dates → envoi. Ton solde s’affiche pour savoir ce qu’il te reste.",
    icon: CalendarDays,
  },
  {
    tab: "expenses",
    target: '[data-tour="expenses-new"]',
    fallback: '[data-tab="expenses"]',
    title: "Notes de frais",
    where: "Frais",
    desc: "Crée une note, ajoute les lignes + justificatifs scannés, puis soumets pour validation.",
    icon: Receipt,
  },
  {
    tab: "requests",
    target: '[data-tab="requests"]',
    title: "Suivi des demandes",
    where: "Demandes",
    desc: "Absences, TT, temps, frais, adresse… tout ce que tu as envoyé, en attente ou décidé.",
    icon: Inbox,
  },
];

type Rect = { top: number; left: number; width: number; height: number };

function measure(selector: string): Rect | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function measureStep(step: Step): { rect: Rect | null; used: string } {
  const primary = measure(step.target);
  if (primary) return { rect: primary, used: step.target };
  if (step.fallback) {
    const fb = measure(step.fallback);
    if (fb) return { rect: fb, used: step.fallback };
  }
  const tabSel =
    step.tab === "tabs" ? "[data-rh-tabbar]" : `[data-tab="${step.tab}"]`;
  return { rect: measure(tabSel), used: tabSel };
}

function waitFrames(n = 2): Promise<void> {
  return new Promise((resolve) => {
    let left = n;
    const tick = () => {
      left -= 1;
      if (left <= 0) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

export function OnboardingWizard({
  onGo,
}: {
  onGo: (s: EmployeeScreenId) => void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [spot, setSpot] = useState<Rect | null>(null);
  const [ready, setReady] = useState(false);
  const [vw, setVw] = useState(0);
  const [vh, setVh] = useState(0);
  const measuring = useRef(false);
  const onGoRef = useRef(onGo);
  onGoRef.current = onGo;

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      if (!localStorage.getItem(STORAGE_KEY)) setOpen(true);
    } catch {
      /* ignore */
    }
  }, []);

  const current = STEPS[step];

  const remountSpot = useCallback(async (s: Step) => {
    if (measuring.current) return;
    measuring.current = true;
    setReady(false);
    try {
      if (s.tab !== "tabs") onGoRef.current(s.tab);
      else onGoRef.current("home");
      // Laisse React peindre l’écran ciblé
      await waitFrames(2);
      await new Promise((r) => setTimeout(r, 120));
      setVw(window.innerWidth);
      setVh(window.innerHeight);
      const { rect, used } = measureStep(s);
      setSpot(rect);
      if (rect) {
        const el = document.querySelector(used) as HTMLElement | null;
        el?.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
        await waitFrames(1);
        // Remesure après scroll (positions stables)
        const again = measureStep(s);
        setSpot(again.rect);
      }
      setReady(true);
    } finally {
      measuring.current = false;
    }
  }, []);

  useLayoutEffect(() => {
    if (!open || !current) return;
    void remountSpot(current);

    let t: number | null = null;
    const onResize = () => {
      if (t) window.clearTimeout(t);
      t = window.setTimeout(() => {
        setVw(window.innerWidth);
        setVh(window.innerHeight);
        const { rect } = measureStep(current);
        setSpot(rect);
      }, 80);
    };
    window.addEventListener("resize", onResize);
    return () => {
      if (t) window.clearTimeout(t);
      window.removeEventListener("resize", onResize);
    };
  }, [open, step, current, remountSpot]);

  function finish() {
    try {
      localStorage.setItem(STORAGE_KEY, "done");
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  function next() {
    if (step >= STEPS.length - 1) finish();
    else setStep((v) => v + 1);
  }

  function prev() {
    if (step > 0) setStep((v) => v - 1);
  }

  if (!open || !current) return null;

  const Icon = current.icon;
  const pad = 10;
  const hole = spot
    ? {
        top: Math.max(4, spot.top - pad),
        left: Math.max(4, spot.left - pad),
        width: Math.min(spot.width + pad * 2, (vw || 800) - 8),
        height: spot.height + pad * 2,
      }
    : null;

  const cardW = Math.min(400, (vw || 800) - 24);
  const cardH = 280;
  const gap = 16;
  const viewH = vh || 800;
  const viewW = vw || 800;

  /** Carte jamais sur le trou : dessous, dessus, ou à côté. */
  let cardTop = viewH - cardH - 20;
  let cardLeft = (viewW - cardW) / 2;

  if (hole) {
    const spaceBelow = viewH - (hole.top + hole.height);
    const spaceAbove = hole.top;
    if (spaceBelow >= cardH + gap + 12) {
      cardTop = hole.top + hole.height + gap;
      cardLeft = Math.min(
        Math.max(12, hole.left + hole.width / 2 - cardW / 2),
        viewW - cardW - 12
      );
    } else if (spaceAbove >= cardH + gap + 12) {
      cardTop = hole.top - cardH - gap;
      cardLeft = Math.min(
        Math.max(12, hole.left + hole.width / 2 - cardW / 2),
        viewW - cardW - 12
      );
    } else if (viewW >= 900 && hole.left + hole.width + cardW + gap < viewW) {
      cardLeft = hole.left + hole.width + gap;
      cardTop = Math.min(
        Math.max(12, hole.top),
        viewH - cardH - 12
      );
    } else if (viewW >= 900 && hole.left - cardW - gap > 0) {
      cardLeft = hole.left - cardW - gap;
      cardTop = Math.min(
        Math.max(12, hole.top),
        viewH - cardH - 12
      );
    } else {
      // Fallback : bas d’écran, hors collision approximative
      cardTop = viewH - cardH - 16;
      cardLeft = (viewW - cardW) / 2;
    }
  }

  const cardStyle: CSSProperties = {
    position: "fixed",
    left: cardLeft,
    top: cardTop,
    width: cardW,
    zIndex: 92,
    opacity: ready ? 1 : 0.55,
    transition: "opacity 160ms ease, top 180ms ease, left 180ms ease",
  };

  return (
    <div
      className="fixed inset-0 z-[90]"
      role="dialog"
      aria-label="Visite guidée RH"
      aria-modal
    >
      {/* Overlay léger — l’UI derrière reste lisible */}
      <div
        className="fixed inset-0"
        style={{ background: "rgba(8,9,12,.42)", zIndex: 90 }}
        onClick={(e) => e.stopPropagation()}
      />

      {hole ? (
        <>
          <div
            className="pointer-events-none fixed rounded-[14px]"
            style={{
              top: hole.top,
              left: hole.left,
              width: hole.width,
              height: hole.height,
              boxShadow: `0 0 0 9999px rgba(8,9,12,.38), 0 0 0 2.5px ${EMP_COLORS.accent}, 0 0 0 8px rgba(229,242,181,.35), 0 8px 32px rgba(0,0,0,.25)`,
              zIndex: 91,
              transition: "top 180ms ease, left 180ms ease, width 180ms ease, height 180ms ease",
            }}
          />
        </>
      ) : null}

      <div
        style={{
          ...cardStyle,
          background: EMP_COLORS.surface,
          border: `1px solid ${EMP_COLORS.border}`,
          borderRadius: 18,
          overflow: "hidden",
          boxShadow: "0 18px 50px rgba(0,0,0,.45)",
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: `1px solid ${EMP_COLORS.borderSubtle}` }}
        >
          <div
            className="text-[12px] font-semibold"
            style={{ color: EMP_COLORS.muted }}
          >
            Visite guidée · {step + 1}/{STEPS.length}
          </div>
          <button
            type="button"
            className="border-0 bg-transparent cursor-pointer p-1"
            style={{ color: EMP_COLORS.dim }}
            onClick={finish}
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <div
              className="grid place-items-center rounded-[12px] shrink-0"
              style={{
                width: 40,
                height: 40,
                background: "rgba(229,242,181,.14)",
                color: EMP_COLORS.accent,
              }}
            >
              <Icon size={18} />
            </div>
            <div className="min-w-0">
              <div
                className="rh-mono text-[10px] font-bold tracking-wide uppercase mb-1"
                style={{ color: EMP_COLORS.accent }}
              >
                {current.where}
              </div>
              <h2
                className="m-0 text-[17px] font-semibold tracking-[-0.02em]"
                style={{ color: EMP_COLORS.text }}
              >
                {current.title}
              </h2>
            </div>
          </div>

          <p
            className="m-0 text-[13.5px] leading-[1.5]"
            style={{ color: EMP_COLORS.muted }}
          >
            {current.desc}
          </p>

          <div className="flex gap-1">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className="h-1 flex-1 rounded-full"
                style={{
                  background:
                    i <= step ? EMP_COLORS.accent : EMP_COLORS.borderControl,
                  transition: "background 200ms ease",
                }}
              />
            ))}
          </div>

          <div className="flex gap-2">
            {step > 0 ? (
              <RhButton variant="secondary" className="flex-1" onClick={prev}>
                Précédent
              </RhButton>
            ) : null}
            <RhButton className="flex-1" onClick={next}>
              {step >= STEPS.length - 1 ? (
                "C’est compris"
              ) : (
                <>
                  Suivant <Send size={12} className="inline opacity-70" />
                </>
              )}
            </RhButton>
          </div>
          <button
            type="button"
            className="border-0 bg-transparent cursor-pointer text-[12px] py-1"
            style={{ color: EMP_COLORS.dim }}
            onClick={finish}
          >
            Passer la visite
          </button>
        </div>
      </div>
    </div>
  );
}
