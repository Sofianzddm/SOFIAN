import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { marqueSlug } from "@/lib/marque-resolver";

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

const STOP_WORDS = new Set([
  "du",
  "de",
  "des",
  "la",
  "le",
  "les",
  "un",
  "une",
  "et",
  "ou",
  "the",
  "of",
  "and",
  "a",
  "an",
  "by",
  "for",
  "d",
  "l",
]);

/** Tokens significatifs (sans stop-words). */
function searchTokens(q: string): string[] {
  return normalize(q)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
}

/** Variantes singulier / pluriel simples (maison ↔ maisons). */
function tokenVariants(token: string): string[] {
  const variants = new Set<string>([token]);
  if (token.endsWith("s") && token.length > 3) {
    variants.add(token.slice(0, -1));
  } else if (!token.endsWith("s") && token.length >= 3) {
    variants.add(`${token}s`);
  }
  return [...variants];
}

/** Slug « souple » : ignore les -s de fin de mot (maisonsdumonde → maisondumonde). */
function softSlug(q: string): string {
  return searchTokens(q)
    .map((t) => (t.endsWith("s") && t.length > 3 ? t.slice(0, -1) : t))
    .join("");
}

type MarqueRow = {
  id: string;
  nom: string;
  ville: string | null;
  slug: string | null;
  aliases: { label: string }[];
  _count: { contacts: number };
};

