"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Loader2,
  MapPin,
  CalendarDays,
  ArrowDown,
  Mail,
  Instagram,
  ExternalLink,
} from "lucide-react";
import { GlowUpLogo } from "@/components/ui/logo";
import {
  type EmvConfig,
  resolveEmvConfig,
  computeEmvTotals,
} from "@/lib/emv";

export type CastingMember = {
  talentId?: string;
  name: string;
  handle?: string | null;
  photoUrl?: string | null;
  followers?: number | null;
  engagement?: number | null;
  reach?: number | null;
  reachInstagram?: number | null;
  reachTiktok?: number | null;
  avgViews?: number | null;
  platforms?: string[];
  role?: string | null;
  group?: string | null;
};

export type BudgetLine = { label: string; detail?: string | null; amount?: number | null; group?: string | null };

export type Deliverable = {
  talent?: string | null;
  format?: string | null;
  platform?: string | null;
  quantity?: number | null;
  mediaValue?: number | null;
  followers?: number | null;
  engagement?: number | null;
  reach?: number | null;
  avgViews?: number | null;
};

export type LogisticsItem = { label: string; url?: string | null; detail?: string | null; imageUrl?: string | null };

export type DeckTheme = {
  background: "solid" | "gradient" | "image";
  bgColor: string;
  bgColor2: string;
  bgImageUrl: string | null;
  bgOverlay: number; // 0..100 (assombrissement sur l'image de fond)
  textColor: string;
  font: "sans" | "serif" | "mono";
};

export type ProposalPayload = {
  id: string;
  nomMarque: string;
  brandLogoUrl?: string | null;
  title: string;
  subtitle?: string | null;
  coverPhotoUrl?: string | null;
  accentColor: string;
  introMessage?: string | null;
  casting: CastingMember[];
  castingGroups?: string[];
  budgetLines: BudgetLine[];
  budgetGroups?: string[];
  budgetCurrency: string;
  deliverables: Deliverable[];
  photos: string[];
  logistics?: LogisticsItem[];
  eventLocation?: string | null;
  eventDateLabel?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  theme?: Partial<DeckTheme> | null;
  emvConfig?: Partial<EmvConfig> | null;
};

export const CREAM = "#F5EDE0";
export const LICORICE = "#220101";

export const DEFAULT_THEME: DeckTheme = {
  background: "solid",
  bgColor: LICORICE,
  bgColor2: "#3A1414",
  bgImageUrl: null,
  bgOverlay: 60,
  textColor: CREAM,
  font: "sans",
};

// Polices de marque Glow Up : Switzer (sans) pour le corps, Spectral (serif)
// pour le titrage. Servies via @font-face dans globals.css.
const FONT_STACKS: Record<DeckTheme["font"], string> = {
  sans: '"Switzer", "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  serif: '"Spectral", ui-serif, Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "SF Mono", "Roboto Mono", monospace',
};

// Titrage : la serif de marque Spectral, qui donne le côté éditorial premium.
const DISPLAY_FONT_STACKS: Record<DeckTheme["font"], string> = {
  sans: '"Spectral", ui-serif, Georgia, "Times New Roman", serif',
  serif: '"Spectral", ui-serif, Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "SF Mono", "Roboto Mono", monospace',
};

export function resolveTheme(theme?: Partial<DeckTheme> | null): DeckTheme {
  return { ...DEFAULT_THEME, ...(theme || {}) };
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function deckBackgroundStyle(theme: DeckTheme): React.CSSProperties {
  if (theme.background === "gradient") {
    return {
      backgroundColor: theme.bgColor,
      backgroundImage: `linear-gradient(160deg, ${theme.bgColor} 0%, ${theme.bgColor2} 100%)`,
    };
  }
  if (theme.background === "image" && theme.bgImageUrl) {
    const overlay = hexToRgba(theme.bgColor, Math.min(1, Math.max(0, theme.bgOverlay / 100)));
    return {
      backgroundColor: theme.bgColor,
      backgroundImage: `linear-gradient(${overlay}, ${overlay}), url(${theme.bgImageUrl})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundAttachment: "fixed",
    };
  }
  return { backgroundColor: theme.bgColor };
}

const AnimateContext = createContext(true);

function formatCompact(n?: number | null): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
  return String(n);
}

function money(n: number | null | undefined, currency: string): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: currency || "EUR",
    maximumFractionDigits: 0,
  }).format(n || 0);
}

// Arrondit l'EMV à une valeur "ronde" et vendeuse (≈ 5 000 € plutôt que 4 965 €).
function roundEmv(n: number): number {
  if (!n || n <= 0) return 0;
  if (n >= 10_000) return Math.round(n / 500) * 500;
  if (n >= 1_000) return Math.round(n / 100) * 100;
  return Math.round(n / 10) * 10;
}

function Reveal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const animate = useContext(AnimateContext);
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(!animate);
  useEffect(() => {
    if (!animate) return;
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.12 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [animate]);
  return (
    <div
      ref={ref}
      data-reveal
      className={`transition-all duration-700 ease-out ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      } ${className}`}
    >
      {children}
    </div>
  );
}

// Affiche un handle propre (@pseudo) même si le champ contient une URL complète.
function displayHandle(handle?: string | null): string | null {
  if (!handle) return null;
  let h = handle.trim();
  if (/^https?:\/\//i.test(h)) {
    try {
      const seg = new URL(h).pathname.split("/").filter(Boolean)[0] || "";
      h = seg;
    } catch {
      h = h.replace(/^https?:\/\//i, "").split("/")[1] || "";
    }
  }
  h = h.replace(/^@/, "").trim();
  return h || null;
}

// Construit l'URL du profil social d'un talent à partir de son handle + plateformes.
function profileUrl(c: CastingMember): string | null {
  const raw = (c.handle || "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const handle = raw.replace(/^@/, "");
  if (!handle) return null;
  const platforms = (c.platforms || []).map((pf) => pf.toLowerCase());
  const hasInstagram = platforms.some((pf) => pf.includes("insta"));
  const hasTiktok = platforms.some((pf) => pf.includes("tiktok") || pf.includes("tik tok"));
  if (hasTiktok && !hasInstagram) return `https://www.tiktok.com/@${handle}`;
  return `https://www.instagram.com/${handle}`;
}

function ProfileCardLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  if (!href) return <>{children}</>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="block transition-transform duration-300 hover:-translate-y-1"
    >
      {children}
    </a>
  );
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() || "")
    .join("");
}

