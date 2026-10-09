import prisma from "@/lib/prisma";
import { displayName } from "@/lib/rh/auth";
import {
  buildTimesheetPdfData,
  renderTimesheetPdfBuffer,
  uploadTimesheetPdf,
} from "@/lib/rh/timesheet-pdf";

const DOCUSEAL_SUBMISSIONS_PDF = "https://api.docuseal.com/submissions/pdf";
const DOCUSEAL_SIGNING_BASE = (
  process.env.NEXT_PUBLIC_DOCUSEAL_URL || "https://docuseal.com"
).replace(/\/$/, "");

type DocuSealSubmitter = {
  email?: string;
  name?: string;
  role?: string;
  slug?: string | null;
  embed_src?: string | null;
  url?: string | null;
  submission_url?: string | null;
  submission_id?: number;
  id?: number;
};

function getSubmitterSigningUrl(s: DocuSealSubmitter): string | null {
  const raw =
    s.embed_src?.trim() ||
    s.url?.trim() ||
    s.submission_url?.trim() ||
    (s.slug?.trim() ? `${DOCUSEAL_SIGNING_BASE}/s/${s.slug.trim()}` : "");
  return raw && raw.startsWith("http") ? raw : null;
}

/**
 * Génère le PDF (tags DocuSeal) + crée une submission DocuSeal
 * pour signature du collaborateur.
 */
