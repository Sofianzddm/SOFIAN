import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { contactPersonKey } from "@/lib/contact-person-key";
import {
  findOrCreateBeneluxCompany,
  generateUniqueBeneluxSlug,
  slugifyBenelux,
} from "@/lib/benelux-company";
import { findOrCreateMarque } from "@/lib/marque-resolver";

/**
 * POST → corrige le/les marché(s) d'un contact en file d'enrichissement.
 * Body: {
 *   refs: [{ id, market: "FR"|"BENELUX" }],
 *   markets: ("FR"|"BENELUX")[]   // cible : FR seul, BE seul, ou les deux
 * }
 *
 * Ajoute le jumeau manquant (crée la fiche marché liée si besoin) et/ou
 * supprime le contact du marché retiré. Reste en QUEUED.
 */

const ALLOWED_ROLES = ["ADMIN", "CASTING_MANAGER"] as const;

type BrandMarket = "FR" | "BENELUX";

type RefIn = { id?: string; market?: string };

type ContactSnapshot = {
  prenom: string | null;
  nom: string;
  poste: string | null;
  perimetre: string | null;
  localisation: string | null;
  priorite: string | null;
  linkedinUrl: string | null;
  language: string;
  source: string | null;
  email: string | null;
  emailSuggested: string | null;
  emailLookupStatus: string | null;
  emailLookupQueuedAt: Date | null;
  outreachExcluded: boolean;
};

function parseMarkets(raw: unknown): BrandMarket[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const set = new Set<BrandMarket>();
  for (const item of raw) {
    const m = String(item || "").toUpperCase();
    if (m === "FR") set.add("FR");
    else if (m === "BENELUX" || m === "BE") set.add("BENELUX");
    else return null;
  }
  if (set.size === 0) return null;
  return Array.from(set);
}

function parseRefs(raw: unknown): Array<{ id: string; market: BrandMarket }> | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: Array<{ id: string; market: BrandMarket }> = [];
  for (const item of raw as RefIn[]) {
    const id = typeof item?.id === "string" ? item.id.trim() : "";
    const m = String(item?.market || "").toUpperCase();
    const market: BrandMarket | null =
      m === "FR" ? "FR" : m === "BENELUX" || m === "BE" ? "BENELUX" : null;
    if (!id || !market) return null;
    out.push({ id, market });
  }
  return out;
}

async function loadFrContact(id: string): Promise<
  | (ContactSnapshot & { id: string; marqueId: string; company: string })
  | null
> {
  const c = await prisma.marqueContact.findUnique({
    where: { id },
    select: {
      id: true,
      prenom: true,
      nom: true,
      poste: true,
      perimetre: true,
      localisation: true,
      priorite: true,
      linkedinUrl: true,
      language: true,
      source: true,
      email: true,
      emailSuggested: true,
      emailLookupStatus: true,
      emailLookupQueuedAt: true,
      outreachExcluded: true,
      marqueId: true,
      marque: { select: { nom: true } },
    },
  });
  if (!c) return null;
  return {
    id: c.id,
    prenom: c.prenom,
    nom: c.nom,
    poste: c.poste,
    perimetre: c.perimetre,
    localisation: c.localisation,
    priorite: c.priorite,
    linkedinUrl: c.linkedinUrl,
    language: c.language === "en" ? "en" : "fr",
    source: c.source,
    email: c.email,
    emailSuggested: c.emailSuggested,
    emailLookupStatus: c.emailLookupStatus,
    emailLookupQueuedAt: c.emailLookupQueuedAt,
    outreachExcluded: c.outreachExcluded,
    marqueId: c.marqueId,
    company: c.marque.nom,
  };
}

async function loadBeContact(id: string): Promise<
  | (ContactSnapshot & { id: string; companyId: string; company: string })
  | null
> {
  const c = await prisma.beneluxContact.findUnique({
    where: { id },
    select: {
      id: true,
      prenom: true,
      nom: true,
      poste: true,
      perimetre: true,
      localisation: true,
      priorite: true,
      linkedinUrl: true,
      language: true,
      source: true,
      email: true,
      emailSuggested: true,
      emailLookupStatus: true,
      emailLookupQueuedAt: true,
      outreachExcluded: true,
      companyId: true,
      company: { select: { nom: true } },
    },
  });
  if (!c) return null;
  return {
    id: c.id,
    prenom: c.prenom,
    nom: c.nom || c.prenom || "Contact",
    poste: c.poste,
    perimetre: c.perimetre,
    localisation: c.localisation,
    priorite: c.priorite,
    linkedinUrl: c.linkedinUrl,
    language: c.language === "en" ? "en" : "fr",
    source: c.source,
    email: c.email,
    emailSuggested: c.emailSuggested,
    emailLookupStatus: c.emailLookupStatus,
    emailLookupQueuedAt: c.emailLookupQueuedAt,
    outreachExcluded: c.outreachExcluded,
    companyId: c.companyId,
    company: c.company.nom,
  };
}

