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

    /**
     * Conserve le HTML TipTap pour push HubSpot (balises <a> incluses).
     */
    function tiptapToHubspotHtml(html: string): string {
      return html.trim();
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
      contactIds?: unknown;
      subject?: unknown;
      body?: unknown;
      status?: unknown;
    };

    const contactIds = Array.isArray(reqBody.contactIds)
      ? reqBody.contactIds
          .filter((v): v is string => typeof v === "string")
          .map((v) => v.trim())
          .filter(Boolean)
      : [];

    const subject = typeof reqBody.subject === "string" ? reqBody.subject : "";
    const emailBody = typeof reqBody.body === "string" ? reqBody.body : "";
    const status = typeof reqBody.status === "string" ? reqBody.status : "";

    if (contactIds.length === 0) {
      return NextResponse.json({ error: "contactIds est requis." }, { status: 400 });
    }

    const isReset =
      !subject.trim() && !emailBody.trim() && status.trim() === "";

    if (!isReset) {
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
    }

    const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY;
    const HUBSPOT_BASE_URL = "https://api.hubapi.com";

    const getContactTokens = async (contactId: string): Promise<{
      firstname: string;
      lastname: string;
      company: string;
    }> => {
      if (!HUBSPOT_API_KEY) {
        throw new Error("HUBSPOT_API_KEY not configured");
      }

      const res = await fetch(
        `${HUBSPOT_BASE_URL}/crm/v3/objects/contacts/${encodeURIComponent(
          contactId
        )}?properties=firstname,lastname,company`,
        {
          headers: {
            Authorization: `Bearer ${HUBSPOT_API_KEY}`,
          },
        }
      );

      if (!res.ok) {
        throw new Error(`Impossible de charger le contact ${contactId} (${res.status})`);
      }

      const data = (await res.json()) as {
        properties?: Record<
          string,
          { value?: unknown } | string | null | undefined
        >;
      };

      const properties = data.properties || {};
      const getVal = (v: unknown): string => {
        if (typeof v === "string") return v;
        if (!v) return "";
        if (typeof v === "object" && "value" in (v as Record<string, unknown>)) {
          const vv = (v as { value?: unknown }).value;
          return typeof vv === "string" ? vv : "";
        }
        return "";
      };

      return {
        firstname: getVal(properties.firstname),
        lastname: getVal(properties.lastname),
        company: getVal(properties.company),
      };
    };

    for (const contactId of contactIds) {
      const tokens = await getContactTokens(contactId);
      const resolvedSubject = isReset ? "" : resolveTokens(subject, tokens);
      const resolvedBody = isReset ? "" : resolveTokens(emailBody, tokens);
      const hubspotBody = isReset ? "" : tiptapToHubspotHtml(resolvedBody);

      const ok = await updateContactCastingEmail(contactId, {
        subject: resolvedSubject,
        body: hubspotBody,
        status: (isReset ? "" : status) as CastingEmailStatus,
      });

      if (!ok) {
        throw new Error(
          "Échec de la mise à jour HubSpot. Vérifiez la configuration ou réessayez."
        );
      }
    }

    return NextResponse.json({
      success: true,
      updated: contactIds.length,
    });
  } catch (e) {
    console.error("POST /api/hubspot/casting:", e);
    return NextResponse.json(
      { error: "Erreur lors de l’enregistrement." },
      { status: 500 }
    );
  }
}
