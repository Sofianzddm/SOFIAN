"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Instagram,
  Music2,
  Youtube,
  Loader2,
  MapPin,
  Users,
  Heart,
} from "lucide-react";

interface Stats {
  igFollowers: number | null;
  igEngagement: number | null;
  igGenreFemme: number | null;
  igGenreHomme: number | null;
  igAge13_17: number | null;
  igAge18_24: number | null;
  igAge25_34: number | null;
  igAge35_44: number | null;
  igAge45Plus: number | null;
  igLocFrance: number | null;
  ttFollowers: number | null;
  ttEngagement: number | null;
  ttGenreFemme: number | null;
  ttGenreHomme: number | null;
  ttAge13_17: number | null;
  ttAge18_24: number | null;
  ttAge25_34: number | null;
  ttAge35_44: number | null;
  ttAge45Plus: number | null;
  ttLocFrance: number | null;
  ytAbonnes: number | null;
}

interface Talent {
  id: string;
  prenom: string;
  nom: string;
  photo: string | null;
  bio: string | null;
  presentation: string | null;
  presentationEn: string | null;
  ville: string | null;
  pays: string | null;
  nationalite: string | null;
  instagram: string | null;
  tiktok: string | null;
  youtube: string | null;
  snapchat: string | null;
  niches: string[];
  selectedClients: string[];
  moyenneVuesStory: number | null;
  stats: Stats | null;
}

function formatCount(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".0", "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(".0", "")}k`;
  return String(n);
}

function pct(n: number | null): string {
  return n == null ? "—" : `${n.toFixed(n % 1 === 0 ? 0 : 1)}%`;
}

function igHandle(url: string | null): string | null {
  if (!url) return null;
  const m = url.replace(/\/$/, "").match(/[^/@]+$/);
  return m ? `@${m[0].replace(/^@/, "")}` : url;
}

