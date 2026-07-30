"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type Criterion = {
  label: string;
  filter?: string;
  value?: string;
  cat?: string;
  plat?: string;
};

export type TalentSearchBarProps = {
  onCriterion?: (c: Criterion) => void;
  onSearch?: (query: string, criteria: Criterion[]) => void;
  onClear?: () => void;
  typeSpeed?: number;
  autoDemo?: boolean;
  accent?: string;
  className?: string;
};

const EXAMPLES = [
  "Créatrices cheveux blond habitant à paris",
  "Créateurs sportifs",
  "Créatrices beauté peau sensible vivant à lyon",
  "Créateurs food basés à marseille",
  "Créatrices mode voyage habitant à bordeaux",
];

const SUGGESTIONS = [
  "Créatrices cheveux blond habitant à paris",
  "Créateurs sportifs",
  "Créatrices beauté peau sensible vivant à lyon",
  "Créateurs food basés à marseille",
  "Créatrices mode voyage habitant à bordeaux",
];

type Rule = Criterion & { re: RegExp };

const RULES: Rule[] = [
  { re: /blond/i, label: "Cheveux blonds", filter: "Couleur de cheveux", value: "Blond" },
  { re: /brun|châtain|chatain/i, label: "Cheveux bruns", filter: "Couleur de cheveux", value: "Brun" },
  { re: /paris/i, label: "Paris", filter: "Ville", value: "Paris" },
  { re: /lyon/i, label: "Lyon", filter: "Ville", value: "Lyon" },
  { re: /marseille/i, label: "Marseille", filter: "Ville", value: "Marseille" },
  { re: /bordeaux/i, label: "Bordeaux", filter: "Ville", value: "Bordeaux" },
  { re: /yoga|pilates/i, label: "Yoga", cat: "Sport", filter: "Sports", value: "Yoga" },
  { re: /running|course|fitness/i, label: "Running", cat: "Sport", filter: "Sports", value: "Running" },
  { re: /beaut|skincare/i, label: "Beauté", cat: "Beauty" },
  { re: /peau sensible/i, label: "Peau sensible", filter: "Type de peau", value: "Sensible" },
  { re: /enfant|famille|maman|papa/i, label: "Famille", cat: "Family", filter: "Âge des enfants", value: "0-6 ans" },
  { re: /food|cuisine|végé|vege|recette/i, label: "Food", cat: "Food" },
  { re: /lifestyle/i, label: "Lifestyle", cat: "Lifestyle" },
  { re: /mode|fashion|style/i, label: "Fashion", cat: "Fashion" },
  { re: /voyage|travel/i, label: "Voyage", cat: "Voyage" },
  { re: /chien|chat|animal|animaux/i, label: "Animaux", cat: "Animaux", filter: "Animaux", value: "Chien" },
  { re: /tiktok/i, label: "TikTok", plat: "TikTok" },
  { re: /youtube/i, label: "YouTube", plat: "YouTube" },
  { re: /instagram/i, label: "Instagram", plat: "Instagram" },
  { re: /nano|micro/i, label: "Nano-influence" },
  { re: /créatrice|creatrice|femme/i, label: "Femme" },
];

function parseBrief(text: string): Criterion[] {
  const seen = new Set<string>();
  const out: Criterion[] = [];
  for (const r of RULES) {
    if (out.length >= 5 || seen.has(r.label) || !r.re.test(text)) continue;
    seen.add(r.label);
    const { re, ...c } = r;
    out.push(c);
  }
  const k = text.match(/(\d+)\s*k/i);
  if (k && out.length < 5) out.push({ label: `~${k[1]}K abonnés` });
  if (!out.length) {
    text
      .split(/[\s,]+/)
      .filter((w) => w.length > 4)
      .slice(0, 3)
      .forEach((w) => out.push({ label: w }));
  }
  return out;
}

