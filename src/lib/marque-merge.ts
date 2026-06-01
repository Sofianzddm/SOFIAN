import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

/**
 * Fusionne `sourceMarqueId` dans `targetMarqueId` (la fiche cible est conservée).
 * Déplace tous les FK puis supprime la source.
 */
export async function mergeMarques(
  targetMarqueId: string,
  sourceMarqueId: string
): Promise<{ moved: Record<string, number> }> {
  if (targetMarqueId === sourceMarqueId) {
    throw new Error("Impossible de fusionner une marque avec elle-même.");
  }

  const [target, source] = await Promise.all([
    prisma.marque.findUnique({ where: { id: targetMarqueId }, select: { id: true, nom: true } }),
    prisma.marque.findUnique({ where: { id: sourceMarqueId }, select: { id: true, nom: true } }),
  ]);

  if (!target || !source) {
    throw new Error("Marque source ou cible introuvable.");
  }

  const moved: Record<string, number> = {};

  await prisma.$transaction(async (tx) => {
    const upd = async (model: keyof Prisma.TransactionClient, countKey: string) => {
      const m = tx[model] as { updateMany: (args: unknown) => Promise<{ count: number }> };
      const result = await m.updateMany({
        where: { marqueId: sourceMarqueId },
        data: { marqueId: targetMarqueId },
      });
      if (result.count > 0) moved[countKey] = result.count;
    };

    await upd("marqueContact", "contacts");
    await upd("collaboration", "collaborations");
    await upd("negociation", "negociations");
    await upd("prospection", "prospections");
    await upd("demandeGift", "demandesGift");
    await upd("quote", "quotes");
    await upd("inboundOpportunity", "inboundOpportunities");
    await upd("contactMission", "contactMissions");
    await upd("opportuniteMarque", "opportunitesMarque");
    await upd("demandeEntrante", "demandesEntrantes");

    const notif = await tx.notification.updateMany({
      where: { marqueId: sourceMarqueId },
      data: { marqueId: targetMarqueId },
    });
    if (notif.count > 0) moved.notifications = notif.count;

    // Alias : rattacher à la cible ; doublons ignorés (P2002)
    const aliases = await tx.marqueAlias.findMany({
      where: { marqueId: sourceMarqueId },
    });
    for (const alias of aliases) {
      await tx.marqueAlias
        .create({
          data: {
            marqueId: targetMarqueId,
            slug: alias.slug,
            label: alias.label,
            source: `MERGE_FROM_${alias.source}`,
          },
        })
        .catch((err: { code?: string }) => {
          if (err?.code !== "P2002") throw err;
        });
    }
    await tx.marqueAlias.deleteMany({ where: { marqueId: sourceMarqueId } });

    // Mémoriser le nom de la source comme alias
    if (source.nom.trim().toLowerCase() !== target.nom.trim().toLowerCase()) {
      const { marqueSlug } = await import("@/lib/marque-resolver");
      const slug = marqueSlug(source.nom);
      if (slug) {
        await tx.marqueAlias
          .create({
            data: {
              marqueId: targetMarqueId,
              slug,
              label: source.nom,
              source: "MERGE",
            },
          })
          .catch((err: { code?: string }) => {
            if (err?.code !== "P2002") throw err;
          });
      }
    }

    await tx.marque.delete({ where: { id: sourceMarqueId } });
  });

  return { moved };
}
