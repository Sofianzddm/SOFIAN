import { prisma } from "@/lib/prisma";
import { checkThreadActivity } from "@/lib/gmail";
import { beneluxOutreachFromEmail } from "@/lib/benelux-outreach-send";

export type BounceCheckResult = {
  scanned: number;
  bounces: { name: string; company: string; email: string }[];
  falseReplies: { name: string; company: string; cycleNumber: number }[];
  errors: number;
};

/**
 * Vérification rétroactive des mails BENELUX déjà envoyés : inspecte le thread
 * Gmail de chaque touch et détecte les bounces (adresse invalide) et les
 * fausses « réponses ».
 *
 * apply=false : rapport seulement. apply=true : supprime les contacts en bounce
 * (avec notification au créateur) et remet à zéro les faux repliedAt.
 */
export async function checkBeneluxOutreachBounces(
  apply: boolean
): Promise<BounceCheckResult> {
  const targets = await prisma.beneluxOutreachTarget.findMany({
    include: {
      touches: {
        where: { sentAt: { not: null }, threadId: { not: null } },
        orderBy: { cycleNumber: "desc" },
      },
    },
    orderBy: { companyName: "asc" },
  });

  const result: BounceCheckResult = {
    scanned: 0,
    bounces: [],
    falseReplies: [],
    errors: 0,
  };

  for (const target of targets) {
    if (target.touches.length === 0) continue;
    result.scanned += 1;
    const name = `${target.firstname} ${target.lastname || ""}`.trim();
    let targetBounced = false;
    let targetReplied = false;

    for (const touch of target.touches) {
      try {
        const activity = await checkThreadActivity(
          beneluxOutreachFromEmail({ fromEmail: touch.fromEmail }),
          touch.threadId as string
        );
        if (activity.replied) targetReplied = true;
        if (activity.bounced && !activity.replied) targetBounced = true;

        if (touch.repliedAt && !activity.replied) {
          result.falseReplies.push({
            name,
            company: target.companyName,
            cycleNumber: touch.cycleNumber,
          });
          if (apply) {
            await prisma.beneluxOutreachTouch.update({
              where: { id: touch.id },
              data: { repliedAt: null },
            });
            if (target.lastRepliedAt) {
              await prisma.beneluxOutreachTarget.update({
                where: { id: target.id },
                data: { lastRepliedAt: null },
              });
            }
          }
        }
      } catch (error) {
        result.errors += 1;
        console.warn(
          `[benelux-outreach-bounce-check] ${target.email} cycle ${touch.cycleNumber}:`,
          error instanceof Error ? error.message : error
        );
      }
    }

    if (targetBounced && !targetReplied) {
      result.bounces.push({ name, company: target.companyName, email: target.email });
      if (apply) {
        await prisma.notification
          .create({
            data: {
              userId: target.createdById,
              type: "GENERAL",
              titre: "Email invalide (BENELUX)",
              message: `${name} (${target.companyName}) : l'adresse ${target.email} n'existe pas — le mail est revenu en erreur, contact retiré du cycle.`,
              lien: "/outreach",
            },
          })
          .catch(() => {});
        await prisma.beneluxOutreachTarget
          .delete({ where: { id: target.id } })
          .catch(() => {});
      }
    }
  }

  return result;
}
