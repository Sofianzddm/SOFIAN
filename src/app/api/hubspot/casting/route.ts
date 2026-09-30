import { NextRequest, NextResponse } from "next/server";
import {
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

/** Listes HubSpot casting : désactivées (CRM interne uniquement). */
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

    return NextResponse.json({
      contacts: [],
      disabled: true,
      message:
        "Import HubSpot casting désactivé. Les contacts viennent de la fiche marque (base interne).",
    });
  } catch (e) {
    console.error("GET /api/hubspot/casting:", e);
    return NextResponse.json(
      { error: "Impossible de charger les contacts HubSpot." },
      { status: 500 }
    );
  }
}

/**
 * Push casting → HubSpot (séquences / relances HS) : désactivé.
 * Seul le reset (vidage casting_*) reste autorisé pour stopper d'anciens drafts.
 */
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
    const isReset =
      !subject.trim() && !emailBody.trim() && status.trim() === "";

    if (!isReset) {
      return NextResponse.json(
        {
          error:
            "Envoi casting via HubSpot désactivé. Les mails / relances passent par le pipeline interne (Gmail), pas HubSpot.",
          disabled: true,
        },
        { status: 410 }
      );
    }

    if (contactIds.length === 0) {
      return NextResponse.json({ error: "contactIds est requis." }, { status: 400 });
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
            if (await isVerified()) return true;
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
      const props = await getContactProperties(contactId, ["company"]);
      const brandKey = normalizeMissionBrandKey(props.company || "");
      if (brandKey) brandKeysTouched.add(brandKey);

      const ok = await updateContactCastingEmailWithRetry(contactId, {
        subject: "",
        body: "",
        status: "" as CastingEmailStatus,
      });

      if (!ok) {
        throw new Error(
          "Échec de la mise à jour HubSpot. Vérifiez la configuration ou réessayez."
        );
      }
    }

    if (brandKeysTouched.size > 0) {
      await contactMissionModel.updateMany({
        where: {
          targetBrandKey: { in: Array.from(brandKeysTouched) },
          status: { in: ["READY_FOR_CASTING", "EMAIL_DRAFTED", "APPROVED_BY_SALES"] },
        },
        data: { status: "READY_FOR_CASTING" },
      });
    }

    return NextResponse.json({
      success: true,
      updated: contactIds.length,
      reset: true,
    });
  } catch (e) {
    console.error("POST /api/hubspot/casting:", e);
    return NextResponse.json(
      { error: "Erreur lors de l’enregistrement." },
      { status: 500 }
    );
  }
}
