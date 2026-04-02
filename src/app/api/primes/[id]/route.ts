import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { getAppSession } from "@/lib/getAppSession";
import prisma from "@/lib/prisma";
import { PrimeSubmittedEmail } from "@/lib/emails/PrimeSubmittedEmail";
import { euro, parsePrimeLignes, totalLignes } from "@/lib/primes";

type PatchBody = {
  lignes?: unknown;
  action?: "save" | "submit" | "validate" | "refuse";
  commentaireAdmin?: unknown;
  primeCA?: unknown;
};

function moisLabel(mois: number): string {
  return [
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre",
  ][mois - 1] || `M${mois}`;
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
      ? (error as { meta: { code: string } }).meta.code
      : "";
  return code === "P2010" && metaCode === "42P01";
}



function parsePrimeCAInput(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 100) / 100;
  if (typeof value === "string") {
    const n = Number(value.trim().replace(/\s+/g, "").replace(",", "."));
    if (Number.isFinite(n)) return Math.round(n * 100) / 100;
  }
  return Math.round((Number.isFinite(fallback) ? fallback : 0) * 100) / 100;
}

function getPrimeDelegate():
  | {
      findUnique: (...args: unknown[]) => Promise<unknown>;
      update: (...args: unknown[]) => Promise<unknown>;
    }
  | null {
  const d = (prisma as unknown as { primeSalaire?: unknown }).primeSalaire;
  if (!d || typeof d !== "object") return null;
  return d as {
    findUnique: (...args: unknown[]) => Promise<unknown>;
    update: (...args: unknown[]) => Promise<unknown>;
  };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const role = String(session.user.role || "");
    if (!["HEAD_OF_INFLUENCE", "HEAD_OF", "ADMIN"].includes(role)) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const { id } = await params;
    const payload = (await request.json().catch(() => null)) as PatchBody | null;
    const primeDelegate = getPrimeDelegate();
    const row = primeDelegate
      ? ((await primeDelegate.findUnique({
          where: { id },
          include: { user: { select: { id: true, prenom: true, nom: true, email: true } } },
        })) as
          | {
              id: string;
              userId: string;
              mois: number;
              annee: number;
              lignes: unknown;
              primeCA: number;
              statut: string;
              user: { id: string; prenom: string; nom: string; email: string };
            }
          | null)
      : (((await prisma.$queryRaw`
          SELECT
            p."id", p."userId", p."mois", p."annee", p."lignes", p."primeCA", p."statut",
            p."commentaireAdmin", p."soumisAt", p."valideAt", p."createdAt", p."updatedAt",
            json_build_object('id', u."id", 'prenom', u."prenom", 'nom', u."nom", 'email', u."email") AS "user"
          FROM "PrimeSalaire" p
          JOIN "users" u ON u."id" = p."userId"
          WHERE p."id" = ${id}
          LIMIT 1
        `) as Array<{
          id: string;
          userId: string;
          mois: number;
          annee: number;
          lignes: unknown;
          primeCA: number;
          statut: string;
          user: { id: string; prenom: string; nom: string; email: string };
        }>)[0] ?? null);
    if (!row) return NextResponse.json({ error: "Prime introuvable." }, { status: 404 });

    if (row.statut === "VALIDE" || row.statut === "REFUSE") {
      return NextResponse.json({ error: "Cette soumission est définitive." }, { status: 400 });
    }

    const action = payload?.action;
    const nextLignes = payload?.lignes !== undefined ? parsePrimeLignes(payload.lignes) : parsePrimeLignes(row.lignes);
    const nextPrimeCA = parsePrimeCAInput(payload?.primeCA, Number(row.primeCA || 0));

    if (role === "HEAD_OF_INFLUENCE" || role === "HEAD_OF") {
      if (row.userId !== session.user.id) {
        return NextResponse.json({ error: "Vous ne pouvez modifier que vos primes." }, { status: 403 });
      }
      if (row.statut !== "BROUILLON") {
        return NextResponse.json({ error: "Seul un brouillon est modifiable." }, { status: 400 });
      }

      if (action === "submit") {
        const primeCA = nextPrimeCA;
        const updated = primeDelegate
          ? ((await primeDelegate.update({
              where: { id: row.id },
              data: { lignes: nextLignes, primeCA, statut: "SOUMIS", soumisAt: new Date() },
              include: { user: { select: { id: true, prenom: true, nom: true, email: true } } },
            })) as {
              id: string;
              mois: number;
              annee: number;
              user: { prenom: string };
            })
          : (await (async () => {
              await prisma.$executeRaw`
                UPDATE "PrimeSalaire"
                SET "lignes" = ${JSON.stringify(nextLignes)}::jsonb,
                    "primeCA" = ${primeCA},
                    "statut" = 'SOUMIS'::"PrimeStatut",
                    "soumisAt" = NOW(),
                    "updatedAt" = NOW()
                WHERE "id" = ${row.id}
              `;
              const rows = (await prisma.$queryRaw`
                SELECT
                  p."id", p."mois", p."annee",
                  json_build_object('prenom', u."prenom") AS "user"
                FROM "PrimeSalaire" p
                JOIN "users" u ON u."id" = p."userId"
                WHERE p."id" = ${row.id}
                LIMIT 1
              `) as Array<{ id: string; mois: number; annee: number; user: { prenom: string } }>;
              return rows[0] as { id: string; mois: number; annee: number; user: { prenom: string } };
            })());

        const resendKey = process.env.RESEND_API_KEY?.trim();
        if (resendKey) {
          const resend = new Resend(resendKey);
          const totalL = totalLignes(nextLignes);
          const totalGeneral = totalL + primeCA;
          const adminUrl = "https://app.glowupagence.fr/admin/primes";
          await resend.emails.send({
            from: "notifications@glowupagence.fr",
            to: "sofian@glowupagence.fr",
            subject: `[Glow Up] Primes soumises – ${updated.user.prenom} – ${moisLabel(updated.mois)} ${updated.annee}`,
            react: PrimeSubmittedEmail({
              prenomEmploye: updated.user.prenom,
              moisLabel: moisLabel(updated.mois),
              annee: updated.annee,
              totalLignes: euro(totalL),
              primeCA: euro(primeCA),
              totalGeneral: euro(totalGeneral),
              adminUrl,
            }),
          });
        }
        return NextResponse.json({ success: true, prime: updated });
      }

      const updated = primeDelegate
        ? await primeDelegate.update({
            where: { id: row.id },
            data: { lignes: nextLignes, primeCA: nextPrimeCA },
          })
        : await (async () => {
            await prisma.$executeRaw`
              UPDATE "PrimeSalaire"
              SET "lignes" = ${JSON.stringify(nextLignes)}::jsonb, "primeCA" = ${nextPrimeCA}, "updatedAt" = NOW()
              WHERE "id" = ${row.id}
            `;
            const rows = (await prisma.$queryRaw`
              SELECT * FROM "PrimeSalaire" WHERE "id" = ${row.id} LIMIT 1
            `) as Array<Record<string, unknown>>;
            return rows[0] ?? { id: row.id };
          })();
      return NextResponse.json({ success: true, prime: updated });
    }

    if (role === "ADMIN") {
      if (row.statut !== "SOUMIS") {
        return NextResponse.json({ error: "Seules les primes soumises sont traitables." }, { status: 400 });
      }
      if (action === "validate") {
        const updated = primeDelegate
          ? await primeDelegate.update({
              where: { id: row.id },
              data: { statut: "VALIDE", valideAt: new Date(), commentaireAdmin: null },
            })
          : await (async () => {
              await prisma.$executeRaw`
                UPDATE "PrimeSalaire"
                SET "statut" = 'VALIDE'::"PrimeStatut", "valideAt" = NOW(), "commentaireAdmin" = NULL, "updatedAt" = NOW()
                WHERE "id" = ${row.id}
              `;
              const rows = (await prisma.$queryRaw`
                SELECT * FROM "PrimeSalaire" WHERE "id" = ${row.id} LIMIT 1
              `) as Array<Record<string, unknown>>;
              return rows[0] ?? { id: row.id };
            })();
        return NextResponse.json({ success: true, prime: updated });
      }
      if (action === "refuse") {
        const commentaireAdmin =
          typeof payload?.commentaireAdmin === "string" ? payload.commentaireAdmin.trim() : "";
        if (!commentaireAdmin) {
          return NextResponse.json({ error: "Le commentaire admin est obligatoire." }, { status: 400 });
        }
        const updated = primeDelegate
          ? await primeDelegate.update({
              where: { id: row.id },
              data: { statut: "REFUSE", commentaireAdmin, valideAt: null },
            })
          : await (async () => {
              await prisma.$executeRaw`
                UPDATE "PrimeSalaire"
                SET "statut" = 'REFUSE'::"PrimeStatut", "commentaireAdmin" = ${commentaireAdmin}, "valideAt" = NULL, "updatedAt" = NOW()
                WHERE "id" = ${row.id}
              `;
              const rows = (await prisma.$queryRaw`
                SELECT * FROM "PrimeSalaire" WHERE "id" = ${row.id} LIMIT 1
              `) as Array<Record<string, unknown>>;
              return rows[0] ?? { id: row.id };
            })();
        return NextResponse.json({ success: true, prime: updated });
      }
      return NextResponse.json({ error: "Action admin invalide." }, { status: 400 });
    }

    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  } catch (e) {
    if (isMissingPrimeTableError(e)) {
      return NextResponse.json(
        { error: "Table PrimeSalaire absente. Exécutez le SQL de création dans Neon." },
        { status: 503 }
      );
    }
    console.error("PATCH /api/primes/[id]:", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}

