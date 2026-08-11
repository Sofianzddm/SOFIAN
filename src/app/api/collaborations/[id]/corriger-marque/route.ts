import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import prisma from "@/lib/prisma";
import { findOrCreateMarque, marqueSlug } from "@/lib/marque-resolver";
import { normalizeLabel } from "@/lib/nom-campagne-gate-paths";
import {
  countPendingNomCampagne,
  NOM_MARQUE_LOCK_COOKIE,
} from "@/lib/nom-campagne-gate";
import { NOM_CAMPAGNE_GATE_ROLES } from "@/lib/nom-campagne-gate-paths";

/**
 * Cloisonnement pôle Sales : créateur, AM assigné, ADMIN.
 */
function canAccessPrivateCollab(
  collab: {
    isPrivate: boolean;
    createdById: string | null;
    accountManagerId?: string | null;
  },
  user: { id: string; role?: string }
): boolean {
  if (!collab.isPrivate) return true;
  if (user.role === "ADMIN") return true;
  if (collab.createdById && collab.createdById === user.id) return true;
  if (collab.accountManagerId && collab.accountManagerId === user.id) return true;
  return false;
}

function withLockCookie(
  res: NextResponse,
  role: string,
  userId: string
): Promise<NextResponse> {
  return (async () => {
    if (
      !NOM_CAMPAGNE_GATE_ROLES.includes(
        role as (typeof NOM_CAMPAGNE_GATE_ROLES)[number]
      )
    ) {
      return res;
    }
    const pending = await countPendingNomCampagne({ id: userId, role });
    const locked = pending > 0;
    if (locked) {
      res.cookies.set(NOM_MARQUE_LOCK_COOKIE, "1", {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    } else {
      res.cookies.set(NOM_MARQUE_LOCK_COOKIE, "", {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });
    }
    return res;
  })();
}

/**
 * POST — Corriger le nom commercial de la marque d'une collab (rattrapage).
 * Le talent voit `marque.nom` : on re-pointe vers la bonne fiche (ou on
 * renomme si la fiche n'est utilisée que par cette collab).
 * Garantit toujours que la collab finit avec un `marque.nom` = nom saisi.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const role = session.user.role || "";
    const allowed = ["ADMIN", "TM", "HEAD_OF", "HEAD_OF_INFLUENCE", "HEAD_OF_SALES"];
    if (!allowed.includes(role)) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const nomMarque = String(body?.nomMarque || "").trim();
    const nomMarqueConfirm = String(body?.nomMarqueConfirm || "").trim();
    if (!nomMarque) {
      return NextResponse.json(
        { message: "Nom de la marque obligatoire." },
        { status: 400 }
      );
    }
    if (!nomMarqueConfirm) {
      return NextResponse.json(
        { message: "Confirmez le nom de la marque (saisie en double)." },
        { status: 400 }
      );
    }
    if (normalizeLabel(nomMarque) !== normalizeLabel(nomMarqueConfirm)) {
      return NextResponse.json(
        {
          message:
            "Les deux saisies du nom de marque ne correspondent pas.",
        },
        { status: 400 }
      );
    }

    const collab = await prisma.collaboration.findUnique({
      where: { id },
      select: {
        id: true,
        isPrivate: true,
        createdById: true,
        accountManagerId: true,
        marqueId: true,
        contactKind: true,
        contactAgence: true,
        marque: {
          select: {
            id: true,
            nom: true,
            raisonSociale: true,
            adresseRue: true,
            adresseComplement: true,
            codePostal: true,
            ville: true,
            pays: true,
            siret: true,
            numeroTVA: true,
            devise: true,
          },
        },
        negociation: {
          select: { contactKind: true, contactAgence: true },
        },
      },
    });

    if (!collab) {
      return NextResponse.json({ message: "Non trouvée" }, { status: 404 });
    }
    if (
      !canAccessPrivateCollab(collab, {
        id: session.user.id,
        role: session.user.role,
      })
    ) {
      return NextResponse.json({ message: "Non trouvée" }, { status: 404 });
    }

    // TM : ne peut corriger que les collabs non privées de son portefeuille.
    if (role === "TM" && collab.isPrivate) {
      return NextResponse.json({ message: "Non trouvée" }, { status: 404 });
    }
    // HoS : uniquement ses propres collabs.
    if (role === "HEAD_OF_SALES" && collab.createdById !== session.user.id) {
      return NextResponse.json({ message: "Non trouvée" }, { status: 404 });
    }

    const contactAgence = (
      collab.contactAgence ||
      collab.negociation?.contactAgence ||
      ""
    ).trim();
    const contactKind = (
      collab.contactKind ||
      collab.negociation?.contactKind ||
      ""
    )
      .trim()
      .toUpperCase();

    if (
      contactKind === "AGENCE" &&
      contactAgence &&
      normalizeLabel(nomMarque) === normalizeLabel(contactAgence)
    ) {
      return NextResponse.json(
        {
          message:
            "Le nom de la marque doit être différent du nom de l'agence.",
        },
        { status: 400 }
      );
    }

    // Nom déjà correct : on marque quand même comme vérifié (resaisie confirmée).
    if (normalizeLabel(nomMarque) === normalizeLabel(collab.marque.nom)) {
      await prisma.collaboration.update({
        where: { id },
        data: { nomMarqueVerifieAt: new Date() },
      });
      const res = NextResponse.json({
        ok: true,
        mode: "verified",
        marque: { id: collab.marque.id, nom: collab.marque.nom },
      });
      return withLockCookie(res, role, session.user.id);
    }

    const billingDefaults = {
      raisonSociale: collab.marque.raisonSociale || null,
      adresseRue: collab.marque.adresseRue || null,
      adresseComplement: collab.marque.adresseComplement || null,
      codePostal: collab.marque.codePostal || null,
      ville: collab.marque.ville || null,
      pays: collab.marque.pays || null,
      siret: collab.marque.siret || null,
      numeroTVA: collab.marque.numeroTVA || null,
      devise: collab.marque.devise || undefined,
    };

    const [otherCollabs, otherNegos] = await Promise.all([
      prisma.collaboration.count({
        where: { marqueId: collab.marqueId, id: { not: id } },
      }),
      prisma.negociation.count({
        where: {
          marqueId: collab.marqueId,
          OR: [{ collaborationId: null }, { collaborationId: { not: id } }],
        },
      }),
    ]);
    const exclusive = otherCollabs === 0 && otherNegos === 0;

    // Fiche mono-usage : renommer directement (garantit le nom affiché).
    if (exclusive) {
      const updated = await prisma.marque.update({
        where: { id: collab.marqueId },
        data: { nom: nomMarque },
        select: { id: true, nom: true },
      });
      await prisma.collaboration.update({
        where: { id },
        data: { nomMarqueVerifieAt: new Date() },
      });
      const res = NextResponse.json({
        ok: true,
        mode: "rename",
        marque: updated,
      });
      return withLockCookie(res, role, session.user.id);
    }

    // Fiche partagée : rattacher à une fiche au bon nom commercial.
    const resolved = await findOrCreateMarque({
      name: nomMarque,
      source: "MANUAL",
      createDefaults: billingDefaults,
    });

    let targetMarqueId = resolved.marqueId;

    if (targetMarqueId === collab.marqueId) {
      // Alias/slug pointe vers la même fiche mais le nom affiché est faux
      // (ex. nom = agence). On crée une fiche dédiée pour cette collab.
      const baseSlug = marqueSlug(nomMarque) || "marque";
      let slug = `${baseSlug}-${id.slice(0, 8)}`;
      let attempt = 0;
      while (attempt < 5) {
        const exists = await prisma.marque.findFirst({
          where: { slug },
          select: { id: true },
        });
        if (!exists) break;
        attempt += 1;
        slug = `${baseSlug}-${id.slice(0, 6)}${attempt}`;
      }
      const created = await prisma.marque.create({
        data: {
          nom: nomMarque,
          slug,
          ...billingDefaults,
        },
        select: { id: true },
      });
      targetMarqueId = created.id;
    } else {
      // S'assurer que le nom commercial de la fiche cible est bien celui saisi
      const target = await prisma.marque.findUnique({
        where: { id: targetMarqueId },
        select: { nom: true },
      });
      if (
        target &&
        normalizeLabel(target.nom) !== normalizeLabel(nomMarque)
      ) {
        // Ne pas renommer une fiche partagée au nom différent : créer dédiée
        const baseSlug = marqueSlug(nomMarque) || "marque";
        const slug = `${baseSlug}-${id.slice(0, 8)}`;
        const created = await prisma.marque.create({
          data: {
            nom: nomMarque,
            slug,
            ...billingDefaults,
          },
          select: { id: true },
        });
        targetMarqueId = created.id;
      }
    }

    await prisma.collaboration.update({
      where: { id },
      data: {
        marqueId: targetMarqueId,
        nomMarqueVerifieAt: new Date(),
      },
    });

    const marque = await prisma.marque.findUnique({
      where: { id: targetMarqueId },
      select: { id: true, nom: true },
    });

    if (!marque || normalizeLabel(marque.nom) !== normalizeLabel(nomMarque)) {
      return NextResponse.json(
        {
          message:
            "La correction n'a pas pu être enregistrée. Réessaie avec un autre libellé.",
        },
        { status: 500 }
      );
    }

    const res = NextResponse.json({
      ok: true,
      mode: "reassign",
      marque,
    });
    return withLockCookie(res, role, session.user.id);
  } catch (error) {
    console.error("Erreur corriger-marque:", error);
    return NextResponse.json({ message: "Erreur" }, { status: 500 });
  }
}