const KEYFRAMES = `
@keyframes tsbBlink { 0%,49% { opacity: 1 } 50%,100% { opacity: 0 } }
@keyframes tsbSpin { to { transform: rotate(360deg) } }
@keyframes tsbFadeUp {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes tsbPulse {
  0%, 100% { opacity: .35; }
  50% { opacity: 1; }
}
@keyframes tsbSweepProgress {
  0% { transform: translateX(-120%); }
  100% { transform: translateX(320%); }
}
`;

type Phase = "idle" | "writing" | "analyzing" | "results";

export default function TalentSearchBar({
  onCriterion,
  onSearch,
  onClear,
  typeSpeed = 46,
  autoDemo = true,
  accent = "#220101",
  className,
}: TalentSearchBarProps) {
  const [query, setQuery] = useState("");
  const [ghost, setGhost] = useState("");
  const [focused, setFocused] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [tokens, setTokens] = useState<Criterion[]>([]);
  const [shown, setShown] = useState(0);
  const [hoverClear, setHoverClear] = useState(false);
  const [hoverCta, setHoverCta] = useState(false);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const state = useRef({ query: "", phase: "idle" as Phase, focused: false });
  state.current = { query, phase, focused };

  const wait = useCallback((ms: number, fn: () => void) => {
    const t = setTimeout(fn, ms);
    timers.current.push(t);
    return t;
  }, []);
  const kill = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const g = useRef({ i: 0, n: 0, del: false });
  useEffect(() => {
    if (!autoDemo) return;
    let alive = true;
    const step = () => {
      if (!alive) return;
      const s = state.current;
      if (s.phase !== "idle" || s.query || s.focused) return wait(500, step);
      const full = EXAMPLES[g.current.i % EXAMPLES.length];
      if (!g.current.del) {
        g.current.n = Math.min(g.current.n + 1, full.length);
        setGhost(full.slice(0, g.current.n));
        if (g.current.n >= full.length) {
          g.current.del = true;
          return wait(280, step);
        }
        return wait(typeSpeed + Math.random() * 45, step);
      }
      g.current.n = Math.max(g.current.n - 1, 0);
      setGhost(full.slice(0, g.current.n));
      if (g.current.n === 0) {
        g.current.del = false;
        g.current.i++;
        return wait(90, step);
      }
      return wait(26, step);
    };
    step();
    return () => {
      alive = false;
    };
  }, [autoDemo, typeSpeed, wait]);

  const analyze = useCallback(
    (text: string) => {
      const found = parseBrief(text);
      setPhase("analyzing");
      setTokens(found);
      setShown(0);
      found.forEach((c, i) => {
        wait(220 + i * 240, () => {
          setShown(i + 1);
          onCriterion?.(c);
        });
      });
      wait(320 + found.length * 240 + 460, () => {
        setPhase("results");
        onSearch?.(text, found);
      });
    },
    [onCriterion, onSearch, wait]
  );

  const autoWrite = useCallback(
    (text: string) => {
      kill();
      setPhase("writing");
      setQuery("");
      setTokens([]);
      setShown(0);
      let n = 0;
      const step = () => {
        n++;
        setQuery(text.slice(0, n));
        if (n < text.length) return wait(typeSpeed * 0.7 + Math.random() * 34, step);
        wait(480, () => analyze(text));
      };
      wait(240, step);
    },
    [analyze, kill, typeSpeed, wait]
  );

  const submit = () => {
    const q = query.trim();
    if (!q) return autoWrite(EXAMPLES[g.current.i % EXAMPLES.length]);
    kill();
    analyze(q);
  };

  const clear = () => {
    kill();
    g.current = { i: g.current.i + 1, n: 0, del: false };
    setQuery("");
    setGhost("");
    setPhase("idle");
    setTokens([]);
    setShown(0);
    onClear?.();
  };

  const busy = phase === "analyzing" || phase === "writing";
  const hasQ = !!query.trim();
  const active = focused || busy;

  const status =
    phase === "writing"
      ? "Composition du brief…"
      : phase === "analyzing"
        ? "Extraction des critères…"
        : phase === "results"
          ? "Sélection affinée"
          : "Recherche en langage naturel";

  return (
    <div
      className={className}
      style={{
        fontFamily: "Switzer, Figtree, system-ui, sans-serif",
        color: "#220101",
      }}
    >
      <style>{KEYFRAMES}</style>

      {/* Shell */}
      <div
        style={{
          position: "relative",
          borderRadius: 18,
          background: "#FFFFFF",
          border: `1px solid ${active ? "rgba(34,1,1,.18)" : "rgba(34,1,1,.08)"}`,
          boxShadow: active
            ? "0 1px 0 rgba(255,255,255,.8) inset, 0 18px 40px -28px rgba(34,1,1,.35)"
            : "0 1px 0 rgba(255,255,255,.9) inset, 0 10px 28px -22px rgba(34,1,1,.22)",
          transition: "border-color .3s ease, box-shadow .3s ease",
          overflow: "hidden",
        }}
      >
        {/* Top hairline */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 20,
            right: 20,
            height: 1,
            background: "linear-gradient(90deg, transparent, rgba(34,1,1,.08), transparent)",
            pointerEvents: "none",
          }}
        />

        {/* Input row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 10px 10px 18px",
          }}
        >
          <div
            style={{
              flex: "none",
              width: 28,
              height: 28,
              borderRadius: 9,
              display: "grid",
              placeItems: "center",
              background: busy ? "rgba(34,1,1,.06)" : "transparent",
              transition: "background .25s ease",
            }}
          >
            <SearchIcon color={busy ? accent : "rgba(34,1,1,.35)"} size={16} spinning={busy} />
          </div>

          <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
            <input
              type="text"
              value={query}
              aria-label="Rechercher un talent"
              onChange={(e) => {
                kill();
                setQuery(e.target.value);
                setPhase("idle");
                setTokens([]);
                setShown(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              style={{
                width: "100%",
                border: "none",
                outline: "none",
                background: "transparent",
                font: "inherit",
                fontSize: 14,
                lineHeight: 1.45,
                color: "#220101",
                padding: "10px 0",
                letterSpacing: "-.01em",
                fontWeight: 450,
              }}
            />
            {!query && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  pointerEvents: "none",
                  fontSize: 14,
                  letterSpacing: "-.01em",
                  color: "rgba(34,1,1,.32)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  maskImage: "linear-gradient(90deg, #000 70%, transparent)",
                  WebkitMaskImage: "linear-gradient(90deg, #000 70%, transparent)",
                }}
              >
                <span style={{ flex: "none", fontWeight: 400 }}>{ghost}</span>
                <span
                  style={{
                    flex: "none",
                    width: 1.5,
                    height: 15,
                    marginLeft: 1,
                    background: "rgba(34,1,1,.45)",
                    animation: "tsbBlink 1.05s steps(1) infinite",
                    opacity: focused ? 0 : 1,
                  }}
                />
              </div>
            )}
          </div>

          {hasQ && !busy && (
            <button
              type="button"
              onClick={clear}
              aria-label="Effacer"
              onMouseEnter={() => setHoverClear(true)}
              onMouseLeave={() => setHoverClear(false)}
              style={{
                flex: "none",
                width: 30,
                height: 30,
                borderRadius: 10,
                border: "none",
                background: hoverClear ? "rgba(34,1,1,.08)" : "rgba(34,1,1,.04)",
                color: "rgba(34,1,1,.45)",
                cursor: "pointer",
                display: "grid",
                placeItems: "center",
                transition: "background .2s ease, color .2s ease",
              }}
            >
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          )}

          <button
            type="button"
            onClick={submit}
            onMouseEnter={() => setHoverCta(true)}
            onMouseLeave={() => setHoverCta(false)}
            style={{
              flex: "none",
              display: "flex",
              alignItems: "center",
              gap: 8,
              border: "none",
              cursor: "pointer",
              font: "inherit",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: ".04em",
              textTransform: "uppercase",
              color: "#F5EDE0",
              padding: "11px 16px",
              borderRadius: 12,
              background: accent,
              opacity: hasQ || busy ? 1 : hoverCta ? 0.92 : 0.72,
              transform: hoverCta && (hasQ || busy) ? "translateY(-0.5px)" : "none",
              transition: "opacity .25s ease, transform .2s ease",
            }}
          >
            {busy ? (
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: "#F5EDE0",
                  animation: "tsbPulse 1.1s ease-in-out infinite",
                }}
              />
            ) : (
              <SearchIcon color="currentColor" size={13} />
            )}
            <span>
              {phase === "writing" ? "Écriture" : phase === "analyzing" ? "Analyse" : "Rechercher"}
            </span>
          </button>
        </div>

        {/* Progress hairline */}
        <div
          style={{
            height: 1,
            background: "rgba(34,1,1,.06)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              width: busy ? "40%" : phase === "results" ? "100%" : "0%",
              background: accent,
              opacity: busy || phase === "results" ? 0.55 : 0,
              transition: busy
                ? "none"
                : "width .6s cubic-bezier(.2,.8,.2,1), opacity .3s ease",
              animation: busy ? "tsbSweepProgress 1.4s cubic-bezier(.4,0,.2,1) infinite" : undefined,
            }}
          />
        </div>

        {/* Footer meta */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "9px 16px 11px 18px",
            background: "linear-gradient(180deg, rgba(245,237,224,.35), rgba(245,237,224,.55))",
            minHeight: 38,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                flex: "none",
                background: busy ? accent : phase === "results" ? "#2F6B4F" : "rgba(34,1,1,.2)",
                animation: busy ? "tsbPulse 1.2s ease-in-out infinite" : undefined,
              }}
            />
            <span
              style={{
                fontSize: 11,
                letterSpacing: ".02em",
                color: "rgba(34,1,1,.45)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {status}
            </span>
          </div>

          {phase === "idle" && !hasQ && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                flexWrap: "wrap",
                justifyContent: "flex-end",
              }}
            >
              {SUGGESTIONS.slice(0, 3).map((s) => (
                <SuggestionChip key={s} label={s} onClick={() => autoWrite(s)} />
              ))}
            </div>
          )}

          {phase !== "idle" && tokens.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {tokens.map((t, i) => (
                <span
                  key={t.label}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    background: "#FFFFFF",
                    border: "1px solid rgba(34,1,1,.1)",
                    color: "#220101",
                    fontSize: 10.5,
                    fontWeight: 550,
                    letterSpacing: ".01em",
                    padding: "4px 9px 4px 7px",
                    borderRadius: 999,
                    opacity: shown > i ? 1 : 0,
                    transform: shown > i ? "translateY(0)" : "translateY(4px)",
                    transition: "opacity .32s ease, transform .32s ease",
                    animation: shown > i ? "tsbFadeUp .32s ease" : undefined,
                  }}
                >
                  <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12.5l5.2 5.2L20 7" />
                  </svg>
                  {t.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SuggestionChip({ label, onClick }: { label: string; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  const short =
    label.length > 28 ? `${label.slice(0, 26).trimEnd()}…` : label;

  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        border: "none",
        background: "transparent",
        cursor: "pointer",
        font: "inherit",
        fontSize: 11,
        fontWeight: 500,
        color: hover ? "#220101" : "rgba(34,1,1,.48)",
        padding: "2px 0",
        borderBottom: `1px solid ${hover ? "rgba(34,1,1,.35)" : "rgba(34,1,1,.14)"}`,
        transition: "color .2s ease, border-color .2s ease",
        whiteSpace: "nowrap",
      }}
    >
      {short}
    </button>
  );
}

function SearchIcon({ color, size, spinning }: { color: string; size: number; spinning?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      style={{ flex: "none", animation: spinning ? "tsbSpin 1.1s linear infinite" : undefined }}
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4.2-4.2" />
    </svg>
  );
}
