import { Resend } from "resend";
import prisma from "@/lib/prisma";
import { displayName } from "@/lib/rh/auth";

const FROM = "Glow Up RH <contact@glowupagence.fr>";

function baseUrl() {
  return (process.env.NEXT_PUBLIC_BASE_URL || "https://app.glowupagence.fr").replace(
    /\/$/,
    ""
  );
}

async function recipientsForEmployee(employeeId: string) {
  const emp = await prisma.rhEmployee.findUnique({
    where: { id: employeeId },
    include: {
      user: { select: { id: true, email: true, prenom: true, nom: true } },
      manager: {
        include: { user: { select: { id: true, email: true, prenom: true, nom: true } } },
      },
    },
  });
  const hrs = await prisma.rhEmployee.findMany({
    where: { rhRole: "HR", actif: true },
    include: { user: { select: { id: true, email: true, prenom: true, nom: true } } },
  });
  return { emp, hrs };
}

/** Emails d’alerte RH (SAZ, Maud…) — même sans compte plateforme. */
export function rhAlertEmails(): string[] {
  const raw =
    process.env.RH_ALERT_EMAILS?.trim() ||
    [process.env.RH_WEEKEND_ALERT_EMAIL, "sofian@glowupagence.fr", "maud@glowupagence.fr"]
      .filter(Boolean)
      .join(",");
  return [
    ...new Set(
      raw
        .split(/[,;\s]+/)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.includes("@"))
    ),
  ];
}

async function notifyUsers(
  users: Array<{ id?: string | null; email: string | null }>,
  payload: { titre: string; message: string; lien: string; subject: string; html: string }
) {
  const seenIds = new Set<string>();
  const seenEmails = new Set<string>();
  const key = process.env.RESEND_API_KEY?.trim();
  const resend = key ? new Resend(key) : null;

  for (const u of users) {
    const userId = u.id?.trim() || null;
    const email = u.email?.trim().toLowerCase() || null;

    // Inbox in-app — ne pas `continue` ici : l’email doit quand même partir
    if (userId && !seenIds.has(userId)) {
      seenIds.add(userId);
      try {
        const exists = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true },
        });
        if (exists) {
          await prisma.notification.create({
            data: {
              userId,
              type: "GENERAL",
              titre: payload.titre.slice(0, 200),
              message: payload.message.slice(0, 2000),
              lien: payload.lien.slice(0, 500),
            },
          });
        } else {
          console.warn("[rh.notify] userId inconnu, skip inbox", userId);
        }
      } catch (e) {
        console.error("[rh.notify] notification", userId, e);
      }
    }

    if (resend && email && !seenEmails.has(email)) {
      seenEmails.add(email);
      try {
        await resend.emails.send({
          from: FROM,
          to: email,
          subject: payload.subject,
          html: payload.html,
        });
      } catch (e) {
        console.error("[rh.notify] email", email, e);
      }
    }
  }
}

