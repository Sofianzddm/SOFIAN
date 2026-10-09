import { NextRequest, NextResponse } from "next/server";
import type { RhDocKind } from "@prisma/client";
import { v2 as cloudinary } from "cloudinary";
import prisma from "@/lib/prisma";
import { isRhHr, requireRhSessionFromRequest } from "@/lib/rh/auth";
import { writeRhAudit } from "@/lib/rh/workflow";

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const KINDS: RhDocKind[] = [
  "CONTRACT",
  "AMENDMENT",
  "REMOTE_AGREEMENT",
  "COMPANY_AGREEMENT",
  "PAYSLIP",
  "MUTUELLE",
  "INSURANCE",
  "OTHER",
];

/** Upload document RH — RH only (dépose pour un collab). */
export async function POST(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session || !isRhHr(session.employee.rhRole)) {
    return NextResponse.json({ error: "Accès RH requis" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const employeeId = String(formData.get("employeeId") || "");
  const kind = String(formData.get("kind") || "OTHER") as RhDocKind;
  const rawTitle = formData.get("title");
  const title =
    (typeof rawTitle === "string" && rawTitle.trim()) ||
    (file instanceof File ? file.name : "Document");
  const period = formData.get("period") ? String(formData.get("period")) : null;

  if (!employeeId) {
    return NextResponse.json({ error: "employeeId requis" }, { status: 400 });
  }
  if (!KINDS.includes(kind)) {
    return NextResponse.json({ error: "Type de document invalide" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
  }
  if (file.size > 12 * 1024 * 1024) {
    return NextResponse.json({ error: "Fichier trop lourd (max 12 Mo)" }, { status: 400 });
  }
  if (file.type && !ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: "Format non accepté (PDF, JPG, PNG, WebP)" },
      { status: 400 }
    );
  }

  const emp = await prisma.rhEmployee.findUnique({ where: { id: employeeId } });
  if (!emp) {
    return NextResponse.json({ error: "Collaborateur introuvable" }, { status: 404 });
  }

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = `data:${file.type || "application/pdf"};base64,${buffer.toString("base64")}`;
    const uploaded = await cloudinary.uploader.upload(base64, {
      folder: "glowup-rh-docs",
      public_id: `doc-${employeeId}-${Date.now()}`,
      resource_type: "auto",
    });

    const doc = await prisma.rhDocument.create({
      data: {
        employeeId,
        kind,
        title: title || file.name,
        status: kind === "PAYSLIP" ? "ACTIVE" : "TO_REVIEW",
        url: uploaded.secure_url,
        period,
      },
    });

    await writeRhAudit({
      actorId: session.employee.id,
      targetId: employeeId,
      action: "document.upload",
      detail: { documentId: doc.id, kind },
    });

    return NextResponse.json({ document: doc }, { status: 201 });
  } catch (e) {
    console.error("[rh.doc.upload]", e);
    return NextResponse.json({ error: "Upload impossible" }, { status: 500 });
  }
}
