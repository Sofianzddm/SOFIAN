import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";

type DossierRow = {
  id: string;
  nom: string;
  userId: string;
  fichierCount: number;
};

function delegate() {
  return (prisma as unknown as { dossierProspection?: object }).dossierProspection;
}

export async function listDossiersProspection(
  globalView: boolean,
  actorUserId: string
): Promise<DossierRow[]> {
  const d = delegate() as
    | {
        findMany: (args: {
          where?: { userId: string };
          include: { _count: { select: { fichiers: boolean } } };
          orderBy: { nom: "asc" };
        }) => Promise<
          { id: string; nom: string; userId: string; _count: { fichiers: number } }[]
        >;
      }
    | undefined;

  if (d?.findMany) {
    const rows = await d.findMany({
      where: globalView ? undefined : { userId: actorUserId },
      include: {
        _count: { select: { fichiers: true } },
      },
      orderBy: { nom: "asc" },
    });
    return rows.map((r) => ({
      id: r.id,
      nom: r.nom,
      userId: r.userId,
      fichierCount: r._count.fichiers,
    }));
  }

  const rows = globalView
    ? await prisma.$queryRaw<
        { id: string; nom: string; userId: string; cnt: bigint }[]
      >`
        SELECT d.id, d.nom, d."userId", COUNT(f.id)::bigint AS cnt
        FROM dossiers_prospection d
        LEFT JOIN fichiers_prospection f ON f."dossierId" = d.id
        GROUP BY d.id, d.nom, d."userId"
        ORDER BY d.nom ASC
      `
    : await prisma.$queryRaw<
        { id: string; nom: string; userId: string; cnt: bigint }[]
      >`
        SELECT d.id, d.nom, d."userId", COUNT(f.id)::bigint AS cnt
        FROM dossiers_prospection d
        LEFT JOIN fichiers_prospection f ON f."dossierId" = d.id
        WHERE d."userId" = ${actorUserId}
        GROUP BY d.id, d.nom, d."userId"
        ORDER BY d.nom ASC
      `;

  return rows.map((r) => ({
    id: r.id,
    nom: r.nom,
    userId: r.userId,
    fichierCount: Number(r.cnt),
  }));
}

export async function findDossierProspectionById(
  id: string
): Promise<{ id: string; userId: string; nom: string } | null> {
  const d = delegate() as
    | {
        findUnique: (args: {
          where: { id: string };
          select: { id: boolean; userId: boolean; nom: boolean };
        }) => Promise<{ id: string; userId: string; nom: string } | null>;
      }
    | undefined;

  if (d?.findUnique) {
    return d.findUnique({
      where: { id },
      select: { id: true, userId: true, nom: true },
    });
  }

  const rows = await prisma.$queryRaw<
    { id: string; userId: string; nom: string }[]
  >`
    SELECT id, "userId", nom FROM dossiers_prospection WHERE id = ${id} LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function createDossierProspection(
  nom: string,
  userId: string
): Promise<{ id: string; nom: string; userId: string }> {
  const d = delegate() as
    | {
        create: (args: {
          data: { nom: string; userId: string };
        }) => Promise<{ id: string; nom: string; userId: string }>;
      }
    | undefined;

  if (d?.create) {
    return d.create({ data: { nom, userId } });
  }

  const id = nanoid();
  await prisma.$executeRaw`
    INSERT INTO dossiers_prospection (id, nom, "userId", "createdAt", "updatedAt")
    VALUES (${id}, ${nom}, ${userId}, NOW(), NOW())
  `;
  return { id, nom, userId };
}

export async function deleteDossierProspectionById(id: string): Promise<void> {
  const d = delegate() as
    | { delete: (args: { where: { id: string } }) => Promise<unknown> }
    | undefined;

  if (d?.delete) {
    await d.delete({ where: { id } });
    return;
  }

  await prisma.$executeRaw`
    DELETE FROM dossiers_prospection WHERE id = ${id}
  `;
}