/**
 * GET /api/marques/search?q=star — recherche de marques par nom / alias.
 * Ranking : exact nom → exact alias → commence par → tokens (pluriel souple) → contient.
 *
 * Ex. « maison du monde » trouve « Maisons du Monde » et inversement.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const role = (session.user as { role?: string }).role || "";
    if (role === "TALENT") {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const q = (request.nextUrl.searchParams.get("q") || "").trim();
    const listAll = q.length < 2;

    const select = {
      id: true,
      nom: true,
      ville: true,
      slug: true,
      aliases: { select: { label: true } },
      _count: { select: { contacts: true } },
    } as const;

    if (listAll) {
      const rows = await prisma.marque.findMany({
        select,
        orderBy: { nom: "asc" },
        take: 2000,
      });
      return NextResponse.json({
        marques: rows.map((r) => ({
          id: r.id,
          nom: r.nom,
          ville: r.ville || "",
          contactCount: r._count.contacts,
        })),
      });
    }

    const tokens = searchTokens(q);
    const qSlug = marqueSlug(q);
    const qSoftSlug = softSlug(q);

    // Chaque token significatif doit apparaître (avec variante pluriel).
    const tokenAndFilters =
      tokens.length >= 2
        ? tokens.map((token) => ({
            OR: tokenVariants(token).flatMap((variant) => [
              { nom: { contains: variant, mode: "insensitive" as const } },
              {
                aliases: {
                  some: {
                    label: { contains: variant, mode: "insensitive" as const },
                  },
                },
              },
            ]),
          }))
        : [];

    const [
      exactNom,
      exactAlias,
      startsNom,
      aliasContains,
      nomContains,
      bySlug,
      bySoftSlug,
      byTokens,
    ] = await Promise.all([
      prisma.marque.findMany({
        where: { nom: { equals: q, mode: "insensitive" } },
        select,
        take: 10,
      }),
      prisma.marque.findMany({
        where: {
          aliases: { some: { label: { equals: q, mode: "insensitive" } } },
        },
        select,
        take: 10,
      }),
      prisma.marque.findMany({
        where: { nom: { startsWith: q, mode: "insensitive" } },
        select,
        orderBy: { nom: "asc" },
        take: 20,
      }),
      prisma.marque.findMany({
        where: {
          aliases: {
            some: { label: { contains: q, mode: "insensitive" } },
          },
        },
        select,
        take: 20,
      }),
      prisma.marque.findMany({
        where: { nom: { contains: q, mode: "insensitive" } },
        select,
        orderBy: { nom: "asc" },
        take: 30,
      }),
      qSlug
        ? prisma.marque.findMany({
            where: {
              OR: [
                { slug: qSlug },
                { aliases: { some: { slug: qSlug } } },
              ],
            },
            select,
            take: 10,
          })
        : Promise.resolve([]),
      qSoftSlug && qSoftSlug !== qSlug
        ? prisma.marque.findMany({
            where: {
              OR: [
                { slug: qSoftSlug },
                { aliases: { some: { slug: qSoftSlug } } },
              ],
            },
            select,
            take: 10,
          })
        : Promise.resolve([]),
      tokenAndFilters.length >= 2
        ? prisma.marque.findMany({
            where: { AND: tokenAndFilters },
            select,
            take: 30,
          })
        : Promise.resolve([]),
    ]);

    const byId = new Map<string, MarqueRow>();
    for (const batch of [
      exactNom,
      exactAlias,
      bySlug,
      bySoftSlug,
      startsNom,
      byTokens,
      aliasContains,
      nomContains,
    ]) {
      for (const row of batch) byId.set(row.id, row);
    }

    const qNorm = normalize(q);
    const qSoftNorm = tokens
      .map((t) => (t.endsWith("s") && t.length > 3 ? t.slice(0, -1) : t))
      .join(" ");

    const scored = [...byId.values()].map((r) => {
      const nomNorm = normalize(r.nom);
      const nomSoft = searchTokens(r.nom)
        .map((t) => (t.endsWith("s") && t.length > 3 ? t.slice(0, -1) : t))
        .join(" ");
      const exactAliasHit = r.aliases.find((a) => normalize(a.label) === qNorm);
      const softAliasHit = r.aliases.find((a) => {
        const soft = searchTokens(a.label)
          .map((t) => (t.endsWith("s") && t.length > 3 ? t.slice(0, -1) : t))
          .join(" ");
        return soft === qSoftNorm && soft.length > 0;
      });
      const aliasStarts = r.aliases.find((a) =>
        normalize(a.label).startsWith(qNorm)
      );

      const slugHit =
        (r.slug && (r.slug === qSlug || r.slug === qSoftSlug)) ||
        false;

      let rank = 50;
      if (nomNorm === qNorm) rank = 0;
      else if (exactAliasHit) rank = 1;
      else if (nomSoft === qSoftNorm && qSoftNorm.length > 0) rank = 1;
      else if (softAliasHit || slugHit) rank = 1;
      else if (nomNorm.startsWith(qNorm + " ") || nomNorm.startsWith(qNorm))
        rank = 2;
      else if (aliasStarts) rank = 3;
      else if (
        tokens.length >= 2 &&
        tokens.every((token) =>
          tokenVariants(token).some(
            (v) =>
              nomNorm.includes(v) ||
              r.aliases.some((a) => normalize(a.label).includes(v))
          )
        )
      )
        rank = 3;
      else if (
        new RegExp(`(?:^|[^a-z0-9])${escapeRegex(qNorm)}(?:$|[^a-z0-9])`).test(
          nomNorm
        )
      )
        rank = 4;
      else if (r.aliases.some((a) => normalize(a.label).includes(qNorm)))
        rank = 5;
      else rank = 6;

      return {
        id: r.id,
        nom: r.nom,
        ville: r.ville || "",
        contactCount: r._count.contacts,
        matchedAlias:
          exactAliasHit?.label ||
          softAliasHit?.label ||
          aliasStarts?.label ||
          null,
        exactMatch: rank <= 1,
        rank,
      };
    });

    scored.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.nom.localeCompare(b.nom, "fr");
    });

    const marques = scored.slice(0, 25).map(({ rank: _rank, ...rest }) => rest);

    return NextResponse.json({ marques });
  } catch (error) {
    console.error("GET /api/marques/search:", error);
    return NextResponse.json(
      { error: "Erreur lors de la recherche de marques." },
      { status: 500 }
    );
  }
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
