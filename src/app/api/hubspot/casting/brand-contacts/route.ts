import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";

const ALLOWED_ROLES_READ = ["CASTING_MANAGER", "ADMIN", "HEAD_OF_SALES", "HEAD_OF"] as const;
const ALLOWED_ROLES_WRITE = ["CASTING_MANAGER", "ADMIN"] as const;

function canRead(role: string | undefined): boolean {
  return role !== undefined && (ALLOWED_ROLES_READ as readonly string[]).includes(role);
}

function canWrite(role: string | undefined): boolean {
  return role !== undefined && (ALLOWED_ROLES_WRITE as readonly string[]).includes(role);
}

/**
 * Recherche marque via HubSpot désactivée.
 * Les contacts casting viennent du CRM interne (`/api/marques/contacts`).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!canRead(session.user.role)) {
      return NextResponse.json(
        { error: "Accès réservé aux rôles Casting, Head of Sales, Head Of ou Administrateur." },
        { status: 403 }
      );
    }

    const brand = (request.nextUrl.searchParams.get("brand") || "").trim();
    if (brand.length < 2) {
      return NextResponse.json(
        { error: "Paramètre brand requis (min 2 caractères)." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      contacts: [],
      disabled: true,
      message:
        "Recherche HubSpot désactivée. Utilise les contacts de la fiche marque (base interne).",
    });
  } catch (error) {
    console.error("GET /api/hubspot/casting/brand-contacts:", error);
    return NextResponse.json(
      { error: "Erreur lors du chargement des contacts de marque." },
      { status: 500 }
    );
  }
}

/** Création de contact HubSpot désactivée — CRM interne uniquement. */
export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!canWrite(session.user.role)) {
      return NextResponse.json(
        { error: "Accès réservé aux rôles Casting ou Administrateur." },
        { status: 403 }
      );
    }

    return NextResponse.json(
      {
        error:
          "Création de contacts HubSpot désactivée. Ajoute le contact sur la fiche marque (base interne).",
        disabled: true,
      },
      { status: 410 }
    );
  } catch (error) {
    console.error("POST /api/hubspot/casting/brand-contacts:", error);
    return NextResponse.json(
      { error: "Erreur lors de la création du contact." },
      { status: 500 }
    );
  }
}
