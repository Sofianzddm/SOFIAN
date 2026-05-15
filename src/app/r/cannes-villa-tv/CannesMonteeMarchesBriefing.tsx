"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { GlowUpLogo } from "@/components/ui/logo";

const SLIDE_COUNT = 8;

const CANNES_LOGO = "/cannes-briefing/cannes.png";
const UNIVERSAL_LOGO = "/cannes-briefing/universal.png";
const PLAN_TAPIS_PHOTO = "/cannes-briefing/plan-tapis-photographes.png";
const PHOTO_OLIVIERS_1 = "/cannes-briefing/photo-oliviers-tapis-1.png";
const PHOTO_OLIVIERS_2 = "/cannes-briefing/photo-oliviers-tapis-2.png";

const EASE_SLIDE = "cubic-bezier(0.16, 1, 0.3, 1)";

function PartnerLogo({
  src,
  alt,
  className,
  priority,
}: {
  src: string;
  alt: string;
  className: string;
  priority?: boolean;
}) {
  return (
    <div className={`relative ${className}`}>
      <Image src={src} alt={alt} fill sizes="240px" className="object-contain" priority={priority} />
    </div>
  );
}

/** Bandeau signatures — taille « keynote » */
function PartnersStrip() {
  return (
    <div className="flex w-full items-end justify-between gap-6 border-b border-white/[0.08] pb-5 sm:gap-10 sm:pb-7">
      <GlowUpLogo className="h-9 w-auto max-w-[11rem] shrink-0 sm:h-11 sm:max-w-[13rem] md:h-12" variant="light" />
      <div className="flex items-end justify-end gap-6 sm:gap-10 md:gap-12">
        <PartnerLogo src={CANNES_LOGO} alt="Festival de Cannes" className="h-10 w-32 shrink-0 sm:h-12 sm:w-40 md:h-14 md:w-44" />
        <div className="hidden h-12 w-px shrink-0 bg-white/15 sm:block" aria-hidden />
        <PartnerLogo src={UNIVERSAL_LOGO} alt="Universal Pictures" className="h-11 w-40 shrink-0 sm:h-14 sm:w-48 md:h-16 md:w-56" />
      </div>
    </div>
  );
}

function SlideShell({
  children,
  slideIndex,
  showPartnersStrip,
  fullBleed,
}: {
  children: React.ReactNode;
  slideIndex: number;
  showPartnersStrip?: boolean;
  fullBleed?: boolean;
}) {
  return (
    <div
      className="relative flex h-[100dvh] w-full flex-col overflow-hidden px-4 pb-32 pt-6 sm:px-8 sm:pb-36 sm:pt-8 md:px-12 md:pt-10 lg:px-16"
      role="group"
      aria-roledescription="slide"
      aria-label={`Diapositive ${slideIndex + 1} sur ${SLIDE_COUNT}`}
    >
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 90% 70% at 0% 0%, rgba(255,255,255,0.07) 0%, transparent 50%), radial-gradient(ellipse 80% 60% at 100% 100%, rgba(255,255,255,0.04) 0%, transparent 50%)",
        }}
      />
      <div className="relative z-[1] flex min-h-0 flex-1 flex-col">
        {showPartnersStrip ? <div className="mb-6 shrink-0 sm:mb-8"><PartnersStrip /></div> : null}
        {fullBleed ? (
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        ) : (
          <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col lg:max-w-[88rem]">{children}</div>
        )}
      </div>
    </div>
  );
}