async function resolveLinkedPair(opts: {
  marqueId?: string | null;
  companyId?: string | null;
  companyName: string;
  userId: string;
}): Promise<{ marqueId: string; companyId: string }> {
  let marqueId = opts.marqueId || null;
  let companyId = opts.companyId || null;

  if (marqueId && !companyId) {
    const linked =
      (await prisma.beneluxCompany.findFirst({
        where: { linkedMarqueId: marqueId },
        select: { id: true },
      })) ||
      (await prisma.beneluxCompany.findFirst({
        where: { nom: { equals: opts.companyName, mode: "insensitive" } },
        select: { id: true },
      }));
    if (linked) {
      companyId = linked.id;
      await prisma.beneluxCompany.update({
        where: { id: companyId },
        data: { linkedMarqueId: marqueId },
      });
    } else {
      const slug = await generateUniqueBeneluxSlug(slugifyBenelux(opts.companyName));
      const created = await prisma.beneluxCompany.create({
        data: {
          nom: opts.companyName,
          slug,
          linkedMarqueId: marqueId,
          createdById: opts.userId,
        },
        select: { id: true },
      });
      companyId = created.id;
    }
  }

  if (companyId && !marqueId) {
    const company = await prisma.beneluxCompany.findUnique({
      where: { id: companyId },
      select: { linkedMarqueId: true, nom: true },
    });
    if (company?.linkedMarqueId) {
      marqueId = company.linkedMarqueId;
    } else {
      const resolved = await findOrCreateMarque({
        name: company?.nom || opts.companyName,
        source: "IMPORT",
      });
      marqueId = resolved.marqueId;
      await prisma.beneluxCompany.update({
        where: { id: companyId },
        data: { linkedMarqueId: marqueId },
      });
    }
  }

  if (!marqueId || !companyId) {
    // Ni FR ni BE fournis (ne devrait pas arriver) → crée les deux.
    const resolved = await findOrCreateMarque({
      name: opts.companyName,
      source: "IMPORT",
    });
    marqueId = resolved.marqueId;
    const be = await findOrCreateBeneluxCompany(opts.companyName, opts.userId);
    companyId = be.id;
    await prisma.beneluxCompany.update({
      where: { id: companyId },
      data: { linkedMarqueId: marqueId },
    });
  }

  return { marqueId, companyId };
}

