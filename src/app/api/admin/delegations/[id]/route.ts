import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { prisma } from "@/lib/prisma";
import { basculerGiftsPourDelegation } from "@/lib/delegations";

function requireAdmin(session: Awaited<ReturnType<typeof getAppSession>>) {
  const role = (session?.user as { role?: string })?.role;
  const rolesAutorises = ["ADMIN", "HEAD_OF_INFLUENCE"];
  if (!role || !rolesAutorises.includes(role)) {
    return NextResponse.json({ error: "Accès réservé à l'admin" }, { status: 403 });
  }
  return null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    const authError = requireAdmin(session);
    if (authError) return authError;

    const { id } = await params;
    const body = await request.json();
    const { actif } = body as { actif?: boolean };

    if (typeof actif !== "boolean") {
      return NextResponse.json(
        { error: "Champ 'actif' (boolean) requis" },
        { status: 400 }
      );
    }

    const updated = await prisma.delegationTM.update({
      where: { id },
      data: { actif },
      include: {
        talent: {
          select: { id: true, prenom: true, nom: true, photo: true, managerId: true },
        },
        tmOrigine: {
          select: { id: true, prenom: true, nom: true },
        },
        tmRelai: {
          select: { id: true, prenom: true, nom: true },
        },
      },
    });

    try {
      await basculerGiftsPourDelegation(
        updated,
        actif ? "vers_relai" : "vers_origine"
      );
    } catch (e) {
      console.error("Erreur bascule gifts délégation:", e);
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Erreur PATCH /api/admin/delegations/[id]:", error);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour de la délégation" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    const authError = requireAdmin(session);
    if (authError) return authError;

    const { id } = await params;

    const delegation = await prisma.delegationTM.findUnique({
      where: { id },
      include: {
        talent: { select: { managerId: true } },
      },
    });

    if (delegation) {
      try {
        await basculerGiftsPourDelegation(delegation, "vers_origine");
      } catch (e) {
        console.error("Erreur bascule gifts avant suppression délégation:", e);
      }
    }

    await prisma.delegationTM.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur DELETE /api/admin/delegations/[id]:", error);
    return NextResponse.json(
      { error: "Erreur lors de la suppression de la délégation" },
      { status: 500 }
    );
  }
}