/**
 * Rendu pur de la présentation, partagé entre la page publique et l'aperçu
 * live du builder. `animate=false` désactive les animations au scroll (aperçu).
 */
export function ProposalDeckView({
  proposal: p,
  animate = true,
}: {
  proposal: ProposalPayload;
  animate?: boolean;
}) {
  const accent = p.accentColor || "#B06F70";
  const theme = resolveTheme(p.theme);
  const baseBg = theme.bgColor;
  const displayFont = DISPLAY_FONT_STACKS[theme.font];
  // Grain subtil (texture) posé sur tout le deck — adoucit les aplats et ajoute
  // une impression « print ». Valeur inline pour rester compatible html2canvas.
  const grainUrl =
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")";
  const budgetGroupsOrder: string[] =
    p.budgetGroups && p.budgetGroups.length
      ? p.budgetGroups
      : Array.from(new Set(p.budgetLines.map((l) => l.group).filter(Boolean) as string[]));
  const budgetFallbackGroup = budgetGroupsOrder[0] || "";
  const budgetGroupOf = (l: BudgetLine) => l.group || budgetFallbackGroup;
  const budgetRenderGroups = budgetGroupsOrder.length ? budgetGroupsOrder : [""];
  const showBudgetTitles = budgetRenderGroups.length > 1;
  const budgetGroupTotal = (gname: string) =>
    p.budgetLines
      .filter((l) => budgetGroupOf(l) === gname)
      .reduce((s, l) => s + (Number(l.amount) || 0), 0);
  // Pour le ROI de la cover : on prend le premier scénario de budget (référence).
  const budgetTotal = showBudgetTitles
    ? budgetGroupTotal(budgetRenderGroups[0])
    : p.budgetLines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const totalFollowers = p.casting.reduce((s, c) => s + (Number(c.followers) || 0), 0);

  const emvCfg = resolveEmvConfig(p.emvConfig);
  const emv = computeEmvTotals(p.deliverables, p.casting, emvCfg);
  const hasEmv = emv.emv > 0;

  const castingGroupsOrder: string[] =
    p.castingGroups && p.castingGroups.length
      ? p.castingGroups
      : Array.from(new Set(p.casting.map((c) => c.group).filter(Boolean) as string[]));
  const castingFallbackGroup = castingGroupsOrder[0] || "";
  const castingGroupOf = (c: CastingMember) => c.group || castingFallbackGroup;
  const castingRenderGroups = castingGroupsOrder.length ? castingGroupsOrder : [""];
  const showCastingTitles = castingRenderGroups.length > 1;

  // Les groupes de casting sont des propositions de line-up alternatives :
  // on consolide donc le Reach / EMV / ROI par casting plutôt qu'en un seul total.
  const groupTotalOf = (gname: string) => {
    // Un même talent peut être présent dans plusieurs castings : on totalise alors
    // ses livrables dans CHAQUE casting où il apparaît (pas d'attribution unique).
    const namesInGroup = new Set(
      p.casting
        .filter((c) => castingGroupOf(c) === gname)
        .map((c) => (c.name || "").trim().toLowerCase())
    );
    let reach = 0;
    let emvSum = 0;
    let interactions = 0;
    p.deliverables.forEach((d, i) => {
      const tname = (d.talent || "").trim().toLowerCase();
      if (!namesInGroup.has(tname)) return;
      const line = emv.lines[i];
      reach += line?.reach || 0;
      emvSum += line?.retained || 0;
      interactions += line?.interactions || 0;
    });
    return { name: gname, reach, emv: emvSum, interactions };
  };
  const castingTotals = castingRenderGroups.map(groupTotalOf).filter((t) => t.emv > 0);

  // Plusieurs line-ups = propositions ALTERNATIVES (pas cumulatives). Les chiffres
  // de la cover doivent donc refléter UN line-up représentatif (moyenne), sinon on
  // additionne deux scénarios qui ne seront jamais réalisés ensemble.
  const multiLineup = castingRenderGroups.length > 1;
  const avgOf = (vals: number[]) => (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0);
  const lineupStats = castingRenderGroups.map((gname) => {
    const members = p.casting.filter((c) => castingGroupOf(c) === gname);
    const namesInGroup = new Set(members.map((c) => (c.name || "").trim().toLowerCase()));
    return {
      talents: members.length,
      followers: members.reduce((s, c) => s + (Number(c.followers) || 0), 0),
      livrables: p.deliverables.filter((d) => namesInGroup.has((d.talent || "").trim().toLowerCase())).length,
    };
  });
  const headline = multiLineup
    ? {
        talents: Math.round(avgOf(lineupStats.map((s) => s.talents))),
        followers: Math.round(avgOf(lineupStats.map((s) => s.followers))),
        livrables: Math.round(avgOf(lineupStats.map((s) => s.livrables))),
        emv: Math.round(avgOf(castingTotals.map((t) => t.emv))),
      }
    : {
        talents: p.casting.length,
        followers: totalFollowers,
        livrables: p.deliverables.length,
        emv: emv.emv,
      };

  // Bande « statement » de synthèse (chiffres-clés), volontairement plate et
  // aérée : grands nombres en serif, filets fins entre les colonnes.
  const renderSummaryGrid = (reach: number, emvVal: number, interactions: number) => (
    <div
      className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border sm:grid-cols-3"
      style={{ borderColor: `${accent}2e`, backgroundColor: `${accent}2e` }}
    >
      <div className="px-6 py-9 text-center" style={{ backgroundColor: baseBg }}>
        <p className="text-4xl font-semibold tabular-nums md:text-5xl" style={{ fontFamily: displayFont }}>
          {formatCompact(reach)}
        </p>
        <p className="mt-2.5 text-[11px] uppercase tracking-[0.22em] opacity-50">Reach estimé</p>
      </div>
      <div className="px-6 py-9 text-center" style={{ backgroundColor: baseBg }}>
        <p className="text-4xl font-semibold tabular-nums md:text-5xl" style={{ color: accent, fontFamily: displayFont }}>
          {money(emvVal, p.budgetCurrency)}
        </p>
        <p className="mt-2.5 text-[11px] uppercase tracking-[0.22em] opacity-50">
          EMV estimée · ≈ {formatCompact(interactions)} interactions
        </p>
      </div>
      <div className="px-6 py-9 text-center" style={{ backgroundColor: baseBg }}>
        {budgetTotal > 0 ? (
          <>
            <p className="text-4xl font-semibold tabular-nums md:text-5xl" style={{ fontFamily: displayFont }}>
              ×{(emvVal / budgetTotal).toFixed(1)}
            </p>
            <p className="mt-2.5 text-[11px] uppercase tracking-[0.22em] opacity-50">
              Retour · {money(budgetTotal, p.budgetCurrency)} investis
            </p>
          </>
        ) : (
          <>
            <p className="text-4xl font-semibold tabular-nums md:text-5xl" style={{ fontFamily: displayFont }}>
              {money(budgetTotal, p.budgetCurrency)}
            </p>
            <p className="mt-2.5 text-[11px] uppercase tracking-[0.22em] opacity-50">Investissement</p>
          </>
        )}
      </div>
    </div>
  );

  // Numérotation séquentielle des sections (01, 02, …) pour le rythme éditorial.
  let sectionNo = 0;
  const nextNo = () => String(++sectionNo).padStart(2, "0");

  return (
    <AnimateContext.Provider value={animate}>
      <div
        data-deck-root
        className="relative"
        style={{ ...deckBackgroundStyle(theme), color: theme.textColor, fontFamily: FONT_STACKS[theme.font] }}
      >
        {/* Grain : texture posée sur tout le deck (pointer-events-none). */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0"
          style={{ backgroundImage: grainUrl, backgroundRepeat: "repeat", opacity: 0.05 }}
        />
        <div className="relative z-[1]">
        {/* ===== COVER ===== */}
        <section className="relative flex min-h-screen flex-col justify-between overflow-hidden px-6 py-9 md:px-12 md:py-12">
          {p.coverPhotoUrl ? (
            <>
              <img
                src={p.coverPhotoUrl}
                alt=""
                crossOrigin="anonymous"
                className="absolute inset-0 h-full w-full scale-105 object-cover"
              />
              <div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(180deg, ${hexToRgba(baseBg, 0.2)} 0%, ${hexToRgba(baseBg, 0.55)} 50%, ${hexToRgba(baseBg, 0.92)} 88%, ${baseBg} 100%)`,
                }}
              />
            </>
          ) : (
            <div
              className="absolute inset-0"
              style={{
                background: `radial-gradient(1200px 620px at 78% -12%, ${accent}3d, transparent 60%), radial-gradient(900px 520px at 0% 112%, ${accent}26, transparent 55%)`,
              }}
            />
          )}

          {/* Bandeau haut : logo agence ↔ marque */}
          <div className="relative z-10 flex items-center justify-between gap-4">
            <GlowUpLogo color={theme.textColor} className="h-7 w-auto md:h-9" />
            {p.brandLogoUrl ? (
              <img
                src={p.brandLogoUrl}
                alt={p.nomMarque}
                crossOrigin="anonymous"
                className="h-9 w-auto max-w-[180px] object-contain md:h-12"
              />
            ) : (
              <span className="text-sm font-medium tracking-wide opacity-80 md:text-base">{p.nomMarque}</span>
            )}
          </div>

          {/* Titre éditorial, ancré en bas à gauche */}
          <div data-pdf-atomic className="relative z-10 max-w-5xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.34em] opacity-65">
              Proposition de partenariat
              <span className="mx-2.5 opacity-40">/</span>
              <span style={{ color: accent }}>{p.nomMarque}</span>
            </p>
            <h1
              className="mt-6 text-[2.25rem] font-medium leading-[1.02] tracking-[-0.02em] md:text-[5rem]"
              style={{ fontFamily: displayFont }}
            >
              {p.title}
            </h1>
            {p.subtitle ? (
              <p className="mt-6 max-w-2xl text-lg font-light leading-relaxed opacity-80 md:text-2xl">
                {p.subtitle}
              </p>
            ) : null}
            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm opacity-85 md:text-base">
              {p.eventLocation ? (
                <span className="inline-flex items-center gap-2">
                  <MapPin className="h-4 w-4" style={{ color: accent }} />
                  {p.eventLocation}
                </span>
              ) : null}
              {p.eventLocation && p.eventDateLabel ? (
                <span className="h-1 w-1 rounded-full opacity-40" style={{ backgroundColor: theme.textColor }} />
              ) : null}
              {p.eventDateLabel ? (
                <span className="inline-flex items-center gap-2">
                  <CalendarDays className="h-4 w-4" style={{ color: accent }} />
                  {p.eventDateLabel}
                </span>
              ) : null}
            </div>
          </div>

          {/* Chiffres-clés en ligne, séparés par des filets (plus premium que des cartes) */}
          <div data-pdf-atomic className="relative z-10">
            <div
              className="grid grid-cols-2 border-t pt-6 sm:grid-cols-4"
              style={{ borderColor: `${accent}33` }}
            >
              <CoverStat label="Talents" value={String(headline.talents)} accent={accent} displayFont={displayFont} />
              <CoverStat
                label={multiLineup ? "Audience moyenne" : "Audience cumulée"}
                value={formatCompact(headline.followers)}
                accent={accent}
                displayFont={displayFont}
              />
              <CoverStat label="Livrables" value={String(headline.livrables)} accent={accent} displayFont={displayFont} />
              <CoverStat
                label={multiLineup ? "EMV moyenne" : "EMV estimée"}
                value={hasEmv ? money(headline.emv, p.budgetCurrency) : "—"}
                accent={accent}
                displayFont={displayFont}
                last
              />
            </div>
            <div className="mt-7 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] opacity-50">
              <ArrowDown className="h-3.5 w-3.5 animate-bounce" />
              Faire défiler
            </div>
          </div>
        </section>

        {/* ===== INTRO ===== */}
        {p.introMessage ? (
          <Section>
            <Reveal>
              <div className="max-w-4xl">
                <span
                  aria-hidden
                  className="mb-8 block h-px w-12"
                  style={{ backgroundColor: `${accent}` }}
                />
                <p
                  className="text-[1.75rem] font-light leading-[1.35] tracking-[-0.01em] md:text-[3rem] md:leading-[1.25]"
                  style={{ fontFamily: displayFont }}
                >
                  {p.introMessage}
                </p>
                {p.contactName ? (
                  <p className="mt-8 text-sm uppercase tracking-[0.2em] opacity-55">
                    — {p.contactName}, Glow Up
                  </p>
                ) : null}
              </div>
            </Reveal>
          </Section>
        ) : null}

        {/* ===== CASTING ===== */}
        {p.casting.length > 0 ? (
          <Section>
            <SectionHeader
              index={nextNo()}
              eyebrow="Casting"
              title={castingGroupsOrder.length > 1 ? "Nos propositions de line-up" : "Les talents présents"}
              accent={accent}
              displayFont={displayFont}
            />
            <div className="space-y-16">
              {castingRenderGroups.map((gname) => {
                const members = p.casting
                  .map((c, i) => ({ c, i }))
                  .filter(({ c }) => castingGroupOf(c) === gname);
                if (members.length === 0) return null;
                return (
                  <div key={gname || "default"}>
                    {showCastingTitles ? (
                      <Reveal>
                        <div className="mb-8 flex items-center gap-3">
                          <h3 className="text-2xl font-medium md:text-3xl" style={{ fontFamily: displayFont }}>
                            {gname}
                          </h3>
                          <span className="h-px flex-1" style={{ backgroundColor: `${accent}2e` }} />
                        </div>
                      </Reveal>
                    ) : null}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
                      {members.map(({ c, i }) => {
                        const href = profileUrl(c);
                        return (
                        <Reveal key={`${c.name}-${i}`}>
                          <ProfileCardLink href={href}>
                          <article className="group">
                            <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl" style={{ backgroundColor: `${accent}14` }}>
                              {c.photoUrl ? (
                                <img
                                  src={c.photoUrl}
                                  alt={c.name}
                                  crossOrigin="anonymous"
                                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-5xl font-medium opacity-30" style={{ fontFamily: displayFont }}>
                                  {initials(c.name)}
                                </div>
                              )}
                              {c.role ? (
                                <span
                                  className="absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] backdrop-blur-sm"
                                  style={{ backgroundColor: `${baseBg}cc`, color: theme.textColor }}
                                >
                                  {c.role}
                                </span>
                              ) : null}
                              {href ? (
                                <span
                                  className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] opacity-0 backdrop-blur-sm transition-opacity duration-300 group-hover:opacity-100"
                                  style={{ backgroundColor: `${baseBg}cc`, color: theme.textColor }}
                                >
                                  <ExternalLink className="h-3 w-3" /> Profil
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-4">
                              <div className="flex items-baseline justify-between gap-2">
                                <h4 className="text-xl font-medium leading-tight md:text-2xl" style={{ fontFamily: displayFont }}>
                                  {c.name}
                                </h4>
                                {(c.platforms || []).length > 0 ? (
                                  <span className="inline-flex items-center gap-1 text-xs opacity-55">
                                    <Instagram className="h-3.5 w-3.5" />
                                    {(c.platforms || []).join(" · ")}
                                  </span>
                                ) : null}
                              </div>
                              {displayHandle(c.handle) ? <p className="mt-0.5 text-sm opacity-55">@{displayHandle(c.handle)}</p> : null}
                              <div
                                className="mt-4 flex items-stretch border-t pt-3"
                                style={{ borderColor: `${accent}26` }}
                              >
                                <div className="flex-1">
                                  <p className="text-lg font-semibold tabular-nums" style={{ fontFamily: displayFont }}>
                                    {formatCompact(c.followers)}
                                  </p>
                                  <p className="text-[10px] uppercase tracking-[0.14em] opacity-50">Abonnés</p>
                                </div>
                                <div className="flex-1 border-l pl-4" style={{ borderColor: `${accent}26` }}>
                                  <p className="text-lg font-semibold tabular-nums" style={{ fontFamily: displayFont }}>
                                    {typeof c.engagement === "number" ? `${c.engagement.toFixed(2)}%` : "—"}
                                  </p>
                                  <p className="text-[10px] uppercase tracking-[0.14em] opacity-50">Engagement</p>
                                </div>
                              </div>
                            </div>
                          </article>
                          </ProfileCardLink>
                        </Reveal>
                        );
                      })}
                    </div>
                    {hasEmv
                      ? (() => {
                          const gt = groupTotalOf(gname);
                          return gt.emv > 0 ? (
                            <Reveal className="mt-10">
                              {renderSummaryGrid(gt.reach, gt.emv, gt.interactions)}
                            </Reveal>
                          ) : null;
                        })()
                      : null}
                  </div>
                );
              })}
            </div>
          </Section>
        ) : null}

        {/* ===== BUDGET ===== */}
        {p.budgetLines.length > 0 ? (
          <Section>
            <SectionHeader
              index={nextNo()}
              eyebrow="Investissement"
              title={showBudgetTitles ? "Nos scénarios d'investissement" : "Le budget, ligne par ligne"}
              accent={accent}
              displayFont={displayFont}
            />
            <div className={showBudgetTitles ? "grid gap-x-12 gap-y-14 md:grid-cols-2" : ""}>
              {budgetRenderGroups.map((gname) => {
                const lines = p.budgetLines.filter((l) => budgetGroupOf(l) === gname);
                if (lines.length === 0) return null;
                const groupTotal = budgetGroupTotal(gname);
                return (
                  <Reveal key={gname || "budget"}>
                    {showBudgetTitles ? (
                      <h3 className="mb-5 text-2xl font-medium" style={{ color: accent, fontFamily: displayFont }}>
                        {gname}
                      </h3>
                    ) : null}
                    <div>
                      {lines.map((l, i) => (
                        <div
                          key={`${l.label}-${i}`}
                          className="flex items-baseline justify-between gap-4 border-b py-4"
                          style={{ borderColor: `${accent}1f` }}
                        >
                          <div>
                            <p className="text-base font-medium md:text-lg">{l.label}</p>
                            {l.detail ? <p className="mt-0.5 text-sm opacity-55">{l.detail}</p> : null}
                          </div>
                          <p className="shrink-0 text-lg font-medium tabular-nums md:text-xl" style={{ fontFamily: displayFont }}>
                            {money(l.amount, p.budgetCurrency)}
                          </p>
                        </div>
                      ))}
                      <div
                        className="mt-1 flex items-baseline justify-between gap-4 border-t-2 pt-5"
                        style={{ borderColor: accent }}
                      >
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-70">Total</p>
                        <p className="text-3xl font-semibold tabular-nums md:text-4xl" style={{ color: accent, fontFamily: displayFont }}>
                          {money(groupTotal, p.budgetCurrency)}
                        </p>
                      </div>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </Section>
        ) : null}

        {/* ===== DELIVERABLES ===== */}
        {p.deliverables.length > 0 ? (
          <Section>
            <SectionHeader
              index={nextNo()}
              eyebrow="Livrables garantis"
              title="Ce qui est produit, garanti"
              accent={accent}
              displayFont={displayFont}
            />
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              {(() => {
                const order: string[] = [];
                const map = new Map<
                  string,
                  { name: string; member?: CastingMember; items: { d: Deliverable; line: (typeof emv.lines)[number] }[] }
                >();
                p.deliverables.forEach((d, i) => {
                  const key = (d.talent || "—").trim().toLowerCase() || "—";
                  if (!map.has(key)) {
                    const member = p.casting.find(
                      (c) => (c.name || "").trim().toLowerCase() === (d.talent || "").trim().toLowerCase()
                    );
                    map.set(key, { name: d.talent || "Créateur", member, items: [] });
                    order.push(key);
                  }
                  map.get(key)!.items.push({ d, line: emv.lines[i] });
                });
                return order.map((key) => {
                  const g = map.get(key)!;
                  const totalEmv = g.items.reduce((s, it) => s + (it.line?.retained || 0), 0);
                  return (
                    <Reveal key={key}>
                      <article
                        className="flex h-full flex-col overflow-hidden rounded-2xl border"
                        style={{ borderColor: `${accent}59`, backgroundColor: `${accent}0a`, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}
                      >
                        {/* En-tête de carte : créateur + EMV totale, nettement séparé */}
                        <div
                          className="flex items-center justify-between gap-3 border-b px-6 py-5"
                          style={{ borderColor: `${accent}33` }}
                        >
                          <div>
                            <p className="text-2xl font-medium leading-tight" style={{ fontFamily: displayFont }}>{g.name}</p>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs opacity-55">
                              {g.member?.followers ? <span>{formatCompact(g.member.followers)} abonnés</span> : null}
                              {typeof g.member?.engagement === "number" ? <span>· {g.member.engagement.toFixed(1)} % eng.</span> : null}
                            </div>
                          </div>
                          {totalEmv > 0 ? (
                            <div className="shrink-0 text-right">
                              <p className="text-[10px] uppercase tracking-[0.16em] opacity-50">EMV totale</p>
                              <p className="text-2xl font-semibold md:text-3xl" style={{ color: accent, fontFamily: displayFont }}>
                                ≈ {money(roundEmv(totalEmv), p.budgetCurrency)}
                              </p>
                            </div>
                          ) : null}
                        </div>

                        <div className="px-6 pb-2">
                          {g.items.map(({ d, line }, k) => {
                            const qty = Number(d.quantity) || 1;
                            const fmt = (d.format || "Contenu").trim();
                            const plat = (d.platform || "").trim();
                            // Évite les doublons type « TikTok TikTok » (plateforme = format).
                            const contentLabel =
                              plat && plat.toLowerCase() === fmt.toLowerCase()
                                ? fmt
                                : `${plat ? plat + " " : ""}${fmt}`.trim();
                            const isStory = /story|stories|storie/i.test(`${d.format || ""} ${d.platform || ""}`);
                            const avgViews = d.avgViews ?? g.member?.avgViews;
                            const cells: { label: string; value: string }[] = [];
                            if (line && line.reach > 0) {
                              const reachLabel = isStory
                                ? (qty > 1 ? "Vues cumulées" : "Vues estimées")
                                : (line.estimated ? "Reach estimé" : "Reach observé");
                              cells.push({ label: reachLabel, value: formatCompact(line.reach) });
                            }
                            if (isStory && qty > 1 && line && line.reach > 0)
                              cells.push({ label: "Vues / story", value: formatCompact(line.reach / qty) });
                            if (avgViews) cells.push({ label: "Vues moyennes", value: formatCompact(avgViews) });
                            if (line && line.interactions > 0) cells.push({ label: "Interactions est.", value: `≈ ${formatCompact(line.interactions)}` });
                            return (
                              <div
                                key={k}
                                className="border-b py-4 last:border-b-0"
                                style={{ borderColor: `${accent}1f` }}
                              >
                                <div className="flex items-baseline justify-between gap-3">
                                  <p className="font-medium">
                                    {qty > 1 ? <span style={{ color: accent }}>{qty} × </span> : ""}
                                    {contentLabel}
                                  </p>
                                  {line && line.retained > 0 ? (
                                    <span className="shrink-0 text-base font-semibold tabular-nums" style={{ fontFamily: displayFont }}>
                                      ≈ {money(roundEmv(line.retained), p.budgetCurrency)}
                                    </span>
                                  ) : null}
                                </div>
                                {cells.length > 0 ? (
                                  <p className="mt-2 text-sm leading-relaxed">
                                    {cells.map((c, idx) => (
                                      <span key={c.label}>
                                        <span className="opacity-50">{c.label} </span>
                                        <b className="font-semibold tabular-nums">{c.value}</b>
                                        {idx < cells.length - 1 ? <span className="px-2 opacity-30">·</span> : null}
                                      </span>
                                    ))}
                                  </p>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </article>
                    </Reveal>
                  );
                });
              })()}
            </div>
            {hasEmv ? (
              <p className="mt-8 max-w-2xl text-xs leading-relaxed opacity-45">
                Reach et valeur média estimés sur la base des performances moyennes observées de chaque créateur.
              </p>
            ) : null}

            {hasEmv && !(showCastingTitles && castingTotals.length > 1) ? (
              <Reveal className="mt-12">
                {renderSummaryGrid(emv.reach, emv.emv, emv.interactions)}
              </Reveal>
            ) : null}
          </Section>
        ) : null}

        {/* ===== GALLERY ===== */}
        {p.photos.length > 0 ? (
          <Section>
            <SectionHeader
              index={nextNo()}
              eyebrow="L'univers"
              title="La galerie"
              accent={accent}
              displayFont={displayFont}
            />
            <div className="columns-1 gap-5 sm:columns-2 lg:columns-3 [&>*]:mb-5">
              {p.photos.map((src, i) => (
                <Reveal key={`${src}-${i}`}>
                  <img
                    src={src}
                    alt=""
                    crossOrigin="anonymous"
                    className="w-full break-inside-avoid rounded-xl object-cover"
                  />
                </Reveal>
              ))}
            </div>
          </Section>
        ) : null}

        {/* ===== LOGEMENT & LOGISTIQUE ===== */}
        {(p.logistics || []).length > 0 ? (
          <Section>
            <SectionHeader
              index={nextNo()}
              eyebrow="Logement & logistique"
              title="Le cadre & l'organisation"
              accent={accent}
              displayFont={displayFont}
            />
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {(p.logistics || []).map((item, i) => {
                const inner = (
                  <>
                    {item.imageUrl ? (
                      <div className="aspect-[16/10] w-full overflow-hidden bg-white/5">
                        <img
                          src={`/api/og-image?url=${encodeURIComponent(item.imageUrl)}`}
                          alt={item.label || ""}
                          crossOrigin="anonymous"
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ) : null}
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-lg font-medium" style={{ fontFamily: displayFont }}>{item.label || "Lien"}</p>
                        {item.url ? <ExternalLink className="h-4 w-4 shrink-0 opacity-70" /> : null}
                      </div>
                      {item.detail ? <p className="mt-1 text-sm opacity-70">{item.detail}</p> : null}
                      {item.url ? (
                        <p className="mt-3 truncate text-xs opacity-50">{item.url.replace(/^https?:\/\//, "")}</p>
                      ) : null}
                    </div>
                  </>
                );
                return item.url ? (
                  <Reveal key={i}>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block h-full overflow-hidden rounded-2xl border transition-transform hover:-translate-y-0.5"
                      style={{ borderColor: `${accent}40`, backgroundColor: "rgba(245,237,224,0.03)" }}
                    >
                      {inner}
                    </a>
                  </Reveal>
                ) : (
                  <Reveal key={i}>
                    <div
                      className="h-full overflow-hidden rounded-2xl border"
                      style={{ borderColor: `${accent}40`, backgroundColor: "rgba(245,237,224,0.03)" }}
                    >
                      {inner}
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </Section>
        ) : null}

        {/* ===== CONTACT / CTA ===== */}
        <section className="relative overflow-hidden px-6 py-28 text-center md:px-16">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{ background: `linear-gradient(90deg, transparent, ${accent}66, transparent)` }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: `radial-gradient(700px 360px at 50% 120%, ${accent}26, transparent 65%)` }}
          />
          <Reveal>
            <div className="relative z-10">
              <GlowUpLogo color={theme.textColor} className="mx-auto h-8 w-auto md:h-10" />
              <h2 className="mt-8 text-3xl font-semibold tracking-[-0.01em] md:text-6xl" style={{ fontFamily: displayFont }}>
                On construit ça ensemble ?
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-base opacity-70 md:text-lg">
                Cette proposition est confidentielle et personnalisée pour {p.nomMarque}.
              </p>
              {p.contactEmail ? (
                <a
                  href={`mailto:${p.contactEmail}`}
                  className="mt-9 inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold shadow-lg transition-transform hover:scale-105"
                  style={{ backgroundColor: accent, color: LICORICE }}
                >
                  <Mail className="h-4 w-4" />
                  {p.contactName ? `Échanger avec ${p.contactName}` : "Nous contacter"}
                </a>
              ) : null}
            </div>
          </Reveal>
        </section>

        {/* ===== FOOTER DE MARQUE ===== */}
        <footer
          className="flex flex-col items-center gap-3 border-t px-6 py-10 text-center md:flex-row md:justify-between md:px-12"
          style={{ borderColor: `${accent}26` }}
        >
          <GlowUpLogo color={theme.textColor} className="h-6 w-auto opacity-90" />
          <p className="text-[11px] uppercase tracking-[0.2em] opacity-45">
            Glow Up Agence · Document confidentiel
          </p>
        </footer>
        </div>
      </div>
    </AnimateContext.Provider>
  );
}

export function ProposalDeck({ token }: { token: string }) {
  const [proposal, setProposal] = useState<ProposalPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const deckRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/proposition/${token}`, { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Lien introuvable");
        if (!cancelled) setProposal(json.proposal as ProposalPayload);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erreur réseau");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Analytics best-effort : mesure le temps réellement passé sur la présentation
  // (onglet visible) et l'envoie par pings + sendBeacon à la fermeture.
  useEffect(() => {
    if (!proposal?.id) return;
    let viewId: string | null = null;
    let active = 0; // secondes actives cumulées
    let lastSent = -1;
    let disposed = false;
    const url = `/api/proposition/${token}/view`;

    const send = (payload: Record<string, unknown>, beacon = false) => {
      const data = JSON.stringify(payload);
      if (beacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([data], { type: "application/json" }));
        return;
      }
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: data,
        keepalive: true,
      }).catch(() => {});
    };

    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referrer: document.referrer || "" }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (!disposed) viewId = (j && j.viewId) || null;
      })
      .catch(() => {});

    const tick = window.setInterval(() => {
      if (document.visibilityState === "visible") active += 1;
      if (viewId && active !== lastSent && active % 10 === 0) {
        lastSent = active;
        send({ viewId, duration: active });
      }
    }, 1000);

    const flush = () => {
      if (viewId && active !== lastSent) {
        lastSent = active;
        send({ viewId, duration: active }, true);
      }
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", flush);

    return () => {
      disposed = true;
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [proposal?.id, token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: LICORICE }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: CREAM }} />
      </div>
    );
  }

  if (error || !proposal) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center"
        style={{ backgroundColor: LICORICE, color: CREAM }}
      >
        <GlowUpLogo variant="light" className="h-8 w-auto opacity-80" />
        <p className="text-lg font-medium">{error || "Proposition introuvable"}</p>
        <p className="text-sm opacity-60">Vérifie le lien reçu ou contacte ton interlocuteur Glow Up.</p>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: resolveTheme(proposal.theme).bgColor }} className="min-h-screen">
      <div ref={deckRef}>
        <ProposalDeckView proposal={proposal} />
      </div>
    </div>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <section className="relative px-6 py-20 md:px-12 md:py-28">
      <div className="mx-auto w-full max-w-5xl">{children}</div>
    </section>
  );
}

