import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET - Détail d'un talent
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { id } = await params;
    const talent = await prisma.talent.findUnique({
      where: { id },
      include: {
        stats: true,
        tarifs: true,
        manager: {
          select: {
            id: true,
            prenom: true,
            nom: true,
            email: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            actif: true,
          },
        },
        collaborations: {
          include: {
            marque: {
              select: { id: true, nom: true },
            },
            livrables: true,
          },
          orderBy: { createdAt: "desc" },
        },
        negociations: {
          include: {
            marque: {
              select: { id: true, nom: true },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        demandesGift: {
          include: {
            tm: {
              select: {
                id: true,
                prenom: true,
                nom: true,
              },
            },
            accountManager: {
              select: {
                id: true,
                prenom: true,
                nom: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!talent) {
      return NextResponse.json({ error: "Talent non trouvé" }, { status: 404 });
    }

    return NextResponse.json(talent);
  } catch (error) {
    console.error("Erreur GET talent:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// PUT - Mettre à jour un talent
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const userRole = session.user.role;
    
    // Vérifier les permissions
    if (!["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE", "TM"].includes(userRole)) {
      return NextResponse.json({ 
        error: "Permissions insuffisantes" 
      }, { status: 403 });
    }

    const { id } = await params;
    const data = await request.json();

    // Séparer les champs Talent des champs TalentStats
    const talentData: any = {};
    const rawStatsData: any = {};
    
    // ========== CHAMPS TALENT ==========
    if (data.prenom !== undefined) talentData.prenom = data.prenom;
    if (data.nom !== undefined) talentData.nom = data.nom;
    if (data.email !== undefined) talentData.email = data.email;
    if (data.telephone !== undefined) talentData.telephone = data.telephone || null;
    if (data.ville !== undefined) talentData.ville = data.ville || null;
    if (data.photo !== undefined) talentData.photo = data.photo || null;
    if (data.presentation !== undefined) talentData.presentation = data.presentation || null;
    if (data.presentationEn !== undefined) talentData.presentationEn = data.presentationEn || null;
    if (data.instagram !== undefined) talentData.instagram = data.instagram || null;
    if (data.tiktok !== undefined) talentData.tiktok = data.tiktok || null;
    if (data.youtube !== undefined) talentData.youtube = data.youtube || null;
    if (data.niches !== undefined) talentData.niches = data.niches;
    if (data.selectedClients !== undefined) talentData.selectedClients = data.selectedClients;
    if (data.bio !== undefined) talentData.bio = data.bio || null;
    if (data.adresse !== undefined) talentData.adresse = data.adresse || null;
    if (data.codePostal !== undefined) talentData.codePostal = data.codePostal || null;
    if (data.pays !== undefined) talentData.pays = data.pays || null;
    if (data.siret !== undefined) talentData.siret = data.siret || null;
    if (data.iban !== undefined) talentData.iban = data.iban || null;
    if (data.bic !== undefined) talentData.bic = data.bic || null;
    if (data.titulaireCompte !== undefined) talentData.titulaireCompte = data.titulaireCompte || null;
    if (data.dateNaissance !== undefined) talentData.dateNaissance = data.dateNaissance ? new Date(data.dateNaissance) : null;
    if (data.dateArrivee !== undefined) talentData.dateArrivee = data.dateArrivee ? new Date(data.dateArrivee) : null;
    
    // Commissions (nombres)
    if (data.commissionInbound !== undefined) {
      talentData.commissionInbound = data.commissionInbound ? parseFloat(data.commissionInbound) : 20;
    }
    if (data.commissionOutbound !== undefined) {
      talentData.commissionOutbound = data.commissionOutbound ? parseFloat(data.commissionOutbound) : 30;
    }
    
    // ========== CHAMPS TALENTSTATS (raw) ==========
    // Instagram
    if (data.igFollowers !== undefined) rawStatsData.igFollowers = data.igFollowers;
    if (data.igFollowersEvol !== undefined) rawStatsData.igFollowersEvol = data.igFollowersEvol;
    if (data.igEngagement !== undefined) rawStatsData.igEngagement = data.igEngagement;
    if (data.igEngagementEvol !== undefined) rawStatsData.igEngagementEvol = data.igEngagementEvol;
    if (data.igGenreFemme !== undefined) rawStatsData.igGenreFemme = data.igGenreFemme;
    if (data.igGenreHomme !== undefined) rawStatsData.igGenreHomme = data.igGenreHomme;
    if (data.igAge13_17 !== undefined) rawStatsData.igAge13_17 = data.igAge13_17;
    if (data.igAge18_24 !== undefined) rawStatsData.igAge18_24 = data.igAge18_24;
    if (data.igAge25_34 !== undefined) rawStatsData.igAge25_34 = data.igAge25_34;
    if (data.igAge35_44 !== undefined) rawStatsData.igAge35_44 = data.igAge35_44;
    if (data.igAge45Plus !== undefined) rawStatsData.igAge45Plus = data.igAge45Plus;
    if (data.igLocFrance !== undefined) rawStatsData.igLocFrance = data.igLocFrance;
    if (data.igLocAutre !== undefined) rawStatsData.igLocAutre = data.igLocAutre;
    
    // TikTok
    if (data.ttFollowers !== undefined) rawStatsData.ttFollowers = data.ttFollowers;
    if (data.ttFollowersEvol !== undefined) rawStatsData.ttFollowersEvol = data.ttFollowersEvol;
    if (data.ttEngagement !== undefined) rawStatsData.ttEngagement = data.ttEngagement;
    if (data.ttEngagementEvol !== undefined) rawStatsData.ttEngagementEvol = data.ttEngagementEvol;
    if (data.ttGenreFemme !== undefined) rawStatsData.ttGenreFemme = data.ttGenreFemme;
    if (data.ttGenreHomme !== undefined) rawStatsData.ttGenreHomme = data.ttGenreHomme;
    if (data.ttAge13_17 !== undefined) rawStatsData.ttAge13_17 = data.ttAge13_17;
    if (data.ttAge18_24 !== undefined) rawStatsData.ttAge18_24 = data.ttAge18_24;
    if (data.ttAge25_34 !== undefined) rawStatsData.ttAge25_34 = data.ttAge25_34;
    if (data.ttAge35_44 !== undefined) rawStatsData.ttAge35_44 = data.ttAge35_44;
    if (data.ttAge45Plus !== undefined) rawStatsData.ttAge45Plus = data.ttAge45Plus;
    if (data.ttLocFrance !== undefined) rawStatsData.ttLocFrance = data.ttLocFrance;
    if (data.ttLocAutre !== undefined) rawStatsData.ttLocAutre = data.ttLocAutre;
    
    // YouTube
    if (data.ytAbonnes !== undefined) rawStatsData.ytAbonnes = data.ytAbonnes;
    if (data.ytAbonnesEvol !== undefined) rawStatsData.ytAbonnesEvol = data.ytAbonnesEvol;

    // ========== PARSER LES STATS ==========
    // Convertir en nombres avec les bons types (Int ou Decimal)
    // "" devient null, sinon parseInt/parseFloat
    const parsedStatsData: any = {};
    
    // Int fields (parseInt)
    const intFields = ['igFollowers', 'ttFollowers', 'ytAbonnes'];
    intFields.forEach(field => {
      if (field in rawStatsData) {
        const val = rawStatsData[field];
        parsedStatsData[field] = (val === "" || val === null || val === undefined) ? null : parseInt(val);
      }
    });
    
    // Decimal fields (parseFloat)
    const decimalFields = [
      'igFollowersEvol', 'igEngagement', 'igEngagementEvol',
      'igGenreFemme', 'igGenreHomme',
      'igAge13_17', 'igAge18_24', 'igAge25_34', 'igAge35_44', 'igAge45Plus',
      'igLocFrance',
      'ttFollowersEvol', 'ttEngagement', 'ttEngagementEvol',
      'ttGenreFemme', 'ttGenreHomme',
      'ttAge13_17', 'ttAge18_24', 'ttAge25_34', 'ttAge35_44', 'ttAge45Plus',
      'ttLocFrance',
      'ytAbonnesEvol'
    ];
    decimalFields.forEach(field => {
      if (field in rawStatsData) {
        const val = rawStatsData[field];
        parsedStatsData[field] = (val === "" || val === null || val === undefined) ? null : parseFloat(val);
      }
    });
    
    // String fields
    if ('igLocAutre' in rawStatsData) parsedStatsData.igLocAutre = rawStatsData.igLocAutre || null;
    if ('ttLocAutre' in rawStatsData) parsedStatsData.ttLocAutre = rawStatsData.ttLocAutre || null;

    // Si des stats sont fournies, inclure l'upsert
    if (Object.keys(parsedStatsData).length > 0) {
      talentData.stats = {
        upsert: {
          create: parsedStatsData,
          update: parsedStatsData,
        },
      };
    }

    // Liaison compte utilisateur (rôle TALENT) ↔ fiche Talent : 1 user = 1 talent max
    if (data.userId !== undefined) {
      const newUserId = data.userId === "" || data.userId == null ? null : data.userId;
      talentData.userId = newUserId;
      if (newUserId) {
        await prisma.talent.updateMany({
          where: { userId: newUserId, id: { not: id } },
          data: { userId: null },
        });
      }
    }

    const talent = await prisma.talent.update({
      where: { id },
      data: talentData,
      include: {
        stats: true,
        tarifs: true,
        manager: {
          select: {
            id: true,
            prenom: true,
            nom: true,
            email: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            actif: true,
          },
        },
        collaborations: {
          include: {
            marque: {
              select: { id: true, nom: true },
            },
            livrables: true,
          },
          orderBy: { createdAt: "desc" },
        },
        negociations: {
          include: {
            marque: {
              select: { id: true, nom: true },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        demandesGift: {
          include: {
            tm: {
              select: {
                id: true,
                prenom: true,
                nom: true,
              },
            },
            accountManager: {
              select: {
                id: true,
                prenom: true,
                nom: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    return NextResponse.json(talent);
  } catch (error) {
    console.error("Erreur PUT talent:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE - Supprimer un talent
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const userRole = session.user.role;
    
    // Seuls les ADMIN peuvent supprimer un talent
    if (userRole !== "ADMIN") {
      return NextResponse.json({ 
        error: "Seuls les administrateurs peuvent supprimer un talent" 
      }, { status: 403 });
    }

    const { id } = await params;
    
    // Vérifier si le talent a des collaborations
    const collabCount = await prisma.collaboration.count({
      where: { talentId: id },
    });

    if (collabCount > 0) {
      return NextResponse.json({ 
        error: `Impossible de supprimer ce talent car il a ${collabCount} collaboration(s) associée(s)` 
      }, { status: 400 });
    }

    await prisma.talent.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Talent supprimé avec succès" });
  } catch (error) {
    console.error("Erreur DELETE talent:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