export default function CannesMonteeMarchesBriefing() {
  const [slide, setSlide] = useState(0);

  const go = useCallback((dir: -1 | 1) => {
    setSlide((s) => Math.min(SLIDE_COUNT - 1, Math.max(0, s + dir)));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "PageDown") go(1);
      if (e.key === "ArrowLeft" || e.key === "PageUp") go(-1);
      if (e.key === "Home") setSlide(0);
      if (e.key === "End") setSlide(SLIDE_COUNT - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  return (
    <div className="relative min-h-[100dvh] bg-black text-white antialiased selection:bg-white/25 selection:text-white">
      <Link
        href="/r/cannes-villa-tv/agenda"
        className="absolute right-3 top-3 z-20 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.35em] text-white/55 backdrop-blur-md transition hover:border-white/30 hover:bg-white/10 hover:text-white sm:right-6 sm:top-5 sm:text-[11px]"
      >
        Agenda TV
      </Link>

      <div className="relative overflow-hidden">
        <div
          className="flex will-change-transform"
          style={{
            width: `${SLIDE_COUNT * 100}vw`,
            transform: `translate3d(-${slide * 100}vw,0,0)`,
            transition: `transform 0.85s ${EASE_SLIDE}`,
          }}
        >
          {/* 1 — OUVERTURE DA */}
          <div className="w-screen shrink-0">
            <SlideShell slideIndex={0} fullBleed>
              <div className="mx-auto flex min-h-0 w-full max-w-[100rem] flex-1 flex-col">
                <header className="flex shrink-0 flex-col justify-between gap-8 lg:flex-row lg:items-end">
                  <div className="w-40 sm:w-52 md:w-60">
                    <GlowUpLogo className="h-auto w-full" variant="light" />
                  </div>
                  <div className="relative h-32 w-44 shrink-0 sm:h-40 sm:w-56 md:h-48 md:w-64">
                    <Image
                      src={CANNES_LOGO}
                      alt="Festival de Cannes"
                      fill
                      sizes="256px"
                      className="object-contain object-bottom lg:object-right"
                      priority
                    />
                  </div>
                </header>

                <div className="mt-6 flex flex-1 flex-col justify-center py-6 sm:mt-8 sm:py-10">
                  <p className="font-mono text-[11px] font-medium uppercase tracking-[0.45em] text-white/40 sm:text-xs">
                    Universal · The Fast and the Furious — 25 ans
                  </p>
                  <h1 className="mt-4 font-[Spectral] text-[clamp(2.75rem,10vw,7rem)] font-light leading-[0.95] tracking-[-0.02em] text-white">
                    Montée
                    <br />
                    <span className="text-white/85">des marches</span>
                  </h1>
                  <p className="mt-6 font-[Spectral] text-2xl font-light text-white/55 sm:mt-8 sm:text-3xl md:text-4xl">
                    Mercredi 13 mai
                  </p>
                </div>

                <div className="grid flex-1 grid-cols-1 divide-y divide-white/10 border-y border-white/15 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                  {[
                    { k: "Arrivée max", v: "22h15", sub: "Sur place Palais" },
                    { k: "Projection", v: "23h45", sub: "Théâtre Lumière" },
                    { k: "After", v: "Silencio", sub: "Liste Universal" },
                  ].map((cell, i) => (
                    <div
                      key={cell.k}
                      className={`flex flex-col justify-center px-4 py-10 sm:px-6 sm:py-14 md:px-10 md:py-16 ${i === 1 ? "bg-white/[0.03]" : ""}`}
                    >
                      <span className="text-xs font-bold uppercase tracking-[0.45em] text-white/40 sm:text-sm">{cell.k}</span>
                      <span className="mt-4 font-[Spectral] text-5xl font-light leading-none text-white sm:text-6xl md:text-7xl lg:text-8xl">
                        {cell.v}
                      </span>
                      <span className="mt-3 text-lg font-light text-white/50 sm:text-xl md:text-2xl">{cell.sub}</span>
                    </div>
                  ))}
                </div>

                <footer className="mt-auto flex shrink-0 flex-col items-center justify-center gap-10 border-t border-white/10 pt-8 sm:flex-row sm:gap-14 sm:pt-10 md:gap-20">
                  <GlowUpLogo className="h-10 w-auto sm:h-12 md:h-14" variant="light" />
                  <div className="hidden h-14 w-px bg-white/15 sm:block" aria-hidden />
                  <div className="relative h-12 w-36 sm:h-14 sm:w-44">
                    <Image src={CANNES_LOGO} alt="Festival de Cannes" fill sizes="176px" className="object-contain" />
                  </div>
                  <div className="hidden h-14 w-px bg-white/15 sm:block" aria-hidden />
                  <div className="relative h-14 w-52 sm:h-16 sm:w-64 md:h-[4.5rem] md:w-72">
                    <Image src={UNIVERSAL_LOGO} alt="Universal Pictures" fill sizes="288px" className="object-contain" priority />
                  </div>
                </footer>
              </div>
            </SlideShell>
          </div>

          {/* 2 — CHRONO */}
          <div className="w-screen shrink-0">
            <SlideShell slideIndex={1} showPartnersStrip>
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.5em] text-white/35">Chapitre I — Le fil du soir</p>
              <h2 className="mt-4 font-[Spectral] text-[clamp(3rem,8vw,6.5rem)] font-light uppercase leading-[0.95] tracking-wide text-white">
                Chrono
              </h2>
              <div className="mt-8 min-h-0 flex-1 space-y-0 overflow-y-auto pr-1 sm:mt-12">
                {[
                  ["21h00", "Brief équipe villa", "Alignement équipe."],
                  ["21h10", "Création de contenu", "Avant la montée des marches."],
                  ["21h30", "Départ max", "Départ villa."],
                  ["22h15", "Palais", "Contrôle tenue & accréditation."],
                  ["23h45", "Salle", "Projection — Théâtre Lumière. Téléphone éteint."],
                  ["Nuit", "Silencio", "Liste Universal."],
                ].map(([heure, titre, detail]) => (
                  <div
                    key={heure}
                    className="grid grid-cols-1 gap-4 border-b border-white/10 py-8 last:border-0 sm:grid-cols-[minmax(0,7rem)_minmax(0,14rem)_1fr] sm:items-start sm:gap-8 sm:py-10 md:gap-12 md:py-12"
                  >
                    <span className="font-mono text-3xl font-light tabular-nums text-white/30 sm:text-4xl md:text-5xl">{heure}</span>
                    <span className="font-[Spectral] text-3xl font-light uppercase tracking-wide text-white sm:text-4xl md:text-5xl">
                      {titre}
                    </span>
                    <span className="text-lg font-light leading-relaxed text-white/45 sm:text-xl md:text-2xl">{detail}</span>
                  </div>
                ))}
              </div>
            </SlideShell>
          </div>

          {/* 3 — DRESS CODE */}
          <div className="w-screen shrink-0">
            <SlideShell slideIndex={2} showPartnersStrip>
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.5em] text-white/35">Chapitre II — Image</p>
              <h2 className="mt-4 font-[Spectral] text-[clamp(2.5rem,7vw,5.5rem)] font-light uppercase leading-[0.95] text-white">
                Dress code
              </h2>
              <p className="mt-6 font-[Spectral] text-3xl font-light italic text-white/45 sm:text-4xl md:text-5xl">
                Non négociable.
              </p>
              <p className="mt-6 max-w-4xl text-xl leading-relaxed text-white/50 sm:text-2xl md:text-3xl">
                Gala au Grand Théâtre Lumière : le standard le plus haut du Festival. L&apos;entrée tranche — pas de
                discussion sur le tapis.
              </p>
              <div className="mt-10 grid min-h-0 flex-1 gap-8 overflow-y-auto pb-4 md:grid-cols-2 md:gap-12 lg:mt-14">
                <div className="border-l-4 border-white pl-6 sm:pl-8 md:pl-10">
                  <p className="font-[Spectral] text-6xl font-light text-white sm:text-7xl md:text-8xl">Oui</p>
                  <p className="mt-6 text-lg leading-relaxed text-white/65 sm:text-xl md:text-2xl">
                    <strong className="font-medium text-white/90">Femmes.</strong> Longue, cocktail, noir, tailleur
                    sombre, pochette, silhouette nette, chaussures de soirée.
                  </p>
                  <p className="mt-6 text-lg leading-relaxed text-white/65 sm:text-xl md:text-2xl">
                    <strong className="font-medium text-white/90">Hommes.</strong> Smoking nœud papillon, ou costume
                    sombre + cravate — chaussures de ville, finition irréprochable.
                  </p>
                </div>
                <div className="border-l-4 border-white/25 pl-6 sm:pl-8 md:pl-10">
                  <p className="font-[Spectral] text-6xl font-light text-white/35 sm:text-7xl md:text-8xl">Non</p>
                  <ul className="mt-6 space-y-4 text-lg text-white/55 sm:space-y-5 sm:text-xl md:text-2xl">
                    {[
                      "Nudité, transparence, « naked dress »",
                      "Traînes et volumes qui bloquent le flux",
                      "Baskets — jamais",
                      "Tote, sac à dos, sac encombrant",
                      "Tenue décontractée ou « presque » habillée",
                    ].map((x) => (
                      <li key={x} className="flex gap-4">
                        <span className="font-mono text-white/25">—</span>
                        {x}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <p className="mt-auto border-t border-white/10 pt-6 text-base text-white/35 sm:text-lg md:text-xl">
                Les hôtesses peuvent refuser l&apos;accès aux marches. Aucun statut ne contourne la règle.
              </p>
            </SlideShell>
          </div>

          {/* 4 — TAPIS */}
          <div className="w-screen shrink-0">
            <SlideShell slideIndex={3} showPartnersStrip>
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.5em] text-white/35">Chapitre III — Scène</p>
              <h2 className="mt-4 font-[Spectral] text-[clamp(2.5rem,7vw,5.5rem)] font-light uppercase leading-[0.95] text-white">
                Tapis rouge
              </h2>
              <p className="mt-6 max-w-4xl text-xl text-white/50 sm:text-2xl md:text-3xl">
                On est vu partout — on se comporte comme si la caméra était toujours allumée.
              </p>
              <div className="mt-10 flex min-h-0 flex-1 flex-col justify-center gap-12 sm:mt-14 sm:gap-16 md:gap-20">
                {[
                  {
                    n: "01",
                    t: "Téléphone mort",
                    d: "Pochette, du premier au dernier pas. Zéro selfie sur le tapis. Images uniquement hors zone.",
                  },
                  {
                    n: "02",
                    t: "Sur le tapis rouge",
                    d: "En étant sur le tapis rouge : poser, respirer, profiter du moment.",
                  },
                  {
                    n: "03",
                    t: "Salle sacrée",
                    d: "Projection : silence, respect, aucune captation. Pas de spoil. Pas de leak.",
                  },
                ].map((b) => (
                  <div key={b.n} className="flex flex-col gap-4 border-l-[6px] border-white/30 pl-6 sm:flex-row sm:items-baseline sm:gap-10 sm:pl-8 md:gap-14 md:pl-10">
                    <span className="font-mono text-4xl text-white/25 sm:text-5xl md:text-6xl">{b.n}</span>
                    <div>
                      <p className="font-[Spectral] text-4xl font-light text-white sm:text-5xl md:text-6xl">{b.t}</p>
                      <p className="mt-3 max-w-3xl text-lg text-white/50 sm:mt-4 sm:text-xl md:text-2xl">{b.d}</p>
                    </div>
                  </div>
                ))}
              </div>
            </SlideShell>
          </div>

          {/* 5 — PHOTOGRAPHES UNIVERSAL */}
          <div className="w-screen shrink-0">
            <SlideShell slideIndex={4} showPartnersStrip>
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.5em] text-white/35">
                Chapitre IV — Image officielle
              </p>
              <h2 className="mt-4 font-[Spectral] text-[clamp(2rem,6vw,4.5rem)] font-light uppercase leading-[0.95] text-white">
                Photographes Universal
              </h2>
              <p className="mt-6 max-w-5xl text-xl font-light leading-relaxed text-white/55 sm:text-2xl md:text-3xl">
                Pour immortaliser cette montée des marches, <strong className="font-medium text-white/90">deux photographes officiels Universal</strong> sont présents sur le tapis rouge. Quelques indications pour les retrouver :
              </p>
              <ul className="mt-8 max-w-5xl space-y-4 border-l-4 border-white/25 pl-6 text-lg text-white/70 sm:space-y-5 sm:pl-8 sm:text-xl md:text-2xl">
                <li>
                  <span className="font-medium text-white/95">Côté tapis.</span> À droite du tapis, en regardant les escaliers.
                </li>
                <li>
                  <span className="font-medium text-white/95">Prénoms.</span> Ils s&apos;appellent tous les deux Olivier.
                </li>
                <li>
                  <span className="font-medium text-white/95">Positions.</span> Repères <span className="font-mono text-white/90">13</span> et{" "}
                  <span className="font-mono text-white/90">89</span> sur le plan ci-dessous.
                </li>
              </ul>
              <p className="mt-6 font-[Spectral] text-xl italic text-white/45 sm:text-2xl">Voici leurs photos.</p>

              <div className="mt-8 flex min-h-0 flex-1 flex-col gap-10 overflow-y-auto pb-4 lg:flex-row lg:items-start lg:gap-12">
                <figure className="mx-auto shrink-0 lg:mx-0 lg:w-[min(100%,22rem)]">
                  <div className="relative mx-auto aspect-[3/5] w-full max-w-xs overflow-hidden rounded-lg border border-white/15 bg-white/[0.03] sm:max-w-sm">
                    <Image
                      src={PLAN_TAPIS_PHOTO}
                      alt="Plan du tapis rouge : positions des photographes (13 et 89)"
                      fill
                      sizes="(max-width:1024px) 320px, 360px"
                      className="object-contain p-1"
                    />
                  </div>
                  <figcaption className="mt-3 text-center text-sm font-medium uppercase tracking-[0.25em] text-white/40">
                    Plan des positions
                  </figcaption>
                </figure>

                <div className="grid flex-1 grid-cols-1 gap-8 sm:grid-cols-2 sm:gap-6 lg:gap-8">
                  <figure className="flex flex-col">
                    <div className="relative aspect-[4/5] w-full overflow-hidden rounded-lg border border-white/15 bg-neutral-900">
                      <Image
                        src={PHOTO_OLIVIERS_1}
                        alt="Olivier, photographe officiel Universal sur le tapis — repère position 13"
                        fill
                        sizes="(max-width:768px) 100vw, 400px"
                        className="object-cover object-top"
                      />
                    </div>
                    <figcaption className="mt-3 font-[Spectral] text-2xl font-light text-white sm:text-3xl">
                      Olivier
                      <span className="mt-1 block font-mono text-sm font-normal tracking-wider text-white/45">Position 13</span>
                    </figcaption>
                  </figure>
                  <figure className="flex flex-col">
                    <div className="relative aspect-[4/5] w-full overflow-hidden rounded-lg border border-white/15 bg-neutral-900">
                      <Image
                        src={PHOTO_OLIVIERS_2}
                        alt="Olivier, photographe officiel Universal sur le tapis — repère position 89"
                        fill
                        sizes="(max-width:768px) 100vw, 400px"
                        className="object-cover object-top"
                      />
                    </div>
                    <figcaption className="mt-3 font-[Spectral] text-2xl font-light text-white sm:text-3xl">
                      Olivier
                      <span className="mt-1 block font-mono text-sm font-normal tracking-wider text-white/45">Position 89</span>
                    </figcaption>
                  </figure>
                </div>
              </div>
            </SlideShell>
          </div>

          {/* 6 — COM */}
          <div className="w-screen shrink-0">
            <SlideShell slideIndex={5} showPartnersStrip>
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.5em] text-white/35">Chapitre V — Narratif</p>
              <h2 className="mt-4 font-[Spectral] text-[clamp(2.5rem,7vw,5.5rem)] font-light uppercase leading-[0.95] text-white">
                Communication
              </h2>
              <p className="mt-6 max-w-4xl text-xl text-white/50 sm:text-2xl md:text-3xl">
                Même hashtags, même cadence. La cohérence de marque prime sur l&apos;impulsion du moment.
              </p>
              <p className="mt-12 text-sm font-bold uppercase tracking-[0.45em] text-white/40 sm:mt-16 sm:text-base">Hashtags</p>
              <div className="mt-4 flex flex-col gap-4 sm:mt-6 sm:flex-row sm:flex-wrap sm:gap-5">
                {["#FastAndFurious25ans", "#cannes2026"].map((tag) => (
                  <span
                    key={tag}
                    className="inline-block border-2 border-white/25 bg-white/[0.04] px-6 py-4 font-mono text-2xl font-light tracking-wide text-white sm:px-8 sm:py-5 sm:text-3xl md:text-4xl lg:text-5xl"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </SlideShell>
          </div>

          {/* 7 — SILENCIO */}
          <div className="w-screen shrink-0">
            <SlideShell slideIndex={6} showPartnersStrip>
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.5em] text-white/35">
                Chapitre VI — After
              </p>
              <h2 className="mt-4 font-[Spectral] text-[clamp(2.5rem,7vw,5.5rem)] font-light uppercase leading-[0.95] text-white">
                Silencio
              </h2>
              <p className="mt-8 max-w-5xl text-xl font-light leading-relaxed text-white/60 sm:mt-10 sm:text-2xl md:text-3xl lg:text-4xl">
                Au Silencio : la cliente a explicitement demandé un comportement irréprochable après la montée des
                marches.
              </p>
              <p className="mt-10 text-sm font-bold uppercase tracking-[0.4em] text-white/45 sm:mt-12 sm:text-base">
                Concrètement :
              </p>
              <ul className="mt-6 max-w-5xl space-y-6 border-l-4 border-white/25 pl-6 text-lg text-white/75 sm:mt-8 sm:space-y-7 sm:pl-8 sm:text-xl md:text-2xl lg:text-3xl">
                <li className="flex gap-4">
                  <span className="font-mono text-white/35">—</span>
                  <span>Pas d&apos;excès, pas de débordement.</span>
                </li>
                <li className="flex gap-4">
                  <span className="font-mono text-white/35">—</span>
                  <span>Pro avec tout le monde sur place.</span>
                </li>
                <li className="flex gap-4">
                  <span className="font-mono text-white/35">—</span>
                  <span>Doute ou souci = vous m&apos;appelez direct.</span>
                </li>
              </ul>
              <p className="mt-10 max-w-5xl text-xl font-light leading-relaxed text-white/85 sm:mt-12 sm:text-2xl md:text-3xl lg:text-[1.75rem]">
                Vous représentez la marque et l&apos;agence dès que vous arrivez sur place. On compte sur vous.
              </p>
            </SlideShell>
          </div>

          {/* 8 — FIN — Moment */}
          <div className="w-screen shrink-0">
            <SlideShell slideIndex={7} fullBleed>
              <div
                className="pointer-events-none absolute inset-0 z-0"
                aria-hidden
                style={{
                  background:
                    "radial-gradient(ellipse 65% 50% at 50% 35%, rgba(255,255,255,0.09) 0%, transparent 55%), radial-gradient(circle at 50% 100%, rgba(255,255,255,0.04) 0%, transparent 45%)",
                }}
              />
              <div className="relative z-[1] mx-auto flex min-h-0 w-full max-w-[90rem] flex-1 flex-col px-2">
                <div className="flex flex-1 flex-col items-center justify-center py-8 text-center sm:py-12">
                  <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.55em] text-white/35 sm:text-xs">
                    Merci · bonne montée
                  </p>
                  <h2 className="mt-8 font-[Spectral] text-[clamp(2.75rem,9.5vw,7.5rem)] font-light leading-[1.02] tracking-[-0.02em] text-white sm:mt-10">
                    <span className="block italic text-white">Profitez de votre moment&nbsp;!</span>
                    <span className="mt-4 block text-[0.72em] font-light not-italic tracking-[0.02em] text-white/90 sm:mt-5 md:text-[0.68em]">
                      C&apos;est le vôtre&nbsp;!
                    </span>
                  </h2>
                </div>

                <footer className="mt-auto flex w-full shrink-0 flex-col items-center justify-center gap-10 border-t border-white/[0.12] bg-gradient-to-t from-black/40 to-transparent px-4 py-10 sm:flex-row sm:gap-12 sm:py-12 md:gap-20 md:py-14">
                  <div className="flex h-14 items-center sm:h-16 md:h-[4.25rem]">
                    <GlowUpLogo className="h-full w-auto max-w-[12rem] sm:max-w-[14rem]" variant="light" />
                  </div>
                  <div className="hidden h-16 w-px shrink-0 bg-gradient-to-b from-transparent via-white/25 to-transparent sm:block" aria-hidden />
                  <div className="relative h-14 w-40 sm:h-16 sm:w-48 md:h-[4.25rem] md:w-52">
                    <Image
                      src={CANNES_LOGO}
                      alt="Festival de Cannes"
                      fill
                      sizes="208px"
                      className="object-contain object-center"
                    />
                  </div>
                  <div className="hidden h-16 w-px shrink-0 bg-gradient-to-b from-transparent via-white/25 to-transparent sm:block" aria-hidden />
                  <div className="relative h-16 w-52 sm:h-[4.25rem] sm:w-60 md:h-20 md:w-72">
                    <Image
                      src={UNIVERSAL_LOGO}
                      alt="Universal Pictures"
                      fill
                      sizes="288px"
                      className="object-contain object-center"
                    />
                  </div>
                </footer>
              </div>
            </SlideShell>
          </div>
        </div>
      </div>

      <button
        type="button"
        aria-label="Diapositive précédente"
        className={`absolute left-1 top-1/2 z-10 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white/40 backdrop-blur-md transition sm:left-3 sm:h-16 sm:w-16 md:left-5 ${slide === 0 ? "cursor-not-allowed opacity-20" : "hover:border-white/35 hover:bg-white/10 hover:text-white"}`}
        onClick={() => go(-1)}
        disabled={slide === 0}
      >
        <ChevronLeft className="h-8 w-8" strokeWidth={1} />
      </button>
      <button
        type="button"
        aria-label="Diapositive suivante"
        className={`absolute right-1 top-1/2 z-10 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white/40 backdrop-blur-md transition sm:right-3 sm:h-16 sm:w-16 md:right-5 ${slide === SLIDE_COUNT - 1 ? "cursor-not-allowed opacity-20" : "hover:border-white/35 hover:bg-white/10 hover:text-white"}`}
        onClick={() => go(1)}
        disabled={slide === SLIDE_COUNT - 1}
      >
        <ChevronRight className="h-8 w-8" strokeWidth={1} />
      </button>

      <nav
        className="fixed bottom-0 left-0 right-0 z-20 flex items-center justify-center gap-3 border-t border-white/10 bg-black/90 py-5 backdrop-blur-lg sm:gap-4 sm:py-6"
        aria-label="Navigation des diapositives"
      >
        <div className="absolute left-4 top-1/2 hidden -translate-y-1/2 sm:block md:left-8">
          <GlowUpLogo className="h-6 w-auto opacity-40 sm:h-7" variant="light" />
        </div>
        {Array.from({ length: SLIDE_COUNT }, (_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Aller à la diapositive ${i + 1}`}
            aria-current={slide === i ? "true" : undefined}
            className={`h-2 rounded-full transition-all duration-500 ${slide === i ? "w-12 bg-white shadow-[0_0_20px_rgba(255,255,255,0.4)]" : "w-2 bg-white/25 hover:bg-white/45"}`}
            onClick={() => setSlide(i)}
          />
        ))}
        <span className="ml-4 font-mono text-xs tabular-nums text-white/40 sm:text-sm">
          {String(slide + 1).padStart(2, "0")} / {String(SLIDE_COUNT).padStart(2, "0")}
        </span>
      </nav>
    </div>
  );
}
