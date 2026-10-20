import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { v2 as cloudinary } from "cloudinary";
import { requireRhSessionFromRequest } from "@/lib/rh/auth";
import { addRhTaskAttachment } from "@/lib/rh/tasks";
import { isOnlyOfficeConfigured } from "@/lib/rh/onlyoffice";

type Ctx = { params: Promise<{ id: string }> };

/** Crée un classeur Excel vierge et l’attache à la tâche. */
export async function POST(request: NextRequest, ctx: Ctx) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const { id: taskId } = await ctx.params;

  let title = "Classeur.xlsx";
  try {
    const body = await request.json();
    if (typeof body?.fileName === "string" && body.fileName.trim()) {
      title = body.fileName.trim();
      if (!/\.xlsx$/i.test(title)) title = `${title}.xlsx`;
    }
  } catch {
    // body optionnel
  }

  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Glow Up Hub";
    wb.created = new Date();
    const sheet = wb.addWorksheet("Feuil1");
    sheet.getCell("A1").value = "Titre";
    sheet.getCell("B1").value = "Notes";
    sheet.getCell("A1").font = { bold: true };
    sheet.getCell("B1").font = { bold: true };
    sheet.getColumn(1).width = 24;
    sheet.getColumn(2).width = 40;

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const mime =
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const base64 = `data:${mime};base64,${buffer.toString("base64")}`;

    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });

    const uploaded = await cloudinary.uploader.upload(base64, {
      folder: "glowup-rh-tasks",
      public_id: `task-${taskId}-blank-${Date.now()}`,
      resource_type: "raw",
    });

    const task = await addRhTaskAttachment(session.employee, taskId, {
      fileName: title.slice(0, 240),
      fileUrl: uploaded.secure_url,
      mimeType: mime,
      sizeBytes: buffer.length,
    });

    const attachment = task?.attachments.find((a) => a.fileUrl === uploaded.secure_url);

    return NextResponse.json(
      {
        task,
        attachmentId: attachment?.id || null,
        onlyOfficeReady: isOnlyOfficeConfigured(),
      },
      { status: 201 }
    );
  } catch (e) {
    console.error("[rh.office] blank excel", e);
    const msg = e instanceof Error ? e.message : "Création impossible";
    const status = msg.includes("refusé")
      ? 403
      : msg.includes("introuvable")
        ? 404
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