async function alertUsers() {
  const emails = rhAlertEmails();
  const found = await prisma.user.findMany({
    where: { email: { in: emails, mode: "insensitive" } },
    select: { id: true, email: true },
  });
  const byEmail = new Map(
    found.map((u) => [u.email!.toLowerCase(), u])
  );
  return emails.map((email) => {
    const u = byEmail.get(email);
    return u ? { id: u.id, email: u.email } : { id: null, email };
  });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const LOGO_URL = "https://app.glowupagence.fr/Logo.png";

/** Shell mail RH aligné D.A. Glow Up (comme Approbation / Signature). */
function mailShell(
  title: string,
  body: string,
  href: string,
  cta: string,
  opts?: { eyebrow?: string; preview?: string }
) {
  const year = new Date().getFullYear();
  const eyebrow = opts?.eyebrow || "Glow Up RH";
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#F5EBE0;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1A1110;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5EBE0;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(180deg,#1A1110 0%,#3D1515 100%);padding:32px 28px 28px;text-align:center;border-radius:16px 16px 0 0;">
            <img src="${LOGO_URL}" alt="Glow Up" width="160" height="28" style="display:inline-block;border:0;outline:none;"/>
            <p style="margin:14px 0 0;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#C08B8B;font-weight:600;">${escapeHtml(eyebrow)}</p>
          </td>
        </tr>
        <!-- Card -->
        <tr>
          <td style="background:#FFFFFF;padding:32px 28px;border-left:1px solid #EDE4D8;border-right:1px solid #EDE4D8;">
            <h1 style="margin:0 0 14px;font-size:22px;line-height:1.25;font-weight:700;letter-spacing:-0.02em;color:#1A1110;">${escapeHtml(title)}</h1>
            <div style="font-size:15px;line-height:1.6;color:#3D3330;margin:0 0 24px;">${body}</div>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
              <tr>
                <td style="border-radius:999px;background:#C8F285;">
                  <a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 28px;font-size:14px;font-weight:700;color:#1A1110;text-decoration:none;letter-spacing:-0.01em;">${escapeHtml(cta)}</a>
                </td>
              </tr>
            </table>
            <p style="margin:18px 0 0;font-size:12px;line-height:1.45;color:#8A7A74;">
              Si le bouton ne fonctionne pas,&nbsp;<a href="${escapeHtml(href)}" style="color:#C08B8B;text-decoration:underline;">ouvre ce lien</a>.
            </p>
          </td>
        </tr>
        <!-- Accent bar -->
        <tr>
          <td style="height:4px;background:linear-gradient(90deg,#C8F285 0%,#C08B8B 100%);font-size:0;line-height:0;">&nbsp;</td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#F5EDE0;padding:24px 28px 28px;text-align:center;border-radius:0 0 16px 16px;border:1px solid #EDE4D8;border-top:0;">
            <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#1A1110;">Glow Up Agence</p>
            <p style="margin:0 0 4px;font-size:12px;line-height:1.45;color:#8A7A74;">1330 avenue Jean-René Guillibert Gautier de La Lauzière, 13290 Aix-en-Provence</p>
            <p style="margin:0 0 8px;font-size:12px;color:#8A7A74;">SIRET : 921 034 146 00024</p>
            <a href="mailto:contact@glowupagence.fr" style="font-size:12px;color:#C08B8B;text-decoration:none;">contact@glowupagence.fr</a>
            <p style="margin:12px 0 0;font-size:11px;color:#A89890;">© ${year} Glow Up Agence. Tous droits réservés.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Demande créée → admin RH uniquement (inbox People). */
export async function notifyRhRequestCreated(params: {
  employeeId: string;
  title: string;
  reference: string;
  type: string;
}) {
  try {
    const { emp, hrs } = await recipientsForEmployee(params.employeeId);
    if (!emp) return;
    const name = displayName(emp.user);
    const peopleUrl = `${baseUrl()}/rh/people`;
    const alerts = await alertUsers();
    const users = [
      ...hrs.map((h) => h.user).filter((u) => u.id !== emp.userId),
      ...alerts,
    ];
    await notifyUsers(users, {
      titre: `RH · ${params.title}`,
      message: `${name} a soumis ${params.reference}`,
      lien: peopleUrl,
      subject: `[RH] ${params.title} — ${name}`,
      html: mailShell(
        params.title,
        `<p style="margin:0 0 12px"><strong>${escapeHtml(name)}</strong> a soumis une demande <strong>${escapeHtml(params.type)}</strong>.</p>
         <div style="background:#F5EDE0;border-left:4px solid #C08B8B;border-radius:0 12px 12px 0;padding:12px 16px;font-size:14px;">
           Réf. <strong>${escapeHtml(params.reference)}</strong>
         </div>`,
        peopleUrl,
        "Ouvrir l'inbox RH",
        { eyebrow: "Nouvelle demande RH" }
      ),
    });
  } catch (e) {
    console.error("[rh.notify] created", e);
  }
}

/** Saisie week-end / férié sur feuille de temps → SAZ + manager + RH (Maud). */
export async function notifyTimesheetWeekend(params: {
  employeeId: string;
  isoWeek: number;
  dates: string[];
}) {
  try {
    const { emp, hrs } = await recipientsForEmployee(params.employeeId);
    if (!emp) return;
    const name = displayName(emp.user);
    const peopleUrl = `${baseUrl()}/rh/people`;
    const alerts = await alertUsers();
    const users = [
      ...alerts,
      ...(emp.manager ? [emp.manager.user] : []),
      ...hrs.map((h) => h.user),
    ];
    const datesLabel = params.dates.join(", ");
    await notifyUsers(users, {
      titre: `Feuille S${params.isoWeek} · week-end / férié`,
      message: `${name} a saisi ${datesLabel}`,
      lien: peopleUrl,
      subject: `[RH] Urgence week-end — S${params.isoWeek} · ${name}`,
      html: mailShell(
        `Saisie week-end / férié`,
        `<p style="margin:0 0 12px"><strong>${escapeHtml(name)}</strong> a déclaré des heures hors jours ouvrés.</p>
         <div style="background:#F5EDE0;border-left:4px solid #C08B8B;border-radius:0 12px 12px 0;padding:12px 16px;font-size:14px;">
           Semaine <strong>${params.isoWeek}</strong><br/>Dates : <strong>${escapeHtml(datesLabel)}</strong>
         </div>`,
        peopleUrl,
        "Ouvrir l'inbox RH",
        { eyebrow: "Alerte temps" }
      ),
    });
  } catch (e) {
    console.error("[rh.notify] weekend", e);
  }
}

/** Demande de signature feuille de temps → collaborateur (DocuSeal). */
export async function notifyTimesheetSignatureRequest(params: {
  employeeId: string;
  isoWeek: number;
  isoYear: number;
  pdfUrl?: string | null;
  signingUrl?: string | null;
}) {
  try {
    const emp = await prisma.rhEmployee.findUnique({
      where: { id: params.employeeId },
      include: { user: { select: { id: true, email: true, prenom: true, nom: true } } },
    });
    if (!emp) return;
    const espace = `${baseUrl()}/rh/espace?tab=time`;
    const signHref = params.signingUrl || espace;
    const pdfLine = params.pdfUrl
      ? `<p style="margin:14px 0 0"><a href="${escapeHtml(params.pdfUrl)}" style="color:#C08B8B;font-weight:600;text-decoration:underline">Voir le PDF</a></p>`
      : "";
    const prenom = emp.user.prenom || "bonjour";
    await notifyUsers([emp.user], {
      titre: `Signature DocuSeal · S${params.isoWeek}`,
      message: `Feuille S${params.isoWeek} ${params.isoYear} à signer électroniquement`,
      lien: signHref,
      subject: `[RH] Signature DocuSeal — feuille S${params.isoWeek}`,
      html: mailShell(
        "Ta feuille est prête à signer",
        `<p style="margin:0 0 12px">Bonjour ${escapeHtml(prenom)},</p>
         <p style="margin:0 0 12px">Ta feuille de temps <strong>semaine ${params.isoWeek}</strong> (${params.isoYear}) a été validée. Signe-la pour clôturer.</p>
         <div style="background:#F5EDE0;border-left:4px solid #C8F285;border-radius:0 12px 12px 0;padding:12px 16px;font-size:14px;">
           Signature électronique sécurisée via DocuSeal
         </div>${pdfLine}`,
        signHref,
        "Signer sur DocuSeal",
        { eyebrow: "Espace collaborateur" }
      ),
    });
  } catch (e) {
    console.error("[rh.notify] signature", e);
  }
}

/** Batch mensuel (~4 feuilles) → 1 lien DocuSeal. */
export async function notifyTimesheetMonthlySignature(params: {
  employeeId: string;
  year: number;
  month: number;
  weekCount: number;
  weeks: number[];
  signingUrl?: string | null;
  pdfUrl?: string | null;
}) {
  try {
    const emp = await prisma.rhEmployee.findUnique({
      where: { id: params.employeeId },
      include: {
        user: { select: { id: true, email: true, prenom: true, nom: true } },
      },
    });
    if (!emp) return;
    const monthLabel = String(params.month).padStart(2, "0");
    const weeksLabel = params.weeks.map((w) => `S${w}`).join(", ");
    const espace = `${baseUrl()}/rh/espace?tab=time`;
    const signHref = params.signingUrl || espace;
    const pdfLine = params.pdfUrl
      ? `<p style="margin:14px 0 0"><a href="${escapeHtml(params.pdfUrl)}" style="color:#C08B8B;font-weight:600;text-decoration:underline">Voir un PDF</a></p>`
      : "";
    const prenom = emp.user.prenom || "bonjour";
    await notifyUsers([emp.user], {
      titre: `Signature mensuelle · ${monthLabel}/${params.year}`,
      message: `${params.weekCount} feuille(s) (${weeksLabel}) à signer sur DocuSeal`,
      lien: signHref,
      subject: `[RH] Signature DocuSeal — ${params.weekCount} feuilles ${monthLabel}/${params.year}`,
      html: mailShell(
        `Feuilles ${monthLabel}/${params.year}`,
        `<p style="margin:0 0 12px">Bonjour ${escapeHtml(prenom)},</p>
         <p style="margin:0 0 12px">Tes <strong>${params.weekCount} feuilles de temps</strong> sont validées. Signe-les en une fois.</p>
         <div style="background:#F5EDE0;border-left:4px solid #C8F285;border-radius:0 12px 12px 0;padding:12px 16px;font-size:14px;">
           ${escapeHtml(weeksLabel)}
         </div>${pdfLine}`,
        signHref,
        "Signer mes feuilles du mois",
        { eyebrow: "Espace collaborateur" }
      ),
    });
  } catch (e) {
    console.error("[rh.notify] monthly signature", e);
  }
}

/** Décision → le salarié. */
export async function notifyRhDecision(params: {
  employeeId: string;
  title: string;
  reference: string;
  approved: boolean;
  note?: string;
}) {
  try {
    const emp = await prisma.rhEmployee.findUnique({
      where: { id: params.employeeId },
      include: { user: { select: { id: true, email: true, prenom: true, nom: true } } },
    });
    if (!emp) return;
    const verdict = params.approved ? "approuvée" : "refusée";
    const espace = `${baseUrl()}/rh/espace`;
    const note = params.note
      ? `<p style="margin:12px 0 0;font-size:14px;color:#3D3330"><em>Motif : ${escapeHtml(params.note)}</em></p>`
      : "";
    const prenom = emp.user.prenom || "bonjour";
    const accent = params.approved ? "#C8F285" : "#C08B8B";
    await notifyUsers([emp.user], {
      titre: `Demande ${verdict}`,
      message: `${params.reference} · ${params.title}`,
      lien: espace,
      subject: `[RH] ${params.reference} ${verdict}`,
      html: mailShell(
        `Demande ${verdict}`,
        `<p style="margin:0 0 12px">Bonjour ${escapeHtml(prenom)},</p>
         <p style="margin:0 0 12px">Ta demande a été <strong>${verdict}</strong>.</p>
         <div style="background:#F5EDE0;border-left:4px solid ${accent};border-radius:0 12px 12px 0;padding:12px 16px;font-size:14px;">
           <strong>${escapeHtml(params.reference)}</strong><br/>${escapeHtml(params.title)}
         </div>${note}`,
        espace,
        "Ouvrir mon espace",
        { eyebrow: "Espace collaborateur" }
      ),
    });
  } catch (e) {
    console.error("[rh.notify] decision", e);
  }
}
