/**
 * Configure COL-2026-0234 en long terme avec 2 cycles facturables :
 * - 6 300 € HT médiatisation
 * - 9 800 € HT collaboration
 * Total net = 16 100 € (inchangé). Commission 30 % répartie au prorata.
 */
import { PrismaClient } from "@prisma/client";

const COLLAB_ID = "cmt8d18sb0001jo04qtnocid3";
const COMMISSION_PERCENT = 30;

function fromNet(net: number) {
  const brut = Math.round((net / (1 - COMMISSION_PERCENT / 100)) * 100) / 100;
  const commission = Math.round((brut - net) * 100) / 100;
  return { brut, commission, net };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const collab = await prisma.collaboration.findUnique({
      where: { id: COLLAB_ID },
      select: {
        id: true,
        reference: true,
        isLongTerme: true,
        montantBrut: true,
        montantNet: true,
        commissionPercent: true,
        cycles: { select: { id: true, numero: true, description: true } },
      },
    });

    if (!collab) {
      throw new Error(`Collab ${COLLAB_ID} introuvable`);
    }
    if (collab.reference !== "COL-2026-0234") {
      throw new Error(`Référence inattendue: ${collab.reference}`);
    }

    if (collab.cycles.length > 0) {
      console.log("Cycles déjà présents — reset avant recréation:");
      console.log(collab.cycles);
      await prisma.collabCycle.deleteMany({ where: { collaborationId: COLLAB_ID } });
    }

    const c1 = fromNet(6300);
    const c2 = fromNet(9800);

    await prisma.$transaction([
      prisma.collaboration.update({
        where: { id: COLLAB_ID },
        data: { isLongTerme: true },
      }),
      prisma.collabCycle.create({
        data: {
          collaborationId: COLLAB_ID,
          numero: 1,
          description: "Médiatisation",
          montantBrut: c1.brut,
          commissionEuros: c1.commission,
          montantNet: c1.net,
          statut: "PUBLIE",
          datePublication: new Date(),
        },
      }),
      prisma.collabCycle.create({
        data: {
          collaborationId: COLLAB_ID,
          numero: 2,
          description: "Collaboration",
          montantBrut: c2.brut,
          commissionEuros: c2.commission,
          montantNet: c2.net,
          statut: "PUBLIE",
          datePublication: new Date(),
        },
      }),
    ]);

    const updated = await prisma.collaboration.findUnique({
      where: { id: COLLAB_ID },
      select: {
        reference: true,
        isLongTerme: true,
        montantNet: true,
        cycles: {
          orderBy: { numero: "asc" },
          select: {
            numero: true,
            description: true,
            montantBrut: true,
            commissionEuros: true,
            montantNet: true,
            statut: true,
            factureTalentUrl: true,
          },
        },
      },
    });

    console.log("OK:", JSON.stringify(updated, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
