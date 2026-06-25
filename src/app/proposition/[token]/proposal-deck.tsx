"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Loader2,
  Download,
  MapPin,
  CalendarDays,
  Users,
  Wallet,
  Sparkles,
  Mail,
  Instagram,
  ImageIcon,
  Home,
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

export type BudgetLine = { label: string; detail?: string | null; amount?: number | null };

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

export type LogisticsItem = { label: string; url?: string | null; detail?: string | null };

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

const FONT_STACKS: Record<DeckTheme["font"], string> = {
  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  serif: 'ui-serif, Georgia, "Times New Roman", serif',
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
      className={`transition-all duration-700 ease-out ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      } ${className}`}
    >
      {children}
    </div>
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
  const budgetTotal = p.budgetLines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
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

  return (
    <AnimateContext.Provider value={animate}>
      <div style={{ ...deckBackgroundStyle(theme), color: theme.textColor, fontFamily: FONT_STACKS[theme.font] }}>
        {/* ===== COVER ===== */}
        <section className="relative flex min-h-screen flex-col justify-between overflow-hidden px-6 py-10 md:px-16 md:py-16">
          {p.coverPhotoUrl ? (
            <>
              <img
                src={p.coverPhotoUrl}
                alt=""
                crossOrigin="anonymous"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(180deg, ${hexToRgba(baseBg, 0.45)} 0%, ${hexToRgba(baseBg, 0.75)} 55%, ${baseBg} 100%)`,
                }}
              />
            </>
          ) : (
            <div
              className="absolute inset-0"
              style={{
                background: `radial-gradient(1200px 600px at 80% -10%, ${accent}40, transparent 60%), radial-gradient(900px 500px at 0% 110%, ${accent}30, transparent 55%)`,
              }}
            />
          )}

          <div className="relative z-10 flex items-center justify-between gap-4">
            <GlowUpLogo variant="light" className="h-7 w-auto md:h-9" />
            {p.brandLogoUrl ? (
              <img
                src={p.brandLogoUrl}
                alt={p.nomMarque}
                crossOrigin="anonymous"
                className="h-9 w-auto max-w-[180px] object-contain md:h-12"
              />
            ) : (
              <span className="text-sm font-medium opacity-80 md:text-base">{p.nomMarque}</span>
            )}
          </div>

          <div className="relative z-10 max-w-3xl">
            <span
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]"
              style={{ backgroundColor: `${accent}33`, color: theme.textColor }}
            >
              <Sparkles className="h-3.5 w-3.5" /> Proposition de partenariat
            </span>
            <h1 className="mt-5 text-4xl font-semibold leading-tight md:text-7xl">{p.title}</h1>
            {p.subtitle ? <p className="mt-3 text-lg opacity-80 md:text-2xl">{p.subtitle}</p> : null}
            <div className="mt-6 flex flex-wrap gap-4 text-sm opacity-80 md:text-base">
              {p.eventLocation ? (
                <span className="inline-flex items-center gap-2">
                  <MapPin className="h-4 w-4" style={{ color: accent }} />
                  {p.eventLocation}
                </span>
              ) : null}
              {p.eventDateLabel ? (
                <span className="inline-flex items-center gap-2">
                  <CalendarDays className="h-4 w-4" style={{ color: accent }} />
                  {p.eventDateLabel}
                </span>
              ) : null}
            </div>
          </div>

          <div className="relative z-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatPill label="Talents" value={String(p.casting.length)} accent={accent} />
            <StatPill label="Audience cumulée" value={formatCompact(totalFollowers)} accent={accent} />
            <StatPill label="Livrables" value={String(p.deliverables.length)} accent={accent} />
            <StatPill
              label="EMV estimée"
              value={hasEmv ? money(emv.emv, p.budgetCurrency) : "—"}
              accent={accent}
            />
          </div>
        </section>

        {/* ===== INTRO ===== */}
        {p.introMessage ? (
          <Section>
            <Reveal>
              <p className="mx-auto max-w-3xl text-center text-xl font-light leading-relaxed md:text-3xl">
                {p.introMessage}
              </p>
            </Reveal>
          </Section>
        ) : null}

        {/* ===== CASTING ===== */}
        {p.casting.length > 0 ? (
          <Section>
            <SectionHeader
              icon={<Users className="h-5 w-5" />}
              eyebrow="Proposition de casting"
              title={castingGroupsOrder.length > 1 ? "Nos propositions de casting" : "Les talents présents"}
              accent={accent}
            />
            <div className="mt-10 space-y-12">
              {castingRenderGroups.map((gname) => {
                const members = p.casting
                  .map((c, i) => ({ c, i }))
                  .filter(({ c }) => castingGroupOf(c) === gname);
                if (members.length === 0) return null;
                return (
                  <div key={gname || "default"}>
                    {showCastingTitles ? (
                      <Reveal>
                        <h3
                          className="mb-6 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold uppercase tracking-[0.15em]"
                          style={{ backgroundColor: `${accent}26`, color: theme.textColor }}
                        >
                          {gname}
                        </h3>
                      </Reveal>
                    ) : null}
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {members.map(({ c, i }) => (
                <Reveal key={`${c.name}-${i}`}>
                  <article
                    className="group h-full overflow-hidden rounded-3xl border bg-white/[0.03] backdrop-blur-sm"
                    style={{ borderColor: `${accent}33` }}
                  >
                    <div className="relative aspect-[4/5] w-full overflow-hidden bg-white/5">
                      {c.photoUrl ? (
                        <img
                          src={c.photoUrl}
                          alt={c.name}
                          crossOrigin="anonymous"
                          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-4xl font-semibold opacity-40">
                          {initials(c.name)}
                        </div>
                      )}
                      <div
                        className="absolute inset-x-0 bottom-0 h-2/3"
                        style={{ background: `linear-gradient(180deg, transparent, ${hexToRgba(baseBg, 0.94)})` }}
                      />
                      <div className="absolute inset-x-0 bottom-0 p-4">
                        <h3 className="text-lg font-semibold">{c.name}</h3>
                        {c.handle ? <p className="text-sm opacity-70">@{c.handle.replace(/^@/, "")}</p> : null}
                        {c.role ? (
                          <span
                            className="mt-2 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                            style={{ backgroundColor: `${accent}40` }}
                          >
                            {c.role}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
                      <div>
                        <p className="text-lg font-semibold">{formatCompact(c.followers)}</p>
                        <p className="text-[11px] uppercase tracking-wide opacity-60">Abonnés</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-semibold">
                          {typeof c.engagement === "number" ? `${c.engagement.toFixed(2)}%` : "—"}
                        </p>
                        <p className="text-[11px] uppercase tracking-wide opacity-60">Engagement</p>
                      </div>
                    </div>
                    {(c.platforms || []).length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 px-4 pb-4">
                        {(c.platforms || []).map((pf) => (
                          <span
                            key={pf}
                            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]"
                            style={{ borderColor: `${accent}40` }}
                          >
                            <Instagram className="h-3 w-3" />
                            {pf}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </article>
                </Reveal>
              ))}
                    </div>
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
              icon={<Wallet className="h-5 w-5" />}
              eyebrow="Budget détaillé & consolidé"
              title="L'investissement, ligne par ligne"
              accent={accent}
            />
            <Reveal className="mt-10">
              <div className="overflow-hidden rounded-3xl border" style={{ borderColor: `${accent}33` }}>
                {p.budgetLines.map((l, i) => (
                  <div
                    key={`${l.label}-${i}`}
                    className="flex items-center justify-between gap-4 border-b px-5 py-4 last:border-b-0 md:px-8"
                    style={{ borderColor: `${accent}1f` }}
                  >
                    <div>
                      <p className="font-medium">{l.label}</p>
                      {l.detail ? <p className="text-sm opacity-60">{l.detail}</p> : null}
                    </div>
                    <p className="shrink-0 text-lg font-semibold tabular-nums">{money(l.amount, p.budgetCurrency)}</p>
                  </div>
                ))}
                <div
                  className="flex items-center justify-between gap-4 px-5 py-5 md:px-8"
                  style={{ backgroundColor: `${accent}26` }}
                >
                  <p className="text-base font-semibold uppercase tracking-wide">Total</p>
                  <p className="text-2xl font-bold tabular-nums">{money(budgetTotal, p.budgetCurrency)}</p>
                </div>
              </div>
            </Reveal>
          </Section>
        ) : null}

        {/* ===== DELIVERABLES ===== */}
        {p.deliverables.length > 0 ? (
          <Section>
            <SectionHeader
              icon={<Sparkles className="h-5 w-5" />}
              eyebrow="Livrables garantis"
              title="Ce qui est produit, garanti"
              accent={accent}
            />
            <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-2">
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
                      <article className="flex h-full flex-col rounded-3xl border p-6" style={{ borderColor: `${accent}33`, backgroundColor: "rgba(245,237,224,0.03)" }}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xl font-semibold">{g.name}</p>
                            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-60">
                              {g.member?.followers ? <span>{formatCompact(g.member.followers)} abonnés</span> : null}
                              {typeof g.member?.engagement === "number" ? <span>{g.member.engagement.toFixed(1)} % engagement</span> : null}
                            </div>
                          </div>
                          {totalEmv > 0 ? (
                            <div className="text-right">
                              <p className="text-2xl font-bold" style={{ color: accent }}>
                                ≈ {money(roundEmv(totalEmv), p.budgetCurrency)}
                              </p>
                              <p className="text-[11px] uppercase tracking-wide opacity-50">EMV estimée</p>
                            </div>
                          ) : null}
                        </div>

                        <div className="mt-5 space-y-4">
                          {g.items.map(({ d, line }, k) => {
                            const qty = Number(d.quantity) || 1;
                            const contentLabel = `${d.platform ? d.platform + " " : ""}${d.format || "Contenu"}`.trim();
                            const avgViews = d.avgViews ?? g.member?.avgViews;
                            const cells: { label: string; value: string }[] = [];
                            if (line && line.reach > 0) cells.push({ label: line.estimated ? "Reach estimé" : "Reach observé", value: formatCompact(line.reach) });
                            if (avgViews) cells.push({ label: "Vues moyennes", value: formatCompact(avgViews) });
                            if (line && line.interactions > 0) cells.push({ label: "Interactions est.", value: `≈ ${formatCompact(line.interactions)}` });
                            return (
                              <div key={k} className="border-t pt-4 first:border-t-0 first:pt-0" style={{ borderColor: `${accent}1f` }}>
                                <div className="flex items-center justify-between gap-3">
                                  <span
                                    className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium"
                                    style={{ backgroundColor: `${accent}33` }}
                                  >
                                    {qty > 1 ? `${qty} × ` : ""}
                                    {contentLabel}
                                  </span>
                                  {line && line.retained > 0 ? (
                                    <span className="text-base font-semibold tabular-nums">≈ {money(roundEmv(line.retained), p.budgetCurrency)}</span>
                                  ) : null}
                                </div>
                                {cells.length > 0 ? (
                                  <div className="mt-3 grid grid-cols-3 gap-x-4 gap-y-2">
                                    {cells.map((c) => (
                                      <div key={c.label}>
                                        <p className="text-[10px] uppercase tracking-wide opacity-50">{c.label}</p>
                                        <p className="text-sm font-semibold">{c.value}</p>
                                      </div>
                                    ))}
                                  </div>
                                ) : null}
                                {line && line.reach > 0 ? (
                                  <p className="mt-3 text-[13px] leading-relaxed opacity-70">
                                    {qty > 1 ? `Ces ${qty} ${d.format || "contenus"}` : `Ce ${d.format || "contenu"}`} devrait toucher environ{" "}
                                    <b>{formatCompact(line.reach)}</b> personnes
                                    {line.interactions > 0 ? (
                                      <>
                                        {" "}et générer près de <b>{formatCompact(line.interactions)}</b> interactions
                                      </>
                                    ) : null}
                                    , pour une valeur média estimée à <b>≈ {money(roundEmv(line.retained), p.budgetCurrency)}</b>.
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
              <p className="mt-4 text-center text-xs opacity-50">
                Reach et valeur média estimés sur la base des performances moyennes observées de chaque créateur (jamais garantis pour de l&apos;organique).
              </p>
            ) : null}

            {hasEmv ? (
              <Reveal className="mt-10">
                <div
                  className="grid grid-cols-1 gap-px overflow-hidden rounded-3xl border sm:grid-cols-3"
                  style={{ borderColor: `${accent}40`, backgroundColor: `${accent}26` }}
                >
                  <div className="p-7 text-center" style={{ backgroundColor: baseBg }}>
                    <p className="text-xs uppercase tracking-[0.2em] opacity-60">Reach total estimé</p>
                    <p className="mt-2 text-3xl font-bold md:text-4xl">{formatCompact(emv.reach)}</p>
                    <p className="mt-1 text-xs opacity-50">personnes touchées</p>
                  </div>
                  <div className="p-7 text-center" style={{ backgroundColor: baseBg }}>
                    <p className="text-xs uppercase tracking-[0.2em] opacity-60">EMV totale estimée</p>
                    <p className="mt-2 text-3xl font-bold md:text-4xl" style={{ color: accent }}>
                      {money(emv.emv, p.budgetCurrency)}
                    </p>
                    <p className="mt-1 text-xs opacity-50">≈ {formatCompact(emv.interactions)} interactions</p>
                  </div>
                  <div className="p-7 text-center" style={{ backgroundColor: baseBg }}>
                    <p className="text-xs uppercase tracking-[0.2em] opacity-60">
                      {budgetTotal > 0 ? "Retour sur investissement" : "Investissement"}
                    </p>
                    {budgetTotal > 0 ? (
                      <>
                        <p className="mt-2 text-3xl font-bold md:text-4xl">
                          ×{(emv.emv / budgetTotal).toFixed(1)}
                        </p>
                        <p className="mt-1 text-xs opacity-50">EMV / investissement de {money(budgetTotal, p.budgetCurrency)}</p>
                      </>
                    ) : (
                      <p className="mt-2 text-3xl font-bold md:text-4xl">{money(budgetTotal, p.budgetCurrency)}</p>
                    )}
                  </div>
                </div>
              </Reveal>
            ) : null}
          </Section>
        ) : null}

        {/* ===== GALLERY ===== */}
        {p.photos.length > 0 ? (
          <Section>
            <SectionHeader
              icon={<ImageIcon className="h-5 w-5" />}
              eyebrow="L'univers"
              title="Galerie"
              accent={accent}
            />
            <div className="mt-10 columns-1 gap-4 sm:columns-2 lg:columns-3 [&>*]:mb-4">
              {p.photos.map((src, i) => (
                <Reveal key={`${src}-${i}`}>
                  <img
                    src={src}
                    alt=""
                    crossOrigin="anonymous"
                    className="w-full break-inside-avoid rounded-2xl object-cover"
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
              icon={<Home className="h-5 w-5" />}
              eyebrow="Logement & logistique"
              title="Le cadre & l'organisation"
              accent={accent}
            />
            <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(p.logistics || []).map((item, i) => {
                const inner = (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold">{item.label || "Lien"}</p>
                      {item.url ? <ExternalLink className="h-4 w-4 shrink-0 opacity-70" /> : null}
                    </div>
                    {item.detail ? <p className="mt-1 text-sm opacity-70">{item.detail}</p> : null}
                    {item.url ? (
                      <p className="mt-3 truncate text-xs opacity-50">{item.url.replace(/^https?:\/\//, "")}</p>
                    ) : null}
                  </>
                );
                return item.url ? (
                  <Reveal key={i}>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block h-full rounded-2xl border p-5 transition-transform hover:-translate-y-0.5"
                      style={{ borderColor: `${accent}40`, backgroundColor: "rgba(245,237,224,0.03)" }}
                    >
                      {inner}
                    </a>
                  </Reveal>
                ) : (
                  <Reveal key={i}>
                    <div
                      className="h-full rounded-2xl border p-5"
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
        <section className="px-6 py-24 text-center md:px-16">
          <Reveal>
            <GlowUpLogo variant="light" className="mx-auto h-8 w-auto md:h-10" />
            <h2 className="mt-8 text-3xl font-semibold md:text-5xl">On construit ça ensemble ?</h2>
            <p className="mx-auto mt-4 max-w-xl opacity-70">
              Cette proposition est confidentielle et personnalisée pour {p.nomMarque}.
            </p>
            {p.contactEmail ? (
              <a
                href={`mailto:${p.contactEmail}`}
                className="mt-8 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-transform hover:scale-105"
                style={{ backgroundColor: accent, color: LICORICE }}
              >
                <Mail className="h-4 w-4" />
                {p.contactName ? `Échanger avec ${p.contactName}` : "Nous contacter"}
              </a>
            ) : null}
          </Reveal>
        </section>
      </div>
    </AnimateContext.Provider>
  );
}

export function ProposalDeck({ token }: { token: string }) {
  const [proposal, setProposal] = useState<ProposalPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
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

  const exportPdf = useCallback(async () => {
    if (!deckRef.current || !proposal) return;
    setExporting(true);
    try {
      const [{ default: jsPDF }, html2canvasModule] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);
      const html2canvas = html2canvasModule.default;
      const canvas = await html2canvas(deckRef.current, {
        backgroundColor: resolveTheme(proposal.theme).bgColor,
        scale: 2,
        useCORS: true,
        windowWidth: deckRef.current.scrollWidth,
      });
      const imgData = canvas.toDataURL("image/jpeg", 0.92);
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      const safeName = `${proposal.subtitle || "GlowUp"} x ${proposal.nomMarque}`
        .replace(/[^\w\sÀ-ÿ-]/g, "")
        .trim();
      pdf.save(`Proposition ${safeName}.pdf`);
    } catch (e) {
      console.error("Export PDF:", e);
      window.alert("Impossible de générer le PDF. Réessaie ou utilise l'impression du navigateur.");
    } finally {
      setExporting(false);
    }
  }, [proposal]);

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

      <button
        type="button"
        onClick={exportPdf}
        disabled={exporting}
        className="fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold shadow-lg transition-transform hover:scale-105 disabled:opacity-70"
        style={{ backgroundColor: CREAM, color: LICORICE }}
      >
        {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {exporting ? "Génération…" : "Télécharger en PDF"}
      </button>
    </div>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <section className="px-6 py-16 md:px-16 md:py-24">{children}</section>;
}

function SectionHeader({
  icon,
  eyebrow,
  title,
  accent,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  accent: string;
}) {
  return (
    <Reveal>
      <div className="mx-auto max-w-3xl text-center">
        <span
          className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]"
          style={{ backgroundColor: `${accent}26` }}
        >
          {icon}
          {eyebrow}
        </span>
        <h2 className="mt-4 text-3xl font-semibold md:text-5xl">{title}</h2>
      </div>
    </Reveal>
  );
}

function StatPill({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div
      className="rounded-2xl border px-4 py-3 backdrop-blur-sm"
      style={{ borderColor: `${accent}40`, backgroundColor: "rgba(245,237,224,0.04)" }}
    >
      <p className="text-xl font-bold md:text-2xl">{value}</p>
      <p className="text-[11px] uppercase tracking-wide opacity-60">{label}</p>
    </div>
  );
}
