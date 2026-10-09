/**
 * One-shot : relances R1 Maé Brun du 08/10/2026 — copy profil (stats TT/IG)
 * + angles légers par vertical, envoi via executeCastingRelance (bodyOverride).
 *
 * Usage: npx tsx scripts/send-mae-relances-jour.ts
 *        npx tsx scripts/send-mae-relances-jour.ts --dry-run
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });
import { executeCastingRelance } from "../src/lib/casting-auto-send";

const STATS =
  `Sur TikTok, elle tourne autour de <strong>~1,9M de vues en moyenne</strong> par vidéo ` +
  `(peak à <strong>4,4M</strong> en septembre), avec <strong>~904k</strong> abonnés TT ` +
  `et <strong>~152k</strong> sur Instagram.`;

const KIT =
  `Je peux vous renvoyer son media kit tout de suite : ` +
  `<a href="https://app.glowupagence.fr/kit/mae-brun">app.glowupagence.fr/kit/mae-brun</a>.`;

const SIG =
  `<p>Belle journée,<br/><strong>Leyna</strong><br/>Glow Up Agence</p>`;

function r1(opts: {
  brand: string;
  angle: string;
  tutoiement?: boolean;
}): string {
  const vous = !opts.tutoiement;
  const hello = vous
    ? `<p>Bonjour {{contact.firstname}},</p><p>J'espère que vous allez bien 😊</p>`
    : `<p>Hello {{contact.firstname}},</p><p>J'espère que tu vas bien 😊</p>`;
  const interest = vous
    ? `<p>Seriez-vous intéressé·e par une collab avec <strong>Maé</strong>, ou pourriez-vous me dire <strong>quelles seraient vos prochaines campagnes</strong> ?</p>`
    : `<p>Tu serais partant·e pour une collab avec <strong>Maé</strong>, ou tu peux me dire <strong>quelles seraient vos prochaines campagnes</strong> ?</p>`;
  const kitLine = vous
    ? `<p>${KIT}</p>`
    : `<p>Je peux te renvoyer son media kit tout de suite : <a href="https://app.glowupagence.fr/kit/mae-brun">app.glowupagence.fr/kit/mae-brun</a>.</p>`;

  return [
    hello,
    `<p>Je reviens vers ${vous ? "vous" : "toi"} au sujet de la collaboration entre <strong>Maé Brun</strong> et <strong>${opts.brand}</strong> — ${opts.angle}</p>`,
    `<p>${STATS}</p>`,
    kitLine,
    interest,
    SIG,
  ].join("");
}

/** Ordre = échéance Paris du jour (BANG BANG → Cdiscount). */
const RELANCES: Array<{ id: string; brand: string; body: string }> = [
  {
    id: "cmuqwdqm0000yvg06ynedwxag",
    brand: "BANG BANG Cosmetics",
    body: r1({
      brand: "BANG BANG Cosmetics",
      angle:
        "un profil beauty/lifestyle ultra GRWM, parfait pour faire vivre vos gloss et looks festifs avec un contenu natif et ultra-performant.",
    }),
  },
  {
    id: "cmtu8qf0o0010jm04c7xf2a43",
    brand: "Juliette has a gun",
    body: r1({
      brand: "Juliette has a gun",
      angle:
        "elle incarne parfaitement le sillage du quotidien : conseils signature, routines parfumées et formats TikTok qui cartonnent auprès d'une audience 18–34.",
    }),
  },
  {
    id: "cmuuyfdmt0004o506ywim0f8p",
    brand: "Kiehl's",
    body: r1({
      brand: "Kiehl's",
      angle:
        "routines skincare authentiques, conseils concrets et un univers lifestyle qui colle à votre ADN care.",
    }),
  },
  {
    id: "cmtx0hzwp0008gm0a41pi26kx",
    brand: "Nocibé",
    body: r1({
      brand: "Nocibé",
      angle:
        "idéale pour une activation Noël in-store / TikTok : découverte produit, haul et ambiance shopping qui convertit.",
    }),
  },
  {
    id: "cmtwx6bab0008k10465yh4qz4",
    brand: "Nyx",
    body: r1({
      brand: "Nyx",
      angle:
        "parfaite pour un tuto makeup Halloween & look 31 octobre — créative, fun, et ultra-vireale sur TikTok.",
    }),
  },
  {
    id: "cmtu8lnd20009jm04djin0ipy",
    brand: "Ilia",
    body: r1({
      brand: "Ilia",
      angle:
        "clean beauty, teint naturel et conseils routine : un fit très naturel avec votre positionnement.",
    }),
  },
  {
    id: "cmtu8nrqb000ojv04pyzrgr2r",
    brand: "Glossier",
    body: r1({
      brand: "Glossier",
      angle:
        "la touche « effortless » au quotidien — GRWM, conseils beauté et un style qui parle vraiment à votre communauté.",
    }),
  },
  {
    id: "cmtqzb7ee0003l704v3a464r1",
    brand: "Kayali",
    body: r1({
      brand: "Kayali",
      tutoiement: true,
      angle:
        "elle est fan de vos fragrances : nouveauté olfactive, sélection de Noël et contenus ultra-sensoriels qui matchent parfaitement avec son audience.",
    }),
  },
  {
    id: "cmuqsboa5002jl2043hsypb1p",
    brand: "Quitoque",
    body: r1({
      brand: "Quitoque",
      angle:
        "ses formats recettes / « Lunch in my city » et colocs performent particulièrement bien — un angle cuisine du quotidien très engageant.",
    }),
  },
  {
    id: "cmuqwjwuk0005l504jxlyxaz5",
    brand: "Delonghi",
    body: r1({
      brand: "Delonghi",
      angle:
        "recettes réconfortantes automne-hiver et moments café/cuisine en lifestyle : un terrain de jeu idéal pour du contenu TikTok natif.",
    }),
  },
  {
    id: "cmuuz4s0s0003jy047amuay72",
    brand: "Xiaomi",
    body: r1({
      brand: "Xiaomi",
      angle:
        "tech intégrée au quotidien (unboxing, anecdotes perso, lifestyle) — ses contenus tech/lifestyle passent déjà très fort sur TikTok.",
    }),
  },
  {
    id: "cmuqsahqb000dk606rtrvx946",
    brand: "HelloFresh",
    body: r1({
      brand: "HelloFresh",
      angle:
        "recettes faciles, colocs et vlogs lifestyle : un format qui colle parfaitement à une activation box repas.",
    }),
  },
  {
    id: "cmuuyrkcq000rrs06jcg2j7aa",
    brand: "Naturactive",
    body: r1({
      brand: "Naturactive",
      angle:
        "approche care / bien-être accessible, routines authentiques et une audience féminine 18–34 très engagée.",
    }),
  },
  {
    id: "cmuqwld4f000fjn04owhxphlt",
    brand: "Acqua Di Parma",
    body: r1({
      brand: "Acqua Di Parma",
      angle:
        "autour de Cedro Virtuoso : un univers olfactif premium porté avec légèreté, dans des formats TikTok ultra-visuels.",
    }),
  },
  {
    id: "cmtu8peeq000zl104btb4hqmv",
    brand: "Sephora",
    body: r1({
      brand: "Sephora",
      angle:
        "autour de l'arrivée de Rhode : GRWM, hauls et discovery beauty — exactement le type de contenus où Maé excelle.",
    }),
  },
  {
    id: "cmuv82dbn0001lc067g1xx3la",
    brand: "Blissim",
    body: r1({
      brand: "Blissim",
      angle:
        "unboxing / box d'octobre, découverte produits et réactions sincères : un format box qui cartonne sur son TikTok.",
    }),
  },
  {
    id: "cmuv8cpcw0001oy06k3p6ihsj",
    brand: "The bradery",
    body: r1({
      brand: "The Bradery",
      angle:
        "shopping, fashion & lifestyle girly — idéale pour faire vivre vos sélections et temps forts retail.",
    }),
  },
  {
    id: "cmuqwd8iv000uvg06a75cszrp",
    brand: "Makeup By Mario",
    body: r1({
      brand: "Makeup By Mario",
      angle:
        "makeup créatif, looks signature et tutoriels qui matchent parfaitement avec une audience beauty ultra-engagée.",
    }),
  },
  {
    id: "cmuv8d90k005el504vnkgqb40",
    brand: "Mixa",
    body: r1({
      brand: "Mixa",
      angle:
        "autour de la nouvelle crème anti-taches : conseil skincare accessible, démonstration produit et preuve sociale forte.",
    }),
  },
  {
    id: "cmuqw88sm000avg06qleav49p",
    brand: "KIKO Milano",
    body: r1({
      brand: "KIKO Milano",
      angle:
        "autour de Club K : makeup accessible, looks tendance et contenus TikTok pensés pour générer de l'envie d'achat.",
    }),
  },
  {
    id: "cmuvdkr1q000hl8043q1qa6yc",
    brand: "Cdiscount",
    body: r1({
      brand: "Cdiscount",
      angle:
        "pour les Jours de Prime : lifestyle shopping, bons plans et contenus qui poussent naturellement à l'acte d'achat.",
    }),
  },
];