function samePerson(
  a: { prenom: string | null; nom: string },
  b: { prenom: string | null; nom: string | null }
): boolean {
  return contactPersonKey(a.prenom, a.nom) === contactPersonKey(b.prenom, b.nom);
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const role = session.user.role || "";
    if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      refs?: unknown;
      markets?: unknown;
    };
    const refs = parseRefs(body.refs);
    const desired = parseMarkets(body.markets);
    if (!refs || !desired) {
      return NextResponse.json(
        { error: "refs et markets (FR / BENELUX) requis." },
        { status: 400 }
      );
    }

    const frRef = refs.find((r) => r.market === "FR") || null;
    const beRef = refs.find((r) => r.market === "BENELUX") || null;
    if (!frRef && !beRef) {
      return NextResponse.json({ error: "Aucun marché FR/BE fourni." }, { status: 400 });
    }

    const frContact = frRef ? await loadFrContact(frRef.id) : null;
    const beContact = beRef ? await loadBeContact(beRef.id) : null;
    if (frRef && !frContact) {
      return NextResponse.json({ error: "Contact FR introuvable." }, { status: 404 });
    }
    if (beRef && !beContact) {
      return NextResponse.json({ error: "Contact BE introuvable." }, { status: 404 });
    }

    const snapshot: ContactSnapshot = frContact || beContact!;
    const companyName = frContact?.company || beContact!.company;
    const wantFr = desired.includes("FR");
    const wantBe = desired.includes("BENELUX");
    const now = new Date();

    const { marqueId, companyId } = await resolveLinkedPair({
      marqueId: frContact?.marqueId || null,
      companyId: beContact?.companyId || null,
      companyName,
      userId: session.user.id,
    });

    const nextRefs: Array<{ id: string; market: BrandMarket; marqueId: string }> = [];

    // —— FR ——
    if (wantFr) {
      if (frContact) {
        nextRefs.push({ id: frContact.id, market: "FR", marqueId: frContact.marqueId });
      } else {
        // Réutilise un jumeau déjà présent sur la fiche FR (même personne).
        const existing = await prisma.marqueContact.findMany({
          where: { marqueId },
          select: {
            id: true,
            prenom: true,
            nom: true,
            emailLookupStatus: true,
            outreachExcluded: true,
            diffusionOptOut: true,
          },
        });
        let twin = existing.find((c) => samePerson(snapshot, c)) || null;
        if (twin) {
          if (
            twin.emailLookupStatus !== "QUEUED" &&
            !twin.outreachExcluded &&
            !twin.diffusionOptOut
          ) {
            await prisma.marqueContact.update({
              where: { id: twin.id },
              data: {
                emailLookupStatus: "QUEUED",
                emailLookupQueuedAt: now,
                emailSuggested: snapshot.emailSuggested,
              },
            });
          }
          nextRefs.push({ id: twin.id, market: "FR", marqueId });
        } else {
          const created = await prisma.marqueContact.create({
            data: {
              marqueId,
              prenom: snapshot.prenom,
              nom: snapshot.nom,
              email: null,
              poste: snapshot.poste,
              perimetre: snapshot.perimetre,
              localisation: snapshot.localisation,
              priorite: snapshot.priorite,
              linkedinUrl: snapshot.linkedinUrl,
              language: snapshot.language === "en" ? "en" : "fr",
              source: snapshot.source === "AO" ? "AO" : "CARTO",
              outreachExcluded: snapshot.outreachExcluded,
              emailLookupStatus: "QUEUED",
              emailLookupQueuedAt: now,
              emailSuggested: snapshot.emailSuggested,
            },
            select: { id: true },
          });
          nextRefs.push({ id: created.id, market: "FR", marqueId });
        }
      }
    }

    // —— BENELUX ——
    if (wantBe) {
      if (beContact) {
        nextRefs.push({
          id: beContact.id,
          market: "BENELUX",
          marqueId: companyId,
        });
      } else {
        const existing = await prisma.beneluxContact.findMany({
          where: { companyId },
          select: {
            id: true,
            prenom: true,
            nom: true,
            emailLookupStatus: true,
            outreachExcluded: true,
          },
        });
        let twin = existing.find((c) => samePerson(snapshot, c)) || null;
        if (twin) {
          if (twin.emailLookupStatus !== "QUEUED" && !twin.outreachExcluded) {
            await prisma.beneluxContact.update({
              where: { id: twin.id },
              data: {
                emailLookupStatus: "QUEUED",
                emailLookupQueuedAt: now,
                emailSuggested: snapshot.emailSuggested,
              },
            });
          }
          nextRefs.push({ id: twin.id, market: "BENELUX", marqueId: companyId });
        } else {
          const prenom = (snapshot.prenom || snapshot.nom || "Contact").trim();
          const nom = snapshot.prenom ? snapshot.nom : null;
          const created = await prisma.beneluxContact.create({
            data: {
              companyId,
              prenom,
              nom,
              email: null,
              poste: snapshot.poste,
              perimetre: snapshot.perimetre,
              localisation: snapshot.localisation,
              priorite: snapshot.priorite,
              linkedinUrl: snapshot.linkedinUrl,
              language: snapshot.language === "en" ? "en" : "fr",
              source: snapshot.source === "AO" ? "AO" : "CARTO",
              outreachExcluded: snapshot.outreachExcluded,
              emailLookupStatus: "QUEUED",
              emailLookupQueuedAt: now,
              emailSuggested: snapshot.emailSuggested,
              createdById: session.user.id,
            },
            select: { id: true },
          });
          nextRefs.push({ id: created.id, market: "BENELUX", marqueId: companyId });
        }
      }
    }

    // Supprime les marchés retirés (après création du jumeau pour ne pas perdre la fiche).
    if (!wantFr && frContact) {
      await prisma.marqueContact.delete({ where: { id: frContact.id } });
    }
    if (!wantBe && beContact) {
      await prisma.beneluxContact.delete({ where: { id: beContact.id } });
    }

    const label =
      wantFr && wantBe ? "FR + BE" : wantFr ? "FR" : "BE";

    return NextResponse.json({
      ok: true,
      refs: nextRefs,
      markets: desired,
      message: `Marché mis à jour : ${label}.`,
    });
  } catch (error) {
    console.error("POST /api/outreach/email-lookup/set-markets:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
