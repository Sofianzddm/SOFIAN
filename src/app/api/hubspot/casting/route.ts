import { NextRequest, NextResponse } from "next/server";
import {
  getContactsFromListWithCasting,
  updateContactCastingEmail,
  type CastingEmailStatus,
} from "@/lib/hubspot";
import { getAppSession } from "@/lib/getAppSession";
import { prisma } from "@/lib/prisma";
import { normalizeMissionBrandKey } from "@/lib/contact-missions";

const ALLOWED_ROLES = ["CASTING_MANAGER", "ADMIN"] as const;

function isAllowed(role: string | undefined): boolean {
  return role !== undefined && (ALLOWED_ROLES as readonly string[]).includes(role);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizedValue(v: string): string {
  return (v || "").replace(/\s+/g, " ").trim();
}

const contactMissionModel = (prisma as unknown as { contactMission: any }).contactMission;

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

    const getContactProperties = async (
      contactId: string,
      properties: string[]
    ): Promise<Record<string, string>> => {
      if (!HUBSPOT_API_KEY) {
        throw new Error("HUBSPOT_API_KEY not configured");
      }

      const query = properties.map((p) => `properties=${encodeURIComponent(p)}`).join("&");
      const res = await fetch(
        `${HUBSPOT_BASE_URL}/crm/v3/objects/contacts/${encodeURIComponent(contactId)}?${query}`,
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

      const rawProperties = data.properties || {};
      const getVal = (v: unknown): string => {
        if (typeof v === "string") return v;
        if (!v) return "";
        if (typeof v === "object" && "value" in (v as Record<string, unknown>)) {
          const vv = (v as { value?: unknown }).value;
          return typeof vv === "string" ? vv : "";
        }
        return "";
      };

      const out: Record<string, string> = {};
      for (const key of properties) {
        out[key] = getVal(rawProperties[key]);
      }
      return out;
    };

    const getContactTokens = async (contactId: string): Promise<{
      firstname: string;
      lastname: string;
      company: string;
    }> => {
      const properties = await getContactProperties(contactId, [
        "firstname",
        "lastname",
        "company",
      ]);
      return {
        firstname: properties.firstname || "",
        lastname: properties.lastname || "",
        company: properties.company || "",
      };
    };

    const getContactTokensWithRetry = async (
      contactId: string,
      maxAttempts = 3
    ): Promise<{ firstname: string; lastname: string; company: string }> => {
      let lastError: unknown = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await getContactTokens(contactId);
        } catch (e) {
          lastError = e;
          if (attempt < maxAttempts) {
            await sleep(250 * attempt);
          }
        }
      }
      throw lastError instanceof Error
        ? lastError
        : new Error(`Impossible de charger le contact ${contactId}`);
    };

    const updateContactCastingEmailWithRetry = async (
      contactId: string,
      payload: { subject: string; body: string; status: CastingEmailStatus },
      maxAttempts = 3
    ): Promise<boolean> => {
      const isVerified = async (): Promise<boolean> => {
        const props = await getContactProperties(contactId, [
          "casting_email_subject",
          "casting_email_body",
          "casting_status",
        ]);
        return (
          normalizedValue(props.casting_email_subject || "") ===
            normalizedValue(payload.subject) &&
          normalizedValue(props.casting_status || "") ===
            normalizedValue(payload.status) &&
          normalizedValue(props.casting_email_body || "") === normalizedValue(payload.body)
        );
      };

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const ok = await updateContactCastingEmail(contactId, payload);
        if (ok) {
          try {
            const verified = await isVerified();
            if (verified) return true;
          } catch {
            // ignore et retenter
          }
        }
        if (attempt < maxAttempts) {
          await sleep(250 * attempt);
        }
      }
      return false;
    };

    const brandKeysTouched = new Set<string>();

    for (const contactId of contactIds) {
      const tokens = await getContactTokensWithRetry(contactId);
      const resolvedSubject = isReset ? "" : resolveTokens(subject, tokens);
      const resolvedBody = isReset ? "" : resolveTokens(emailBody, tokens);
      const hubspotBody = isReset ? "" : tiptapToHubspotHtml(resolvedBody);
      const brandKey = normalizeMissionBrandKey(tokens.company || "");
      if (brandKey) brandKeysTouched.add(brandKey);

      const ok = await updateContactCastingEmailWithRetry(contactId, {
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

    if (brandKeysTouched.size > 0) {
      const nextMissionStatus = isReset
        ? "READY_FOR_CASTING"
        : status === "pret"
          ? "APPROVED_BY_SALES"
          : "EMAIL_DRAFTED";
      await contactMissionModel.updateMany({
        where: {
          targetBrandKey: { in: Array.from(brandKeysTouched) },
          status: { in: ["READY_FOR_CASTING", "EMAIL_DRAFTED", "APPROVED_BY_SALES"] },
        },
        data: { status: nextMissionStatus },
      });
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