function toPlain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`\n=== Relances Maé R1 — ${RELANCES.length} missions ${dryRun ? "(DRY-RUN)" : "(ENVOI)"} ===\n`);

  for (const r of RELANCES) {
    console.log(`\n----- ${r.brand} (${r.id}) -----\n`);
    console.log(toPlain(r.body));
  }

  if (dryRun) {
    console.log("\n[dry-run] aucun envoi.\n");
    return;
  }

  const results: Array<{
    brand: string;
    id: string;
    succeeded: number;
    failed: number;
    skippedReplied: number;
    skippedBounced: number;
    errors: string[];
    error?: string;
  }> = [];

  for (const r of RELANCES) {
    process.stdout.write(`\n→ Envoi ${r.brand}... `);
    try {
      const outcome = await executeCastingRelance(r.id, {
        bodyOverride: r.body,
        round: 1,
      });
      results.push({ brand: r.brand, id: r.id, ...outcome });
      console.log(
        `ok=${outcome.succeeded} fail=${outcome.failed} replied=${outcome.skippedReplied} bounce=${outcome.skippedBounced}` +
          (outcome.errors.length ? ` errors=${outcome.errors.join(" | ")}` : "")
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({
        brand: r.brand,
        id: r.id,
        succeeded: 0,
        failed: 0,
        skippedReplied: 0,
        skippedBounced: 0,
        errors: [],
        error: msg,
      });
      console.log(`ERROR: ${msg}`);
    }
  }

  console.log("\n\n=== BILAN ===\n");
  const totalOk = results.reduce((s, x) => s + x.succeeded, 0);
  const totalFail = results.reduce((s, x) => s + x.failed, 0);
  const totalReplied = results.reduce((s, x) => s + x.skippedReplied, 0);
  const totalBounce = results.reduce((s, x) => s + x.skippedBounced, 0);
  const hardErrors = results.filter((x) => x.error);
  console.log(
    JSON.stringify(
      {
        missions: results.length,
        totalOk,
        totalFail,
        totalReplied,
        totalBounce,
        hardErrors: hardErrors.map((x) => ({ brand: x.brand, error: x.error })),
        perBrand: results.map((x) => ({
          brand: x.brand,
          ok: x.succeeded,
          fail: x.failed,
          replied: x.skippedReplied,
          bounce: x.skippedBounced,
          errors: x.errors,
          error: x.error,
        })),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
