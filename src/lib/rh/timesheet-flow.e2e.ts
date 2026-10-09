/**
 * E2E RH : présence → feuille → validation → DocuSeal (+ notif inbox).
 *
 * Run: pnpm test:rh:e2e
 * Skip DocuSeal live: RH_E2E_SKIP_DOCUSEAL=1 pnpm test:rh:e2e
 */
import "dotenv/config";
import prisma from "@/lib/prisma";
import { setWorkDay } from "@/lib/rh/office";
import {
  decideTimesheet,
  getOrCreateTimesheet,
  requestTimesheetSignature,
  submitTimesheet,
  updateTimesheetDays,
} from "@/lib/rh/timesheet";
import { getRhSettings } from "@/lib/rh/settings";
import { isoWeekInfo } from "@/lib/rh/workflow";
import { isFrenchHoliday } from "@/lib/rh/holidays";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const email =
    process.env.RH_E2E_EMAIL?.trim() || "s.zeddam@glowupagence.fr";
  const skipDocuseal = process.env.RH_E2E_SKIP_DOCUSEAL === "1";
  const hasDocuseal = !!process.env.DOCUSEAL_API_KEY?.trim();

  const emp = await prisma.rhEmployee.findFirst({
    where: { user: { email }, actif: true },
    include: { user: { select: { id: true, email: true } } },
  });
  assert(emp, `Employé ${email} introuvable`);

  const reviewer =
    (await prisma.rhEmployee.findFirst({
      where: { rhRole: { in: ["HR", "MANAGER"] }, actif: true, NOT: { id: emp.id } },
      select: { id: true },
    })) || emp;

  // Semaine isolée loin dans le futur
  const ref = new Date("2098-06-08T12:00:00.000Z"); // lundi
  const info = isoWeekInfo(ref);
  console.log(`E2E week S${info.isoWeek}/${info.isoYear}`);

  // Cleanup préalable
  const existing = await prisma.rhTimesheet.findUnique({
    where: {
      employeeId_isoYear_isoWeek: {
        employeeId: emp.id,
        isoYear: info.isoYear,
        isoWeek: info.isoWeek,
      },
    },
  });
  if (existing) {
    if (existing.requestId) {
      await prisma.rhRequest.delete({ where: { id: existing.requestId } }).catch(() => {});
    }
    await prisma.rhTimesheet.delete({ where: { id: existing.id } });
  }
  await prisma.rhWorkDay.deleteMany({
    where: {
      employeeId: emp.id,
      date: { gte: info.weekStart, lte: info.weekEnd },
    },
  });

  const settings = await getRhSettings();
  const agreement = (emp.remoteAgreement === 2 || emp.remoteAgreement === 3
    ? emp.remoteAgreement
    : 0) as 0 | 2 | 3;

  // 1 · Présence (bureau)
  let presenceDays = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(info.weekStart);
    d.setUTCDate(info.weekStart.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6 || isFrenchHoliday(iso)) continue;
    await setWorkDay({
      employeeId: emp.id,
      date: d,
      place: "OFFICE",
      agreementDays: agreement,
    });
    presenceDays += 1;
  }
  assert(presenceDays >= 4, `présence insuffisante (${presenceDays})`);
  console.log(`✓ présence ${presenceDays} j bureau`);

  // 2 · Feuille de temps
  const { timesheet } = await getOrCreateTimesheet(
    emp.id,
    ref,
    emp.weeklyHours
  );
  const hm = (v: string) => {
    const [h, m] = v.split(":").map(Number);
    return h * 60 + (m || 0);
  };
  const daysPayload = timesheet.days.map((day) => {
    const iso = day.date.toISOString().slice(0, 10);
    const dow = new Date(iso + "T12:00:00").getDay();
    if (dow === 0 || dow === 6 || isFrenchHoliday(iso)) {
      return { date: iso, slots: [] as Array<{ from: string; to: string }>, breakMinutes: 0 };
    }
    const slots = dow === 5 ? settings.slotsFriday : settings.slotsWeekday;
    // Pause légale ≥ 20 min dès 6 h brutes
    const breakMinutes =
      settings.defaultBreakMinutes >= 20 ? settings.defaultBreakMinutes : 20;
    return { date: iso, slots, breakMinutes };
  });
  await updateTimesheetDays({
    timesheetId: timesheet.id,
    employeeId: emp.id,
    weeklyHours: emp.weeklyHours,
    days: daysPayload,
  });
  console.log("✓ feuille remplie (pause légale OK)");

  // 3 · Soumission
  const submitted = await submitTimesheet({
    timesheetId: timesheet.id,
    employeeId: emp.id,
  });
  assert(submitted.status === "SUBMITTED", `status submit=${submitted.status}`);
  assert(submitted.requestId, "requestId manquant");
  console.log("✓ soumise", submitted.requestId);

  // Notif manager/HR créée ?
  const notifAfterSubmit = await prisma.notification.findFirst({
    where: {
      titre: { contains: "Feuille de temps" },
      createdAt: { gte: new Date(Date.now() - 60_000) },
    },
    orderBy: { createdAt: "desc" },
  });
  assert(notifAfterSubmit, "notif inbox absente après soumission");
  console.log("✓ notif inbox soumission", notifAfterSubmit.id);

  // 4 · Validation manager
  await decideTimesheet({
    timesheetId: timesheet.id,
    reviewerId: reviewer.id,
    action: "approve",
  });
  const approved = await prisma.rhTimesheet.findUniqueOrThrow({
    where: { id: timesheet.id },
  });
  assert(approved.status === "APPROVED", `status approve=${approved.status}`);
  console.log("✓ validée");

  // 5 · DocuSeal
  if (skipDocuseal || !hasDocuseal) {
    console.log("↷ DocuSeal skip (RH_E2E_SKIP_DOCUSEAL ou clé absente)");
  } else {
    const signedReq = await requestTimesheetSignature({
      timesheetId: timesheet.id,
      actorId: reviewer.id,
    });
    const after = await prisma.rhTimesheet.findUniqueOrThrow({
      where: { id: timesheet.id },
    });
    assert(after.signatureRequestedAt, "signatureRequestedAt manquant");
    assert(after.docusealSubmissionId, "docusealSubmissionId manquant");
    assert(after.docusealSigningUrl, "docusealSigningUrl manquant");
    assert(after.pdfUrl, "pdfUrl manquant");

    const live = await fetch(
      `https://api.docuseal.com/submissions/${after.docusealSubmissionId}`,
      { headers: { "X-Auth-Token": process.env.DOCUSEAL_API_KEY! } }
    );
    assert(live.ok, `DocuSeal GET ${live.status}`);
    const detail = (await live.json()) as { status?: string };
    assert(
      detail.status === "pending" || detail.status === "awaiting",
      `DocuSeal status=${detail.status}`
    );

    const notifSign = await prisma.notification.findFirst({
      where: {
        userId: emp.user.id,
        titre: { contains: "DocuSeal" },
        createdAt: { gte: new Date(Date.now() - 60_000) },
      },
      orderBy: { createdAt: "desc" },
    });
    assert(notifSign, "notif inbox signature absente");

    console.log("✓ DocuSeal", after.docusealSubmissionId, after.docusealSigningUrl);
    console.log("✓ notif inbox signature", notifSign.id);
    void signedReq;
  }

  // Cleanup (garde DocuSeal live pour inspection manuelle si besoin)
  if (process.env.RH_E2E_KEEP === "1") {
    console.log("↷ cleanup skip (RH_E2E_KEEP=1)");
  } else {
    const final = await prisma.rhTimesheet.findUnique({ where: { id: timesheet.id } });
    if (final?.requestId) {
      await prisma.rhRequest.delete({ where: { id: final.requestId } }).catch(() => {});
    }
    await prisma.rhTimesheet.delete({ where: { id: timesheet.id } }).catch(() => {});
    await prisma.rhWorkDay.deleteMany({
      where: {
        employeeId: emp.id,
        date: { gte: info.weekStart, lte: info.weekEnd },
      },
    });
    console.log("✓ cleanup");
  }

  console.log("\nAll RH E2E checks passed.");
}

main()
  .catch((e) => {
    console.error("\nE2E FAILED:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
