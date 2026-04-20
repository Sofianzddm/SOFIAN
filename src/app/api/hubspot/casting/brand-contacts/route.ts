import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";

const ALLOWED_ROLES_READ = ["CASTING_MANAGER", "ADMIN", "HEAD_OF_SALES", "HEAD_OF"] as const;
const ALLOWED_ROLES_WRITE = ["CASTING_MANAGER", "ADMIN"] as const;
const HUBSPOT_BASE_URL = "https://api.hubapi.com";

function canRead(role: string | undefined): boolean {
  return role !== undefined && (ALLOWED_ROLES_READ as readonly string[]).includes(role);
}

function canWrite(role: string | undefined): boolean {
  return role !== undefined && (ALLOWED_ROLES_WRITE as readonly string[]).includes(role);
}

type HubSpotSearchResponse = {
  results?: Array<{
    id?: string;
    properties?: Record<string, string | undefined>;
  }>;
  paging?: {
    next?: {
      after?: string;
    };
  };
};

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

    const apiKey = process.env.HUBSPOT_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "HUBSPOT_API_KEY non configurée." },
        { status: 500 }
      );
    }

    const contacts: Array<{
      id: string;
      firstname: string;
      lastname: string;
      email: string;
      companyName: string;
      domain: string;
      castingEmailSubject: string;
      castingEmailBody: string;
      castingStatus: string;
    }> = [];

    let after: string | undefined;
    let loops = 0;
    do {
      loops += 1;
      const response = await fetch(`${HUBSPOT_BASE_URL}/crm/v3/objects/contacts/search`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filterGroups: [
            {
              filters: [
                {
                  propertyName: "company",
                  operator: "CONTAINS_TOKEN",
                  value: brand,
                },
              ],
            },
          ],
          properties: [
            "firstname",
            "lastname",
            "email",
            "company",
            "website",
            "casting_email_subject",
            "casting_email_body",
            "casting_status",
          ],
          limit: 100,
          ...(after ? { after } : {}),
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        console.error("GET /api/hubspot/casting/brand-contacts:", response.status, detail);
        return NextResponse.json(
          { error: "Impossible de rechercher les contacts HubSpot pour cette marque." },
          { status: 500 }
        );
      }

      const data = (await response.json()) as HubSpotSearchResponse;
      const batch = Array.isArray(data.results) ? data.results : [];
      for (const item of batch) {
        const props = item.properties || {};
        const website = (props.website || "").trim();
        const email = (props.email || "").trim();
        const fallbackDomain = email.includes("@") ? email.split("@")[1] : "";
        const domain = website
          ? website.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0]
          : fallbackDomain;
        contacts.push({
          id: String(item.id || ""),
          firstname: (props.firstname || "").trim(),
          lastname: (props.lastname || "").trim(),
          email,
          companyName: (props.company || "").trim() || brand,
          domain,
          castingEmailSubject: (props.casting_email_subject || "").trim(),
          castingEmailBody: (props.casting_email_body || "").trim(),
          castingStatus: (props.casting_status || "").trim(),
        });
      }

      after = data.paging?.next?.after;
    } while (after && loops < 5);

    const dedup = new Map<string, (typeof contacts)[number]>();
    for (const c of contacts) {
      if (!c.id) continue;
      dedup.set(c.id, c);
    }

    return NextResponse.json({ contacts: Array.from(dedup.values()) });
  } catch (error) {
    console.error("GET /api/hubspot/casting/brand-contacts:", error);
    return NextResponse.json(
      { error: "Erreur lors du chargement des contacts de marque." },
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
    if (!canWrite(session.user.role)) {
      return NextResponse.json(
        { error: "Accès réservé aux rôles Casting ou Administrateur." },
        { status: 403 }
      );
    }

    const body = (await request.json()) as {
      brand?: string;
      email?: string;
      firstname?: string;
      lastname?: string;
    };
    const brand = String(body.brand || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const firstname = String(body.firstname || "").trim();
    const lastname = String(body.lastname || "").trim();

    if (brand.length < 2 || !email || !email.includes("@")) {
      return NextResponse.json(
        { error: "brand et email valides sont requis." },
        { status: 400 }
      );
    }

    const apiKey = process.env.HUBSPOT_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "HUBSPOT_API_KEY non configurée." },
        { status: 500 }
      );
    }

    const response = await fetch(`${HUBSPOT_BASE_URL}/crm/v3/objects/contacts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: {
          email,
          firstname,
          lastname,
          company: brand,
        },
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const category = String((data as { category?: string }).category || "").toUpperCase();
      const message = String((data as { message?: string }).message || "").toUpperCase();
      const isConflict =
        response.status === 409 || category === "CONFLICT" || message.includes("ALREADY") || message.includes("EXIST");
      if (isConflict) {
        const lookup = await fetch(`${HUBSPOT_BASE_URL}/crm/v3/objects/contacts/search`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            filterGroups: [
              { filters: [{ propertyName: "email", operator: "EQ", value: email }] },
            ],
            properties: ["firstname", "lastname", "email", "company"],
            limit: 1,
          }),
        });
        const lookupData = (await lookup.json().catch(() => ({}))) as {
          results?: Array<{ id?: string; properties?: Record<string, string | undefined> }>;
        };
        const existing = Array.isArray(lookupData.results) ? lookupData.results[0] : null;
        const existingId = String(existing?.id || "");

        if (existingId) {
          await fetch(`${HUBSPOT_BASE_URL}/crm/v3/objects/contacts/${existingId}`, {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              properties: {
                firstname: firstname || existing?.properties?.firstname || "",
                lastname: lastname || existing?.properties?.lastname || "",
                company: brand || existing?.properties?.company || "",
              },
            }),
          }).catch(() => null);

          return NextResponse.json({
            contact: {
              id: existingId,
              firstname: firstname || String(existing?.properties?.firstname || ""),
              lastname: lastname || String(existing?.properties?.lastname || ""),
              email,
              companyName: brand || String(existing?.properties?.company || ""),
            },
            alreadyExisted: true,
          });
        }

        return NextResponse.json(
          { error: "Le contact existe déjà dans HubSpot, mais sa fiche n'a pas pu être récupérée." },
          { status: 409 }
        );
      }
      console.error("POST /api/hubspot/casting/brand-contacts:", response.status, data);
      return NextResponse.json(
        { error: "Impossible de créer le contact client dans HubSpot." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      contact: {
        id: String((data as { id?: string }).id || ""),
        firstname,
        lastname,
        email,
        companyName: brand,
      },
    });
  } catch (error) {
    console.error("POST /api/hubspot/casting/brand-contacts:", error);
    return NextResponse.json(
      { error: "Erreur lors de la création du contact client." },
      { status: 500 }
    );
  }
}
