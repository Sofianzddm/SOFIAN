import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import prisma from "@/lib/prisma";

function isRole(role: string | undefined, expected: string): boolean {
  return role === expected;
}

function isAllowed(role: string | undefined): boolean {
  return role === "ADMIN" || role === "HEAD_OF_INFLUENCE" || role === "HEAD_OF";
}


function isMissingPrimeTableError(error: unknown): boolean {
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : "";
  const metaCode =
    typeof error === "object" &&
    error !== null &&
    "meta" in error &&
    typeof (error as { meta?: { code?: unknown } }).meta?.code === "string"
      ? ((error as { meta: { code: string } }).meta.code)
      : "";
  return code == "P2010" && metaCode == "42P01";
}

function getPrimeDelegate():
  | {
      findUnique: (...args: unknown[]) => Promise<unknown>;
      create: (...args: unknown[]) => Promise<unknown>;
      findMany: (...args: unknown[]) => Promise<unknown>;
    }
  | null {
  const d = (prisma as unknown as { primeSalaire?: unknown }).primeSalaire;
  if (!d || typeof d !== "object") return null;
  return d as {
    findUnique: (...args: unknown[]) => Promise<unknown>;
    create: (...args: unknown[]) => Promise<unknown>;
    findMany: (...args: unknown[]) => Promise<unknown>;
  };
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (!(session.user.role === "HEAD_OF_INFLUENCE" || session.user.role === "HEAD_OF")) {
      return NextResponse.json({ error: "Accès réservé aux rôles Head of." }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as { mois?: unknown; annee?: unknown } | null;
    const mois = Number(body?.mois);
    const annee = Number(body?.annee);
    if (!Number.isInteger(mois) || mois < 1 || mois > 12 || !Number.isInteger(annee) || annee < 2020) {
      return NextResponse.json({ error: "mois/annee invalides." }, { status: 400 });
    }

    const primeDelegate = getPrimeDelegate();
    let exists: unknown = null;
    if (primeDelegate) {
      exists = await primeDelegate.findUnique({
        where: { userId_mois_annee: { userId: session.user.id, mois, annee } },
        select: { id: true },
      });
    } else {
      const rows = (await prisma.$queryRaw`
        SELECT "id"
        FROM "PrimeSalaire"
        WHERE "userId" = ${session.user.id} AND "mois" = ${mois} AND "annee" = ${annee}
        LIMIT 1
      `) as Array<{ id: string }>;
      exists = rows[0] ?? null;
    }
    if (exists) {
      return NextResponse.json({ error: "Une entrée existe déjà pour cette période." }, { status: 409 });
    }

    const primeCA = 0;
    let created: unknown;
    if (primeDelegate) {
      created = await primeDelegate.create({
        data: { userId: session.user.id, mois, annee, lignes: [], primeCA, statut: "BROUILLON" },
      });
    } else {
      const id = crypto.randomUUID();
      await prisma.$executeRaw`
        INSERT INTO "PrimeSalaire"
          ("id","userId","mois","annee","lignes","primeCA","statut","createdAt","updatedAt")
        VALUES
          (${id}, ${session.user.id}, ${mois}, ${annee}, ${JSON.stringify([])}::jsonb, ${primeCA}, 'BROUILLON'::"PrimeStatut", NOW(), NOW())
      `;
      const rows = (await prisma.$queryRaw`
        SELECT "id","userId","mois","annee","lignes","primeCA","statut","commentaireAdmin","soumisAt","valideAt","createdAt","updatedAt"
        FROM "PrimeSalaire"
        WHERE "id" = ${id}
        LIMIT 1
      `) as Array<Record<string, unknown>>;
      created = rows[0] ?? { id };
    }
    return NextResponse.json(created);
  } catch (e) {
    if (isMissingPrimeTableError(e)) {
      return NextResponse.json(
        { error: "Table PrimeSalaire absente. Exécutez le SQL de création dans Neon." },
        { status: 503 }
      );
    }
    console.error("POST /api/primes:", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (!isAllowed(session.user.role)) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const primeDelegate = getPrimeDelegate();
    if (primeDelegate) {
      if (session.user.role === "ADMIN") {
        const rows = await primeDelegate.findMany({
          include: { user: { select: { id: true, prenom: true, nom: true, email: true } } },
          orderBy: [{ annee: "desc" }, { mois: "desc" }],
        });
        return NextResponse.json({ primes: rows });
      }
      const rows = await primeDelegate.findMany({
        where: { userId: session.user.id },
        include: { user: { select: { id: true, prenom: true, nom: true, email: true } } },
        orderBy: [{ annee: "desc" }, { mois: "desc" }],
      });
      return NextResponse.json({ primes: rows });
    }

    if (session.user.role === "ADMIN") {
      const rows = (await prisma.$queryRaw`
        SELECT
          p."id", p."userId", p."mois", p."annee", p."lignes", p."primeCA", p."statut",
          p."commentaireAdmin", p."soumisAt", p."valideAt", p."createdAt", p."updatedAt",
          json_build_object('id', u."id", 'prenom', u."prenom", 'nom', u."nom", 'email', u."email") AS "user"
        FROM "PrimeSalaire" p
        JOIN "users" u ON u."id" = p."userId"
        ORDER BY p."annee" DESC, p."mois" DESC
      `) as Array<Record<string, unknown>>;
      return NextResponse.json({ primes: rows });
    }

    const rows = (await prisma.$queryRaw`
      SELECT
        p."id", p."userId", p."mois", p."annee", p."lignes", p."primeCA", p."statut",
        p."commentaireAdmin", p."soumisAt", p."valideAt", p."createdAt", p."updatedAt",
        json_build_object('id', u."id", 'prenom', u."prenom", 'nom', u."nom", 'email', u."email") AS "user"
      FROM "PrimeSalaire" p
      JOIN "users" u ON u."id" = p."userId"
      WHERE p."userId" = ${session.user.id}
      ORDER BY p."annee" DESC, p."mois" DESC
    `) as Array<Record<string, unknown>>;
    return NextResponse.json({ primes: rows });
  } catch (e) {
    if (isMissingPrimeTableError(e)) {
      return NextResponse.json(
        { error: "Table PrimeSalaire absente. Exécutez le SQL de création dans Neon." },
        { status: 503 }
      );
    }
    console.error("GET /api/primes:", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}

