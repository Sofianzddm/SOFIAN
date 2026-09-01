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

async function notifyUsers(
  users: Array<{ id: string; email: string | null }>,
  payload: { titre: string; message: string; lien: string; subject: string; html: string }
) {
  const seen = new Set<string>();
  const key = process.env.RESEND_API_KEY?.trim();
  const resend = key ? new Resend(key) : null;

  for (const u of users) {
    if (!u.id || seen.has(u.id)) continue;
    seen.add(u.id);
    try {
      await prisma.notification.create({
        data: {
          userId: u.id,
          type: "GENERAL",
          titre: payload.titre,
          message: payload.message,
          lien: payload.lien,
        },
      });
    } catch (e) {
      console.error("[rh.notify] notification", e);
    }
    if (resend && u.email) {
      try {
        await resend.emails.send({
          from: FROM,
          to: u.email,
          subject: payload.subject,
          html: payload.html,
        });
      } catch (e) {
        console.error("[rh.notify] email", u.email, e);
      }
    }
  }
}

function mailShell(title: string, body: string, href: string, cta: string) {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1A1110">
    <h2 style="font-size:18px;margin:0 0 8px">${title}</h2>
    <p style="font-size:14px;line-height:1.5;margin:0 0 16px">${body}</p>
    <a href="${href}"
       style="display:inline-block;background:#1A1110;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-size:14px;font-weight:600">
      ${cta}
    </a>
  </div>`;
}

/** Demande créée → manager + RH. */
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
    const users = [
      ...(emp.manager ? [emp.manager.user] : []),
      ...hrs.map((h) => h.user).filter((u) => u.id !== emp.userId),
    ];
    await notifyUsers(users, {
      titre: `RH · ${params.title}`,
      message: `${name} a soumis ${params.reference}`,
      lien: peopleUrl,
      subject: `[RH] ${params.title} — ${name}`,
      html: mailShell(
        params.title,
        `<strong>${name}</strong> a soumis une demande ${params.type} (${params.reference}).`,
        peopleUrl,
        "Ouvrir l'inbox RH"
      ),
    });
  } catch (e) {
    console.error("[rh.notify] created", e);
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
    const note = params.note ? `<br/>Motif : ${params.note}` : "";
    await notifyUsers([emp.user], {
      titre: `Demande ${verdict}`,
      message: `${params.reference} · ${params.title}`,
      lien: espace,
      subject: `[RH] ${params.reference} ${verdict}`,
      html: mailShell(
        `Demande ${verdict}`,
        `Ta demande <strong>${params.reference}</strong> (${params.title}) a été ${verdict}.${note}`,
        espace,
        "Ouvrir mon espace"
      ),
    });
  } catch (e) {
    console.error("[rh.notify] decision", e);
  }
}