export async function sendTimesheetToDocuSeal(timesheetId: string): Promise<{
  pdfUrl: string | null;
  submissionId: string;
  signingUrl: string | null;
}> {
  const key = process.env.DOCUSEAL_API_KEY?.trim();
  if (!key) {
    throw new Error("DocuSeal n’est pas configuré (DOCUSEAL_API_KEY)");
  }

  const ts = await prisma.rhTimesheet.findUniqueOrThrow({
    where: { id: timesheetId },
    include: {
      employee: {
        include: {
          user: { select: { prenom: true, nom: true, email: true } },
        },
      },
    },
  });

  const email = ts.employee.user.email?.trim();
  if (!email) throw new Error("Le collaborateur n’a pas d’email");

  const name = displayName(ts.employee.user);
  const data = await buildTimesheetPdfData(timesheetId, { signed: false });
  data.signatureRequested = true;
  const buffer = await renderTimesheetPdfBuffer(data);

  let pdfUrl: string | null = null;
  try {
    pdfUrl = await uploadTimesheetPdf({
      timesheetId,
      employeeId: ts.employeeId,
      buffer,
      kind: "request",
    });
  } catch (e) {
    console.error("[rh.docuseal] cloudinary upload", e);
  }

  const docName = `Feuille de temps S${ts.isoWeek}-${ts.isoYear} — ${name}`;
  const payload = {
    name: docName,
    send_email: false, // email Glow Up via notify
    documents: [
      {
        name: `FT-S${ts.isoWeek}-${ts.isoYear}`,
        file: buffer.toString("base64"),
      },
    ],
    submitters: [
      {
        role: "Collaborateur",
        email,
        name,
        external_id: timesheetId,
        send_email: false,
      },
    ],
  };

  const res = await fetch(DOCUSEAL_SUBMISSIONS_PDF, {
    method: "POST",
    headers: {
      "X-Auth-Token": key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[rh.docuseal] submissions/pdf", res.status, errText);
    throw new Error(`Erreur DocuSeal: ${errText || res.statusText}`);
  }

  const raw = await res.json();
  // Réponse : array de submitters OU objet submission avec submitters[]
  const asObj = (!Array.isArray(raw) ? raw : null) as
    | { id?: number; submitters?: DocuSealSubmitter[] }
    | null;
  const list = (
    Array.isArray(raw)
      ? raw
      : Array.isArray(asObj?.submitters)
        ? asObj!.submitters
        : [raw]
  ) as DocuSealSubmitter[];
  const first = list[0];
  let submissionId =
    first?.submission_id != null
      ? String(first.submission_id)
      : asObj?.id != null
        ? String(asObj.id)
        : first?.id != null
          ? String(first.id)
          : "";
  if (!submissionId) {
    console.error("[rh.docuseal] response", raw);
    throw new Error("Réponse DocuSeal invalide (submission_id manquant)");
  }

  let signingUrl = first ? getSubmitterSigningUrl(first) : null;

  // Fallback : GET submission pour récupérer le slug signataire
  if (!signingUrl) {
    try {
      const detailRes = await fetch(
        `https://api.docuseal.com/submissions/${submissionId}`,
        { headers: { "X-Auth-Token": key } }
      );
      if (detailRes.ok) {
        const detail = (await detailRes.json()) as {
          id?: number;
          submitters?: DocuSealSubmitter[];
        };
        if (detail.id != null) submissionId = String(detail.id);
        const collab =
          detail.submitters?.find((s) => s.role === "Collaborateur") ||
          detail.submitters?.[0];
        if (collab) signingUrl = getSubmitterSigningUrl(collab);
      }
    } catch (e) {
      console.error("[rh.docuseal] fetch submission", e);
    }
  }

  await prisma.rhTimesheet.update({
    where: { id: timesheetId },
    data: {
      pdfUrl: pdfUrl ?? undefined,
      docusealSubmissionId: submissionId,
      docusealSigningUrl: signingUrl,
    },
  });

  return { pdfUrl, submissionId, signingUrl };
}

/**
 * Envoi mensuel : les ~4 feuilles APPROVED du collab → 1 submission DocuSeal
 * (plusieurs PDF, une signature).
 */
export async function sendMonthlyTimesheetsToDocuSeal(params: {
  employeeId: string;
  year: number;
  month: number; // 1-12
  timesheetIds: string[];
}): Promise<{
  submissionId: string;
  signingUrl: string | null;
  pdfUrls: string[];
  weekCount: number;
}> {
  const key = process.env.DOCUSEAL_API_KEY?.trim();
  if (!key) {
    throw new Error("DocuSeal n’est pas configuré (DOCUSEAL_API_KEY)");
  }
  if (!params.timesheetIds.length) {
    throw new Error("Aucune feuille à envoyer");
  }

  const emp = await prisma.rhEmployee.findUniqueOrThrow({
    where: { id: params.employeeId },
    include: {
      user: { select: { prenom: true, nom: true, email: true } },
    },
  });
  const email = emp.user.email?.trim();
  if (!email) throw new Error("Le collaborateur n’a pas d’email");
  const name = displayName(emp.user);

  const sheets = await prisma.rhTimesheet.findMany({
    where: { id: { in: params.timesheetIds }, employeeId: params.employeeId },
    orderBy: [{ isoYear: "asc" }, { isoWeek: "asc" }],
  });

  const documents: Array<{ name: string; file: string }> = [];
  const pdfUrls: string[] = [];

  for (const ts of sheets) {
    const data = await buildTimesheetPdfData(ts.id, { signed: false });
    data.signatureRequested = true;
    const buffer = await renderTimesheetPdfBuffer(data);
    documents.push({
      name: `FT-S${ts.isoWeek}-${ts.isoYear}`,
      file: buffer.toString("base64"),
    });
    try {
      const url = await uploadTimesheetPdf({
        timesheetId: ts.id,
        employeeId: params.employeeId,
        buffer,
        kind: "request",
      });
      pdfUrls.push(url);
      await prisma.rhTimesheet.update({
        where: { id: ts.id },
        data: { pdfUrl: url },
      });
    } catch (e) {
      console.error("[rh.docuseal] monthly upload", ts.id, e);
    }
  }

  const monthLabel = String(params.month).padStart(2, "0");
  const payload = {
    name: `Feuilles de temps ${monthLabel}/${params.year} — ${name} (${sheets.length} semaines)`,
    send_email: false,
    documents,
    submitters: [
      {
        role: "Collaborateur",
        email,
        name,
        external_id: `monthly-${params.employeeId}-${params.year}-${params.month}`,
        send_email: false,
      },
    ],
  };

  const res = await fetch(DOCUSEAL_SUBMISSIONS_PDF, {
    method: "POST",
    headers: {
      "X-Auth-Token": key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[rh.docuseal] monthly submissions/pdf", res.status, errText);
    throw new Error(`Erreur DocuSeal: ${errText || res.statusText}`);
  }

  const raw = await res.json();
  const asObj = (!Array.isArray(raw) ? raw : null) as
    | { id?: number; submitters?: DocuSealSubmitter[] }
    | null;
  const list = (
    Array.isArray(raw)
      ? raw
      : Array.isArray(asObj?.submitters)
        ? asObj!.submitters
        : [raw]
  ) as DocuSealSubmitter[];
  const first = list[0];
  let submissionId =
    first?.submission_id != null
      ? String(first.submission_id)
      : asObj?.id != null
        ? String(asObj.id)
        : first?.id != null
          ? String(first.id)
          : "";
  if (!submissionId) {
    throw new Error("Réponse DocuSeal invalide (submission_id manquant)");
  }

  let signingUrl = first ? getSubmitterSigningUrl(first) : null;
  if (!signingUrl) {
    try {
      const detailRes = await fetch(
        `https://api.docuseal.com/submissions/${submissionId}`,
        { headers: { "X-Auth-Token": key } }
      );
      if (detailRes.ok) {
        const detail = (await detailRes.json()) as {
          id?: number;
          submitters?: DocuSealSubmitter[];
        };
        if (detail.id != null) submissionId = String(detail.id);
        const collab =
          detail.submitters?.find((s) => s.role === "Collaborateur") ||
          detail.submitters?.[0];
        if (collab) signingUrl = getSubmitterSigningUrl(collab);
      }
    } catch (e) {
      console.error("[rh.docuseal] monthly fetch submission", e);
    }
  }

  const now = new Date();
  await prisma.rhTimesheet.updateMany({
    where: { id: { in: sheets.map((s) => s.id) } },
    data: {
      signatureRequestedAt: now,
      docusealSubmissionId: submissionId,
      docusealSigningUrl: signingUrl,
    },
  });

  return {
    submissionId,
    signingUrl,
    pdfUrls,
    weekCount: sheets.length,
  };
}

/** Marque toutes les feuilles liées à la submission DocuSeal → SIGNED. */
export async function completeTimesheetFromDocuSeal(params: {
  submissionId: string;
  signedPdfUrl?: string | null;
  signatureName?: string | null;
}) {
  const matching = await prisma.rhTimesheet.findMany({
    where: { docusealSubmissionId: params.submissionId },
  });
  if (!matching.length) return null;

  await prisma.rhTimesheet.updateMany({
    where: { docusealSubmissionId: params.submissionId },
    data: {
      status: "SIGNED",
      signedAt: new Date(),
      signatureName: params.signatureName ?? undefined,
      signedPdfUrl: params.signedPdfUrl ?? undefined,
    },
  });

  return matching[0];
}
