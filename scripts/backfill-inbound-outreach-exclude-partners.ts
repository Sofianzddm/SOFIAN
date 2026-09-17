import prisma from "../src/lib/prisma";
import {
  bridgeContactToOutreach,
  resolveOutreachPipeline,
} from "../src/lib/outreach-bridge";
import { parseSenderName } from "../src/lib/marque-resolver";
import { emailHasDiffusionOptOut } from "../src/lib/diffusion-opt-out";

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

function extractEmail(fromValue: string): string {
  const trimmed = (fromValue || "").trim();
  const m = trimmed.match(/<([^>]+)>/);
  if (m?.[1]) return m[1].trim().toLowerCase();
  return trimmed.toLowerCase();
}

type Candidate = {
  email: string;
  firstname?: string | null;
  lastname?: string | null;
  company?: string | null;
  marqueId?: string | null;
  contactKind?: string | null;
  contactAgence?: string | null;
  language?: string | null;
  lastExchangeAt: Date;
  sourceLabel: string;
  inboundId?: string;
  demandeId?: string;
};

async function main() {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", actif: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true },
  });
  if (!admin) throw new Error("Aucun ADMIN");

  const inbounds = await prisma.inboundOpportunity.findMany({
    where: {
      sentAt: { not: null },
      status: { not: "CONVERTED" },
    },
    select: {
      id: true,
      senderEmail: true,
      senderName: true,
      extractedBrand: true,
      marqueId: true,
      contactKind: true,
      contactAgence: true,
      contactLanguage: true,
      sentAt: true,
      relance1SentAt: true,
      relance2SentAt: true,
      replied: true,
      updatedAt: true,
      outreachBridgedAt: true,
      outreachTargetRef: true,
    },
  });

  const demandes = await prisma.demandeEntrante.findMany({
    where: { status: { in: ["envoye", "repondu", "relance_terminee"] } },
    select: {
      id: true,
      from: true,
      extractedBrand: true,
      marqueId: true,
      date: true,
      sentAt: true,
      relance1SentAt: true,
      relance2SentAt: true,
      replied: true,
      updatedAt: true,
      outreachBridgedAt: true,
      outreachTargetRef: true,
    },
  });

  const byEmail = new Map<string, Candidate>();

  const maxDate = (...dates: Array<Date | null | undefined>) => {
    let max: Date | null = null;
    for (const d of dates) {
      if (d && (!max || d.getTime() > max.getTime())) max = d;
    }
    return max;
  };

  for (const opp of inbounds) {
    const email = (opp.senderEmail || "").trim().toLowerCase();
    if (!isValidEmail(email)) continue;
    const sender = parseSenderName(opp.senderName);
    const lastExchangeAt =
      maxDate(
        opp.sentAt,
        opp.relance1SentAt,
        opp.relance2SentAt,
        opp.replied ? opp.updatedAt : null
      ) || opp.sentAt!;
    const existing = byEmail.get(email);
    if (!existing || lastExchangeAt > existing.lastExchangeAt) {
      byEmail.set(email, {
        email,
        firstname: sender.prenom,
        lastname: sender.prenom ? sender.nom : null,
        company: opp.extractedBrand,
        marqueId: opp.marqueId,
        contactKind: opp.contactKind,
        contactAgence: opp.contactAgence,
        language: opp.contactLanguage,
        lastExchangeAt,
        sourceLabel: "inbound (rattrapage)",
        inboundId: opp.id,
      });
    }
  }

  for (const d of demandes) {
    const email = extractEmail(d.from);
    if (!isValidEmail(email)) continue;
    const sender = parseSenderName(d.from);
    const lastExchangeAt =
      maxDate(
        d.date,
        d.sentAt,
        d.relance1SentAt,
        d.relance2SentAt,
        d.replied ? d.updatedAt : null
      ) || new Date();
    const existing = byEmail.get(email);
    if (!existing || lastExchangeAt > existing.lastExchangeAt) {
      byEmail.set(email, {
        email,
        firstname: sender.prenom,
        lastname: sender.prenom ? sender.nom : null,
        company: d.extractedBrand,
        marqueId: d.marqueId,
        lastExchangeAt,
        sourceLabel: "demande entrante (rattrapage)",
        demandeId: d.id,
      });
    }
  }

  console.log(`Candidats uniques (inbound/demande envoyés): ${byEmail.size}`);

  let enrolled = 0;
  let alreadyTracked = 0;
  let skippedPartner = 0;
  let skippedOptOut = 0;
  let skippedStopped = 0;
  let skippedOther = 0;
  let alreadyClientOk = 0;
  const partnerSamples: string[] = [];
  const enrolledSamples: string[] = [];
  const errorSamples: string[] = [];

  for (const c of byEmail.values()) {
    // Déjà en pipeline client → OK, on ne touche pas (sauf si jamais bridgé on pourrait, but skip)
    const resolution = await resolveOutreachPipeline(c.email);

    // Exclure partners / agences connues
    if (
      resolution.kind === "known-agency" ||
      (c.contactKind || "").toUpperCase() === "AGENCE"
    ) {
      skippedPartner++;
      if (partnerSamples.length < 25) {
        const name =
          resolution.kind === "known-agency"
            ? resolution.partner.name
            : c.contactAgence || "AGENCE";
        partnerSamples.push(`${c.email} | ${c.company || "?"} → partner/agence ${name}`);
      }
      // Marquer l'inbound comme skipped:partner si pas encore marqué utilement
      if (c.inboundId) {
        await prisma.inboundOpportunity.update({
          where: { id: c.inboundId },
          data: {
            outreachBridgedAt: new Date(),
            outreachTargetRef: "skipped:partner",
          },
        }).catch(() => {});
      }
      if (c.demandeId) {
        await prisma.demandeEntrante.update({
          where: { id: c.demandeId },
          data: {
            outreachBridgedAt: new Date(),
            outreachTargetRef: "skipped:partner",
          },
        }).catch(() => {});
      }
      continue;
    }

    if (resolution.kind === "existing-target") {
      if (resolution.pipeline === "agency" || resolution.pipeline === "benelux") {
        // Déjà suivi côté agence/benelux → on n'enrôle PAS en client
        skippedPartner++;
        if (partnerSamples.length < 25) {
          partnerSamples.push(
            `${c.email} | déjà ${resolution.pipeline}: ${resolution.target.company}`
          );
        }
        continue;
      }
      // Déjà client : compter comme déjà OK (optionnellement replanifier)
      alreadyClientOk++;
      continue;
    }

    if (await emailHasDiffusionOptOut(c.email)) {
      skippedOptOut++;
      continue;
    }

    try {
      const bridge = await bridgeContactToOutreach({
        email: c.email,
        firstname: c.firstname,
        lastname: c.lastname,
        company: c.company,
        marqueId: c.marqueId,
        contactKind: c.contactKind,
        contactAgence: c.contactAgence,
        language: c.language,
        lastExchangeAt: c.lastExchangeAt,
        createdById: admin.id,
        sourceLabel: c.sourceLabel,
        reasonLabel: `Rattrapage ${c.sourceLabel} du ${c.lastExchangeAt.toISOString().slice(0, 10)}`,
      });

      if (!bridge.ok) {
        if (bridge.reason === "diffusion-opt-out") skippedOptOut++;
        else skippedOther++;
        if (errorSamples.length < 15) {
          errorSamples.push(`${c.email}: ${bridge.reason}`);
        }
        continue;
      }

      // Si le bridge a routé vers agency malgré tout, on ne veut pas ça
      if (bridge.pipeline === "agency") {
        skippedPartner++;
        // Soft: leave as is in agency (already created) but mark inbound skipped:partner
        if (c.inboundId) {
          await prisma.inboundOpportunity.update({
            where: { id: c.inboundId },
            data: {
              outreachBridgedAt: new Date(),
              outreachTargetRef: `skipped:partner-routed:${bridge.targetId}`,
            },
          }).catch(() => {});
        }
        continue;
      }

      if (bridge.action === "created") {
        enrolled++;
        if (enrolledSamples.length < 30) {
          enrolledSamples.push(`${c.company || "?"} — ${c.email} (${bridge.pipeline})`);
        }
      } else if (bridge.action === "already-tracked") {
        alreadyTracked++;
      } else if (bridge.action === "skipped-stopped") {
        skippedStopped++;
      }

      if (c.inboundId) {
        await prisma.inboundOpportunity.update({
          where: { id: c.inboundId },
          data: {
            outreachBridgedAt: new Date(),
            outreachTargetRef: `${bridge.pipeline}:${bridge.targetId}`,
          },
        }).catch(() => {});
      }
      if (c.demandeId) {
        await prisma.demandeEntrante.update({
          where: { id: c.demandeId },
          data: {
            outreachBridgedAt: new Date(),
            outreachTargetRef: `${bridge.pipeline}:${bridge.targetId}`,
          },
        }).catch(() => {});
      }
    } catch (e) {
      skippedOther++;
      if (errorSamples.length < 15) {
        errorSamples.push(`${c.email}: ${String(e).slice(0, 120)}`);
      }
    }
  }

  console.log("\n=== Résultat rattrapage ===");
  console.log({
    enrolled,
    alreadyTracked,
    alreadyClientOk,
    skippedPartner,
    skippedOptOut,
    skippedStopped,
    skippedOther,
  });
  console.log("\nEnrôlés (échantillon):");
  enrolledSamples.forEach((s) => console.log(" +", s));
  console.log("\nExclus partners/agences (échantillon):");
  partnerSamples.forEach((s) => console.log(" -", s));
  if (errorSamples.length) {
    console.log("\nErreurs:");
    errorSamples.forEach((s) => console.log(" !", s));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
