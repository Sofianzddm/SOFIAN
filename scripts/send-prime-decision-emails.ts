/**
 * Envoi rétroactif des emails de décision (validée / refusée) pour les primes
 * sur salaire déjà traitées AVANT l'ajout de la notification automatique.
 *
 * Par défaut : dry-run (liste ce qui serait envoyé, sans rien envoyer).
 *
 * Usage :
 *   npx tsx scripts/send-prime-decision-emails.ts          # dry-run
 *   npx tsx scripts/send-prime-decision-emails.ts --apply  # envoie réellement les emails
 */
import "dotenv/config";
import { Resend } from "resend";
import { prisma } from "../src/lib/prisma";
import { PrimeDecisionEmail } from "../src/lib/emails/PrimeDecisionEmail";
import { euro, parsePrimeLignes, totalLignes } from "../src/lib/primes";

const APPLY = process.argv.includes("--apply");

function moisLabel(mois: number): string {
  return (
    [
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
    ][mois - 1] || `M${mois}`
  );
}

type Row = {
  id: string;
  mois: number;
  annee: number;
  lignes: unknown;
  primeCA: number;
  statut: "VALIDE" | "REFUSE";
  commentaireAdmin: string | null;
  user: { prenom: string; nom: string; email: string };
};

async function main() {
  const rows = (await prisma.$queryRaw`
    SELECT
      p."id", p."mois", p."annee", p."lignes", p."primeCA", p."statut", p."commentaireAdmin",
      json_build_object('prenom', u."prenom", 'nom', u."nom", 'email', u."email") AS "user"
    FROM "PrimeSalaire" p
    JOIN "users" u ON u."id" = p."userId"
    WHERE p."statut" IN ('VALIDE', 'REFUSE')
    ORDER BY p."annee" ASC, p."mois" ASC
  `) as Row[];

  console.log(
    `${rows.length} prime(s) déjà décidée(s) trouvée(s) — ${APPLY ? "MODE APPLY (envoi réel)" : "dry-run (aucun envoi)"}\n`
  );

  const resendKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim() || "notifications@glowupagence.fr";
  if (APPLY && !resendKey) {
    console.error("RESEND_API_KEY manquant : impossible d'envoyer. Abandon.");
    process.exit(1);
  }
  const resend = resendKey ? new Resend(resendKey) : null;

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    const statutLabel = row.statut === "VALIDE" ? "validées" : "refusées";
    const who = `${row.user.prenom} ${row.user.nom} <${row.user.email}>`;
    const periode = `${moisLabel(row.mois)} ${row.annee}`;

    if (!row.user.email) {
      console.log(`  ⚠️  ${who} — ${periode} (${statutLabel}) : email manquant, ignoré`);
      skipped++;
      continue;
    }

    const totalL = totalLignes(parsePrimeLignes(row.lignes));
    const primeCA = Number(row.primeCA || 0);
    const totalGeneral = totalL + primeCA;

    if (!APPLY) {
      console.log(`  ✉️  ${who} — ${periode} (${statutLabel}) — total ${euro(totalGeneral)}`);
      continue;
    }

    try {
      await resend!.emails.send({
        from: fromEmail,
        to: row.user.email,
        subject: `[Glow Up] Primes ${statutLabel} – ${periode}`,
        react: PrimeDecisionEmail({
          prenomEmploye: row.user.prenom,
          statut: row.statut,
          moisLabel: moisLabel(row.mois),
          annee: row.annee,
          totalLignes: euro(totalL),
          primeCA: euro(primeCA),
          totalGeneral: euro(totalGeneral),
          commentaireAdmin: row.commentaireAdmin || undefined,
          primesUrl: "https://app.glowupagence.fr/primes",
        }),
      });
      console.log(`  ✅ ${who} — ${periode} (${statutLabel}) : envoyé`);
      sent++;
    } catch (err) {
      console.error(`  ❌ ${who} — ${periode} (${statutLabel}) :`, err);
      errors++;
    }
  }

  console.log(
    `\nRésumé : ${APPLY ? `${sent} envoyé(s)` : `${rows.length - skipped} à envoyer`}, ${skipped} ignoré(s), ${errors} erreur(s).`
  );
  if (!APPLY) {
    console.log("Relance avec --apply pour envoyer réellement.");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