function SectionHeader({
  index,
  eyebrow,
  title,
  accent,
  displayFont,
}: {
  index?: string;
  eyebrow: string;
  title: string;
  accent: string;
  displayFont?: string;
}) {
  return (
    <Reveal>
      <div className="mb-12 md:mb-16">
        <div className="flex items-center gap-3">
          {index ? (
            <span className="text-sm font-semibold tabular-nums" style={{ color: accent, fontFamily: displayFont }}>
              {index}
            </span>
          ) : null}
          <span className="h-px w-8" style={{ backgroundColor: accent }} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.3em] opacity-60">{eyebrow}</span>
        </div>
        <h2
          className="mt-5 max-w-3xl text-4xl font-medium tracking-[-0.02em] md:text-[3.75rem] md:leading-[1.02]"
          style={{ fontFamily: displayFont }}
        >
          {title}
        </h2>
      </div>
    </Reveal>
  );
}

// Chiffre-clé de couverture : présenté en ligne, séparé par un filet vertical.
function CoverStat({
  label,
  value,
  accent,
  displayFont,
  last,
}: {
  label: string;
  value: string;
  accent: string;
  displayFont?: string;
  last?: boolean;
}) {
  return (
    <div className={`py-1 pr-4 ${last ? "" : "sm:border-r sm:pr-6"}`} style={{ borderColor: `${accent}33` }}>
      <p className="text-2xl font-semibold tabular-nums md:text-3xl" style={{ fontFamily: displayFont }}>
        {value}
      </p>
      <p className="mt-1 text-[10px] uppercase tracking-[0.16em] opacity-55">{label}</p>
    </div>
  );
}
