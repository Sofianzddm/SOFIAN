import prisma from "@/lib/prisma";
import OpenAI from "openai";

/**
 * Génère une phrase de pitch IA pour un talent d'une marque et la sauvegarde dans PressKitTalent.pitch.
 * Utilisé par POST /api/presskit/generate-pitch et POST /api/presskit/generate-all-pitches.
 */
export async function generateAndSavePitch(
  brandId: string,
  talentId: string,
  apiKey: string
): Promise<string> {
  const [talent, brand, pressKitTalent] = await Promise.all([
    prisma.talent.findUnique({
      where: { id: talentId },
      include: { stats: true },
    }),
    prisma.brand.findUnique({
      where: { id: brandId },
    }),
    prisma.pressKitTalent.findUnique({
      where: {
        brandId_talentId: { brandId, talentId },
      },
    }),
  ]);

  if (!talent || !brand || !pressKitTalent) {
    throw new Error("Talent, marque ou association press kit introuvable");
  }

  const igFollowers = Number(talent.stats?.igFollowers ?? 0);
  const ttFollowers = Number(talent.stats?.ttFollowers ?? 0);
  const niche =
    talent.niches && talent.niches.length > 0
      ? talent.niches.join(", ")
      : "Influence";

  const prompt = `Tu es un expert en influence marketing pour l'agence Glow Up.

Génère UNE phrase de pitch (une seule phrase, ~12 à 15 mots) expliquant pourquoi ce créateur est pertinent pour cette marque.

La phrase doit :
- Être spécifique (mentionner la niche, un élément concret du créateur)
- Expliquer le match créateur/marque en tenant compte du type de produits, de la cible et de l'univers de la marque
- Donner envie à la marque de vouloir en savoir plus
- Être en français, ton pro mais pas corporate
- NE PAS commencer par "Ce créateur" ou "Ce talent"
- NE PAS commencer par "Avec" (éviter les formulations du type "Avec X, vous pouvez…")
- NE PAS parler du mode de vie ou des valeurs de la marque (éthique, éco‑responsable, etc.) : concentre‑toi sur le créateur et son audience
- NE PAS mentionner le nom de la marque dans la phrase (pas de nom de marque explicite)
- Préférer les expressions "créateur de contenu" ou "créatrice de contenu" plutôt que "influenceur" / "influenceuse"

Créateur : ${talent.prenom} ${talent.nom}
Niche : ${niche}
Abonnés Instagram : ${igFollowers}
Abonnés TikTok : ${ttFollowers}
Bio : ${talent.bio || "—"}

Contexte marque :
Nom : ${brand.name}
Description : ${brand.description || "—"}`;

  const openai = new OpenAI({ apiKey });

  let pitch: string;
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 75,
      temperature: 0.7,
    });

    pitch =
      completion.choices?.[0]?.message?.content?.trim() || "";
  } catch (error) {
    console.error("❌ Erreur OpenAI generateAndSavePitch, fallback local utilisé:", error);
    // Fallback local simple pour garantir qu'on a toujours quelque chose
    const parts: string[] = [];
    if (igFollowers > 0) {
      parts.push(`${igFollowers.toLocaleString("fr-FR")} abonnés Instagram`);
    }
    if (ttFollowers > 0) {
      parts.push(`${ttFollowers.toLocaleString("fr-FR")} abonnés TikTok`);
    }
    const base = parts.join(" · ");
    pitch = base
      ? `Créateur de contenu ${niche.toLowerCase()}, ${base}, audience réactive.`.slice(0, 140)
      : `Créateur de contenu ${niche.toLowerCase()}, audience engagée.`.slice(0, 140);
  }

  if (!pitch) {
    pitch = "Créateur de contenu avec une audience engagée et pertinente pour vos campagnes.";
  }

  await prisma.pressKitTalent.update({
    where: { id: pressKitTalent.id },
    data: { pitch },
  });

  return pitch;
}
