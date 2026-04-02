import { NextRequest, NextResponse } from "next/server";
import {
  getContactsFromListWithCasting,
  updateContactCastingEmail,
  type CastingEmailStatus,
} from "@/lib/hubspot";
import { getAppSession } from "@/lib/getAppSession";

const ALLOWED_ROLES = ["CASTING_MANAGER", "ADMIN"] as const;

function isAllowed(role: string | undefined): boolean {
  return role !== undefined && (ALLOWED_ROLES as readonly string[]).includes(role);
}

export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const role = session.user.role;
    if (!isAllowed(role)) {
      return NextResponse.json(
        { error: "Accès réservé aux rôles Casting ou Administrateur." },
        { status: 403 }
      );
    }

    const listId = request.nextUrl.searchParams.get("listId");
    if (!listId?.trim()) {
      return NextResponse.json(
        { error: "Paramètre listId requis." },
        { status: 400 }
      );
    }

    const contacts = await getContactsFromListWithCasting(listId.trim());
    return NextResponse.json({ contacts });
  } catch (e) {
    console.error("GET /api/hubspot/casting:", e);
    return NextResponse.json(
      { error: "Impossible de charger les contacts HubSpot." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const role = session.user.role;
    if (!isAllowed(role)) {
      return NextResponse.json(
        { error: "Accès réservé aux rôles Casting ou Administrateur." },
        { status: 403 }
      );
    }

    function htmlToPlainText(html: string): string {
      return html
        // Paragraphes → texte + double saut de ligne
        .replace(/<\/p>/gi, "\n")
        // Retours à la ligne <br>
        .replace(/<br\s*\/?>/gi, "\n")
        // Gras → texte brut
        .replace(/<strong>(.*?)<\/strong>/gi, "$1")
        // Italique → texte brut
        .replace(/<em>(.*?)<\/em>/gi, "$1")
        // Liens → texte brut
        .replace(/<a[^>]*>(.*?)<\/a>/gi, "$1")
        // Listes <li>
        .replace(/<li>(.*?)<\/li>/gi, "- $1\n")
        // Supprimer toutes les autres balises HTML
        .replace(/<[^>]+>/g, "")
        // Décoder les entités HTML
        .replace(/&amp;/g, "&")
        .replace(/&nbsp;/g, " ")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        // Supprimer les espaces en début et fin
        .trim()
        // Max 1 saut de ligne vide (2+ sauts de ligne consécutifs → 1)
        .replace(/\n{2,}/g, "\n");
    }

    function resolveTokens(
      text: string,
      contact: {
        firstname?: string;
        lastname?: string;
        company?: string;
      }
    ): string {
      return text
        .replace(/\{\{\s*contact\.firstname\s*\}\}/g, contact.firstname || "")
        .replace(/\{\{\s*contact\.lastname\s*\}\}/g, contact.lastname || "")
        .replace(/\{\{\s*contact\.company\s*\}\}/g, contact.company || "");
    }

    const reqBody = (await request.json()) as {
      contactId?: unknown;
      subject?: unknown;
      body?: unknown;
      status?: unknown;
      firstname?: unknown;
      lastname?: unknown;
      company?: unknown;
    };

    const contactId =
      typeof reqBody.contactId === "string" ? reqBody.contactId.trim() : "";
    const subject = typeof reqBody.subject === "string" ? reqBody.subject : "";
    const emailBody = typeof reqBody.body === "string" ? reqBody.body : "";
    const firstname =
      typeof reqBody.firstname === "string" ? reqBody.firstname : "";
    const lastname = typeof reqBody.lastname === "string" ? reqBody.lastname : "";
    const company = typeof reqBody.company === "string" ? reqBody.company : "";
    const status = typeof reqBody.status === "string" ? reqBody.status : "";

    if (!contactId) {
      return NextResponse.json(
        { error: "contactId est requis." },
        { status: 400 }
      );
    }

    if (!subject.trim()) {
      return NextResponse.json(
        { error: "L’objet de l’email est obligatoire." },
        { status: 400 }
      );
    }

    if (status !== "en_cours" && status !== "pret") {
      return NextResponse.json(
        { error: "Statut invalide (en_cours ou pret attendu)." },
        { status: 400 }
      );
    }

    const plainBody = htmlToPlainText(emailBody);

    const resolvedSubject = resolveTokens(subject, {
      firstname,
      lastname,
      company,
    });
    const resolvedBody = resolveTokens(emailBody, {
      firstname,
      lastname,
      company,
    });

    const resolvedBodyForHubspot = resolvedBody
      .replace(/<p(?![^>]*style=)/gi, '<p style="margin:0; padding:0;"')
      .replace(/<p[^>]*>\s*(?:<br\s*\/?>)?\s*<\/p>/gi, "");

    const ok = await updateContactCastingEmail(contactId, {
      subject: resolvedSubject,
      body: resolvedBodyForHubspot,
      status: status as CastingEmailStatus,
    });

    if (!ok) {
      return NextResponse.json(
        { error: "Échec de la mise à jour HubSpot. Vérifiez la configuration ou réessayez." },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("POST /api/hubspot/casting:", e);
    return NextResponse.json(
      { error: "Erreur lors de l’enregistrement." },
      { status: 500 }
    );
  }
}
