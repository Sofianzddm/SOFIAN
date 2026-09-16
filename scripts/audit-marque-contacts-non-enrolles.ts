/**
 * Audit : tous les contacts fiches Marques hors cycle outreach client,
 * ventilés par raison.
 *
 * Usage: npx tsx scripts/audit-marque-contacts-non-enrolles.ts
 */
import prisma from "../src/lib/prisma";
import {
  resolveOutreachPipeline,
  type OutreachPipeline,
} from "../src/lib/outreach-bridge";
import { isGenericEmailDomain, emailDomain } from "../src/lib/marque-resolver";

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

type Reason =
  | "en_cycle_client" // lié ou email déjà tracked — exclus du total « non enrôlés »
  | "source_AO"
  | "outreach_excluded"
  | "diffusion_opt_out"
  | "sans_email"
  | "email_invalide"
  | "pipeline_agences"
  | "pipeline_benelux"
  | "partner_connu"
  | "email_deja_cycle_autre_fiche"
  | "pret_non_enrole";

async function main() {
  console.log("Chargement contacts marques…");

  const contacts = await prisma.marqueContact.findMany({
    select: {
      id: true,
      prenom: true,
      nom: true,
      email: true,
      source: true,
      poste: true,
      outreachExcluded: true,
      diffusionOptOut: true,
      emailLookupStatus: true,
      marqueId: true,
      marque: { select: { nom: true } },
      outreachTargets: { select: { id: true, status: true }, take: 1 },
    },
  });

  console.log(`Total contacts fiches: ${contacts.length}`);

  const emails = [
    ...new Set(
      contacts
        .map((c) => c.email?.trim().toLowerCase())
        .filter((e): e is string => Boolean(e))
    ),
  ];

  console.log(`Emails uniques: ${emails.length} — chargement cycles…`);

  const chunk = <T,>(arr: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  const clientByEmail = new Map<string, string>();
  const agencySet = new Set<string>();
  const beneluxSet = new Set<string>();

  for (const batch of chunk(emails, 2000)) {
    const [clients, agencies, benelux] = await Promise.all([
      prisma.outreachTarget.findMany({
        where: { email: { in: batch } },
        select: { email: true, company: true },
      }),
      prisma.agencyOutreachTarget.findMany({
        where: { email: { in: batch } },
        select: { email: true },
      }),
      prisma.beneluxOutreachTarget.findMany({
        where: { email: { in: batch } },
        select: { email: true },
      }),
    ]);
    for (const t of clients) clientByEmail.set(t.email.toLowerCase(), t.company);
    for (const t of agencies) agencySet.add(t.email.toLowerCase());
    for (const t of benelux) beneluxSet.add(t.email.toLowerCase());
  }

  // Partners domains / emails for quick known-agency without N+1 when possible
  const partners = await prisma.partner.findMany({
    select: {
      name: true,
      contactEmail: true,
      agencyContacts: { select: { email: true } },
    },
  });
  const partnerEmails = new Set<string>();
  const partnerDomains = new Set<string>();
  for (const p of partners) {
    if (p.contactEmail) {
      const e = p.contactEmail.trim().toLowerCase();
      partnerEmails.add(e);
      const d = emailDomain(e);
      if (d && !isGenericEmailDomain(d)) partnerDomains.add(d);
    }
    for (const c of p.agencyContacts) {
      if (!c.email) continue;
      const e = c.email.trim().toLowerCase();
      partnerEmails.add(e);
      const d = emailDomain(e);
      if (d && !isGenericEmailDomain(d)) partnerDomains.add(d);
    }
  }

  const isLikelyPartner = (email: string) => {
    if (partnerEmails.has(email)) return true;
    const d = emailDomain(email);
    return Boolean(d && partnerDomains.has(d));
  };

  const counts = new Map<Reason, number>();
  const bump = (r: Reason) => counts.set(r, (counts.get(r) || 0) + 1);

  const samples = new Map<Reason, string[]>();
  const sample = (r: Reason, line: string) => {
    const arr = samples.get(r) || [];
    if (arr.length < 8) {
      arr.push(line);
      samples.set(r, arr);
    }
  };

  // Pour pret_non_enrole : ventilation source
  const pretBySource = new Map<string, number>();
  let nonEnrolles = 0;

  for (const c of contacts) {
    const email = c.email?.trim().toLowerCase() || "";
    const label = `${c.marque.nom} — ${c.prenom || ""} ${c.nom || ""} <${email || "sans email"}> [${c.source || "null"}]`;

    // Lié directement à un target
    if (c.outreachTargets.length > 0) {
      bump("en_cycle_client");
      continue;
    }

    if (c.source === "AO") {
      bump("source_AO");
      nonEnrolles++;
      sample("source_AO", label);
      continue;
    }

    if (c.outreachExcluded) {
      bump("outreach_excluded");
      nonEnrolles++;
      sample("outreach_excluded", label);
      continue;
    }

    if (c.diffusionOptOut) {
      bump("diffusion_opt_out");
      nonEnrolles++;
      sample("diffusion_opt_out", label);
      continue;
    }

    if (!email) {
      bump("sans_email");
      nonEnrolles++;
      sample("sans_email", label);
      continue;
    }

    if (!isValidEmail(email)) {
      bump("email_invalide");
      nonEnrolles++;
      sample("email_invalide", label);
      continue;
    }

    if (clientByEmail.has(email)) {
      // Email déjà en cycle client (autre contact / autre fiche)
      bump("email_deja_cycle_autre_fiche");
      // Ce n'est PAS vraiment « non enrôlé » au niveau email — on le compte
      // à part, hors du total non-enrôlés opérationnels
      sample("email_deja_cycle_autre_fiche", label);
      continue;
    }

    if (agencySet.has(email)) {
      bump("pipeline_agences");
      nonEnrolles++;
      sample("pipeline_agences", label);
      continue;
    }

    if (beneluxSet.has(email)) {
      bump("pipeline_benelux");
      nonEnrolles++;
      sample("pipeline_benelux", label);
      continue;
    }

    if (isLikelyPartner(email)) {
      bump("partner_connu");
      nonEnrolles++;
      sample("partner_connu", label);
      continue;
    }

    bump("pret_non_enrole");
    nonEnrolles++;
    sample("pret_non_enrole", label);
    const src = c.source || (c.poste === "Contact inbound" ? "INBOUND" : "AUTRE");
    pretBySource.set(src, (pretBySource.get(src) || 0) + 1);
  }

  const labels: Record<Reason, string> = {
    en_cycle_client: "Déjà en cycle client (lié à un target)",
    source_AO: "Source AO (jamais enrôlé en outreach)",
    outreach_excluded: "Exclu manuellement de l'outreach",
    diffusion_opt_out: "Opt-out liste de diffusion",
    sans_email: "Sans email",
    email_invalide: "Email invalide",
    pipeline_agences: "Déjà en prospection agences",
    pipeline_benelux: "Déjà en cycle Benelux",
    partner_connu: "Partner / agence connue (Woo…)",
    email_deja_cycle_autre_fiche:
      "Email déjà en cycle client (autre fiche) — pas un trou",
    pret_non_enrole: "Prêt mais non enrôlé (trou réel)",
  };

  console.log("\n========== RÉSUMÉ ==========");
  console.log(`Total contacts fiches marques : ${contacts.length}`);
  console.log(
    `Déjà en cycle client (lié)     : ${counts.get("en_cycle_client") || 0}`
  );
  console.log(
    `Email déjà en cycle (autre)    : ${counts.get("email_deja_cycle_autre_fiche") || 0}`
  );
  console.log(`NON ENRÔLÉS (hors déjà cycle)  : ${nonEnrolles}`);

  console.log("\n--- Ventilation des non enrôlés ---");
  const order: Reason[] = [
    "source_AO",
    "sans_email",
    "email_invalide",
    "outreach_excluded",
    "diffusion_opt_out",
    "pipeline_agences",
    "pipeline_benelux",
    "partner_connu",
    "pret_non_enrole",
  ];
  for (const r of order) {
    const n = counts.get(r) || 0;
    if (!n) continue;
    const pct = ((n / nonEnrolles) * 100).toFixed(1);
    console.log(`\n${labels[r]}: ${n} (${pct}%)`);
    for (const s of samples.get(r) || []) console.log(`  · ${s}`);
  }

  if ((counts.get("pret_non_enrole") || 0) > 0) {
    console.log("\n--- Prêt non enrôlé par source ---");
    [...pretBySource.entries()]
      .sort((a, b) => b[1] - a[1])
      .forEach(([src, n]) => console.log(`  ${src}: ${n}`));
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
