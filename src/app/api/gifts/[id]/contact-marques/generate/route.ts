import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildGiftContactDraft } from "@/lib/gifts/contact-marque-draft";
import { researchAndDraftGiftMarque } from "@/lib/gifts/contact-marque-ai";
import { normalizeContactLanguage } from "@/lib/gifts/contact-language";
import { canContactGiftMarques } from "@/lib/gifts/gift-roles";

export const maxDuration = 300;

type PrenomByMarque = Record<string, string>;

// POST — research marque (web+X) + rédaction perso (1 mail / marque), tutoiement, sans Leyna
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    const user = session.user as { id: string; role: string };
    if (!canContactGiftMarques(user.role)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    if (!process.env.XAI_API_KEY?.trim()) {
      return NextResponse.json(
        { error: "Clé XAI_API_KEY non configurée sur le serveur." },
        { status: 500 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      marqueIds?: string[];
      /** Prénom contact par marqueId (pour personnaliser l'accroche). */
      prenomsByMarque?: PrenomByMarque;
      /** Langue fiche contact par marqueId (fr|en). */
      languagesByMarque?: Record<string, string>;
      contactPrenoms?: string[];
    };
    const marqueIds = Array.isArray(body.marqueIds)
      ? body.marqueIds.map((x) => String(x).trim()).filter(Boolean)
      : [];
    const prenomsByMarque: PrenomByMarque =
      body.prenomsByMarque && typeof body.prenomsByMarque === "object"
        ? body.prenomsByMarque
        : {};
    const languagesByMarque =
      body.languagesByMarque && typeof body.languagesByMarque === "object"
        ? body.languagesByMarque
        : {};

    const demande = await prisma.demandeGift.findUnique({
      where: { id },
      include: {
        talent: {
          select: {
            prenom: true,
            nom: true,
            bio: true,
            presentation: true,
            instagram: true,
            tiktok: true,
            niches: true,
            selectedClients: true,
            ville: true,
          },
        },
        accountManager: { select: { prenom: true, nom: true } },
        marques: {
          select: {
            marqueId: true,
            marque: {
              select: {
                id: true,
                nom: true,
                secteur: true,
                siteWeb: true,
                notes: true,
              },
            },
          },
        },
        marque: {
          select: {
            id: true,
            nom: true,
            secteur: true,
            siteWeb: true,
            notes: true,
          },
        },
      },
    });
    if (!demande) {
      return NextResponse.json({ error: "Demande non trouvée" }, { status: 404 });
    }

    const allMarques = [
      ...demande.marques.map((r) => r.marque),
      ...(demande.marque &&
      !demande.marques.some((r) => r.marqueId === demande.marque!.id)
        ? [demande.marque]
        : []),
    ];
    const selected =
      marqueIds.length > 0
        ? allMarques.filter((m) => marqueIds.includes(m.id))
        : allMarques;

    if (selected.length === 0) {
      return NextResponse.json(
        { error: "Aucune marque sélectionnée." },
        { status: 400 }
      );
    }

    // 1 marque / requête (le wizard enchaîne côté client + barre de progression)
    // pour rester sous le timeout serverless (research + draft).
    const targets = selected.slice(0, 1);
    const talent = demande.talent || {};

    const results = await Promise.all(
      targets.map(async (marque) => {
        try {
          const language = normalizeContactLanguage(
            languagesByMarque[marque.id]
          );
          const draft = await researchAndDraftGiftMarque({
            gift: demande,
            marque,
            talent,
            contactPrenom:
              prenomsByMarque[marque.id] ||
              (body.contactPrenoms && body.contactPrenoms[0]) ||
              null,
            language,
          });
          return { ...draft, ai: true as const, error: null as string | null };
        } catch (err) {
          console.error(`[gift-generate] ${marque.nom}:`, err);
          // Fallback ancré concept — PAS le template vouvoiement générique
          const fb = buildGiftContactDraft(demande);
          const prenom =
            prenomsByMarque[marque.id] ||
            (body.contactPrenoms && body.contactPrenoms[0]) ||
            "";
          const language = normalizeContactLanguage(
            languagesByMarque[marque.id]
          );
          const isEn = language === "en";
          const concept = (demande.description || "").trim();
          const emergencyBody = isEn
            ? [
                prenom ? `Hello ${prenom},` : "Hello,",
                "",
                `I'm reaching out from Glow Up about a gift proposal for ${fb.talentName}.`,
                "",
                concept
                  ? `Context: ${concept.slice(0, 700)}`
                  : `We'd love to explore a gift partnership (${fb.typeGiftLabel}) with ${marque.nom}.`,
                "",
                `The idea would be to anchor this in ${marque.nom}'s world. Would you be open to discussing it?`,
              ].join("\n\n")
            : [
                prenom ? `Bonjour ${prenom},` : "Bonjour,",
                "",
                `Je te contacte de la part de Glow Up au sujet d'une proposition de gift pour ${fb.talentName}.`,
                "",
                concept
                  ? `Contexte : ${concept.slice(0, 700)}`
                  : `On aimerait proposer un partenariat gift (${fb.typeGiftLabel}) avec ${marque.nom}.`,
                "",
                `L'idée serait d'ancrer ça dans l'univers de ${marque.nom}. Est-ce que tu serais dispo pour en discuter ?`,
              ].join("\n\n");
          return {
            marqueId: marque.id,
            marqueNom: marque.nom,
            subject: isEn
              ? `${fb.talentName} × ${marque.nom} — gift proposal`
              : `${fb.talentName} × ${marque.nom} — proposition gift`,
            bodyText: emergencyBody,
            language,
            brandResearch: null,
            ai: false as const,
            // Pas d'error affichée : body de secours déjà utilisable
            error: null as string | null,
          };
        }
      })
    );

    // Persiste chaque brouillon pour survivre à la fermeture du wizard
    const now = new Date();
    await Promise.all(
      results.map(async (r) => {
        const subject = (r.subject || "").trim();
        const bodyText = (r.bodyText || "").trim();
        if (!subject || !bodyText || !r.marqueId) return;
        await prisma.demandeGiftMarque.upsert({
          where: {
            demandeGiftId_marqueId: {
              demandeGiftId: id,
              marqueId: r.marqueId,
            },
          },
          create: {
            demandeGiftId: id,
            marqueId: r.marqueId,
            draftSubject: subject,
            draftBodyText: bodyText,
            draftUpdatedAt: now,
          },
          update: {
            draftSubject: subject,
            draftBodyText: bodyText,
            draftUpdatedAt: now,
          },
        });
      })
    );

    const primary = results[0];
    return NextResponse.json({
      subject: primary?.subject || "",
      bodyText: primary?.bodyText || "",
      ai: results.some((r) => r.ai),
      drafts: results.map((r) => ({
        marqueId: r.marqueId,
        marqueNom: r.marqueNom,
        subject: r.subject,
        bodyText: r.bodyText,
        language: "language" in r ? r.language : "fr",
        ai: r.ai,
        error: r.error,
      })),
      truncated: selected.length > targets.length,
      saved: true,
    });
  } catch (error) {
    console.error("POST /api/gifts/[id]/contact-marques/generate:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