function AgeBar({ label, value }: { label: string; value: number | null }) {
  if (value == null) return null;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
        <span>{label}</span>
        <span className="font-medium text-slate-700">{pct(value)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-slate-800" style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  );
}

function SocialStats({
  title,
  icon,
  handle,
  url,
  followers,
  engagement,
  genreFemme,
  genreHomme,
  locFrance,
  ages,
}: {
  title: string;
  icon: React.ReactNode;
  handle: string | null;
  url: string | null;
  followers: number | null;
  engagement: number | null;
  genreFemme: number | null;
  genreHomme: number | null;
  locFrance: number | null;
  ages: { label: string; value: number | null }[];
}) {
  const hasAges = ages.some((a) => a.value != null);
  return (
    <div className="rounded-2xl bg-white p-6 ring-1 ring-slate-200/60">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {icon}
          <h3 className="font-semibold text-slate-900">{title}</h3>
        </div>
        {handle &&
          (url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-slate-500 hover:text-slate-800"
            >
              {handle}
            </a>
          ) : (
            <span className="text-sm text-slate-500">{handle}</span>
          ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl bg-slate-50 p-4">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Users className="h-3.5 w-3.5" /> Abonnés
          </div>
          <p className="mt-1 text-xl font-semibold text-slate-900">{formatCount(followers)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Heart className="h-3.5 w-3.5" /> Engagement
          </div>
          <p className="mt-1 text-xl font-semibold text-slate-900">{pct(engagement)}</p>
        </div>
      </div>

      {(genreFemme != null || genreHomme != null || locFrance != null) && (
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {genreFemme != null && (
            <span className="rounded-md bg-slate-100 px-2.5 py-1 text-slate-600">
              Femmes {pct(genreFemme)}
            </span>
          )}
          {genreHomme != null && (
            <span className="rounded-md bg-slate-100 px-2.5 py-1 text-slate-600">
              Hommes {pct(genreHomme)}
            </span>
          )}
          {locFrance != null && (
            <span className="rounded-md bg-slate-100 px-2.5 py-1 text-slate-600">
              France {pct(locFrance)}
            </span>
          )}
        </div>
      )}

      {hasAges && (
        <div className="mt-5 space-y-3">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Âge de l'audience</p>
          {ages.map((a) => (
            <AgeBar key={a.label} label={a.label} value={a.value} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CommunityTalentDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [talent, setTalent] = useState<Talent | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await fetch(`/api/community/talents/${id}`);
        if (res.ok) setTalent(await res.json());
        else setNotFound(true);
      } catch (e) {
        console.error("Erreur:", e);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (notFound || !talent) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-slate-500">Talent introuvable.</p>
        <Link href="/community/talents" className="mt-4 inline-block text-sm font-medium text-slate-800 hover:underline">
          ← Retour aux talents
        </Link>
      </div>
    );
  }

  const s = talent.stats;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Link
        href="/community/talents"
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" /> Talents
      </Link>

      {/* En-tête */}
      <div className="flex flex-col gap-5 rounded-2xl bg-white p-6 ring-1 ring-slate-200/60 sm:flex-row sm:items-center">
        <div className="flex h-24 w-24 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-100">
          {talent.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={talent.photo} alt={`${talent.prenom} ${talent.nom}`} className="h-full w-full object-cover" />
          ) : (
            <span className="text-2xl font-semibold text-slate-400">
              {talent.prenom?.[0]}
              {talent.nom?.[0]}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {talent.prenom} {talent.nom}
          </h1>
          {(talent.ville || talent.pays || talent.nationalite) && (
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-slate-500">
              <MapPin className="h-3.5 w-3.5" />
              {[talent.ville, talent.pays].filter(Boolean).join(", ")}
              {talent.nationalite ? ` · ${talent.nationalite}` : ""}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-3">
            {talent.instagram && (
              <a
                href={talent.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                <Instagram className="h-4 w-4" /> {igHandle(talent.instagram)}
              </a>
            )}
            {talent.tiktok && (
              <a
                href={talent.tiktok}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                <Music2 className="h-4 w-4" /> {igHandle(talent.tiktok)}
              </a>
            )}
            {talent.youtube && (
              <a
                href={talent.youtube}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                <Youtube className="h-4 w-4" /> YouTube
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Niches */}
      {talent.niches.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {talent.niches.map((n) => (
            <span
              key={n}
              className="rounded-lg bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700"
            >
              {n}
            </span>
          ))}
        </div>
      )}

      {/* Présentation / Bio */}
      {(talent.presentation || talent.bio) && (
        <div className="mt-6 rounded-2xl bg-white p-6 ring-1 ring-slate-200/60">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
            Présentation
          </h2>
          {talent.presentation && (
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">
              {talent.presentation}
            </p>
          )}
          {talent.bio && (
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-500">
              {talent.bio}
            </p>
          )}
        </div>
      )}

      {/* Clients / marques */}
      {talent.selectedClients.length > 0 && (
        <div className="mt-6 rounded-2xl bg-white p-6 ring-1 ring-slate-200/60">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
            Marques déjà collaborées
          </h2>
          <div className="flex flex-wrap gap-2">
            {talent.selectedClients.map((c) => (
              <span key={c} className="rounded-md bg-slate-50 px-2.5 py-1 text-sm text-slate-600">
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Statistiques réseaux */}
      {s && (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {talent.instagram && (
            <SocialStats
              title="Instagram"
              icon={<Instagram className="h-5 w-5 text-slate-700" />}
              handle={igHandle(talent.instagram)}
              url={talent.instagram}
              followers={s.igFollowers}
              engagement={s.igEngagement}
              genreFemme={s.igGenreFemme}
              genreHomme={s.igGenreHomme}
              locFrance={s.igLocFrance}
              ages={[
                { label: "13-17", value: s.igAge13_17 },
                { label: "18-24", value: s.igAge18_24 },
                { label: "25-34", value: s.igAge25_34 },
                { label: "35-44", value: s.igAge35_44 },
                { label: "45+", value: s.igAge45Plus },
              ]}
            />
          )}
          {talent.tiktok && (
            <SocialStats
              title="TikTok"
              icon={<Music2 className="h-5 w-5 text-slate-700" />}
              handle={igHandle(talent.tiktok)}
              url={talent.tiktok}
              followers={s.ttFollowers}
              engagement={s.ttEngagement}
              genreFemme={s.ttGenreFemme}
              genreHomme={s.ttGenreHomme}
              locFrance={s.ttLocFrance}
              ages={[
                { label: "13-17", value: s.ttAge13_17 },
                { label: "18-24", value: s.ttAge18_24 },
                { label: "25-34", value: s.ttAge25_34 },
                { label: "35-44", value: s.ttAge35_44 },
                { label: "45+", value: s.ttAge45Plus },
              ]}
            />
          )}
        </div>
      )}
    </div>
  );
}
