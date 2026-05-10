"use client";

import { useEffect, useState } from "react";

/**
 * Encart portrait + réseau (page publique coiffeur).
 * Photo : upload staff stocké en base, sinon URL serveur (`seedPortraitUrl`) ou `NEXT_PUBLIC_CANNES_COIFFEUR_PROFILE_IMAGE_URL`.
 */
function normalizeHandle(raw: string | undefined): { display: string; path: string } {
  const fallback = "regardesacoiffure";
  const fromEnv = raw?.trim().replace(/^@/, "");
  const path = fromEnv || fallback;
  return { display: `@${path}`, path };
}

type Props = {
  /** Pré-rempli depuis le serveur (Prisma), pour éviter flash / échec client sur l’API. */
  seedPortraitUrl?: string | null;
};

export function CoiffeurPublicProfileEncart({ seedPortraitUrl }: Props) {
  const envImageUrl = process.env.NEXT_PUBLIC_CANNES_COIFFEUR_PROFILE_IMAGE_URL?.trim() || "";

  /** `undefined` : pas encore reçu de l’API client ; après fetch : chaîne ou `null` (= pas en base). */
  const [fetchedPortrait, setFetchedPortrait] = useState<string | null | undefined>(undefined);

  const seed = typeof seedPortraitUrl === "string" ? seedPortraitUrl.trim() : "";

  useEffect(() => {
    let cancelled = false;
    fetch("/api/pub/cannes-coiffeur/profile", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) return null;
        return (await r.json()) as { photoUrl?: string | null };
      })
      .then((j) => {
        if (cancelled) return;
        const u = j?.photoUrl;
        setFetchedPortrait(typeof u === "string" && u.trim() ? u.trim() : null);
      })
      .catch(() => {
        if (!cancelled) setFetchedPortrait(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const mergedUrl =
    fetchedPortrait !== undefined
      ? (fetchedPortrait || seed || envImageUrl || "").trim()
      : (seed || envImageUrl || "").trim();

  const { display: handleDisplay, path: handlePath } = normalizeHandle(
    process.env.NEXT_PUBLIC_CANNES_COIFFEUR_SOCIAL_HANDLE
  );
  const igHref = `https://www.instagram.com/${encodeURIComponent(handlePath)}/`;

  return (
    <aside className="mx-auto w-full max-w-4xl rounded-2xl border border-glowup-rose/30 bg-black/25 px-3 py-4 text-glowup-lace shadow-lg backdrop-blur-sm sm:px-6 sm:py-5">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6 md:gap-8">
        <div className="shrink-0">
          {mergedUrl ? (
            <img
              src={mergedUrl}
              alt={`Coiffeur — ${handleDisplay}`}
              className="h-24 w-24 rounded-2xl object-cover shadow-md ring-2 ring-glowup-rose/40 sm:h-28 sm:w-28 md:h-32 md:w-32"
              loading="eager"
              decoding="async"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div
              className="flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-glowup-rose/50 to-glowup-rose-dark/40 text-2xl text-glowup-lace/90 ring-2 ring-glowup-rose/35 sm:h-28 sm:w-28 sm:text-3xl md:h-32 md:w-32"
              aria-hidden
            >
              ✂
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="text-[10px] uppercase tracking-[0.18em] text-glowup-lace/45 sm:text-xs">
            Cannes 2026
          </p>
          <p className="mt-1 text-base font-medium text-glowup-lace md:text-lg">Ton rendez-vous coiffeur</p>
          <a
            href={igHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex min-h-[44px] touch-manipulation items-center gap-2 text-base font-semibold text-glowup-rose-light transition-colors hover:text-glowup-lace hover:underline sm:text-base"
          >
            {handleDisplay}
            <span className="text-xs font-normal text-glowup-lace/50">(ouvre Instagram)</span>
          </a>
        </div>
      </div>
    </aside>
  );
}
