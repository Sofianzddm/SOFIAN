import jwt from "jsonwebtoken";
import { createHmac, timingSafeEqual } from "crypto";

export type OfficeDocType = "word" | "cell" | "slide";

const EXT_MAP: Record<
  string,
  { fileType: string; documentType: OfficeDocType }
> = {
  xlsx: { fileType: "xlsx", documentType: "cell" },
  xls: { fileType: "xls", documentType: "cell" },
  csv: { fileType: "csv", documentType: "cell" },
  docx: { fileType: "docx", documentType: "word" },
  doc: { fileType: "doc", documentType: "word" },
  pptx: { fileType: "pptx", documentType: "slide" },
  ppt: { fileType: "ppt", documentType: "slide" },
};

export function isOnlyOfficeConfigured(): boolean {
  return Boolean(
    process.env.ONLYOFFICE_URL?.trim() &&
      process.env.ONLYOFFICE_JWT_SECRET?.trim()
  );
}

export function onlyOfficeBaseUrl(): string {
  return (process.env.ONLYOFFICE_URL || "").replace(/\/$/, "");
}

export function onlyOfficeJwtSecret(): string {
  return process.env.ONLYOFFICE_JWT_SECRET?.trim() || "";
}

export function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export function officeMetaFromFileName(fileName: string): {
  fileType: string;
  documentType: OfficeDocType;
} | null {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  return EXT_MAP[ext] || null;
}

export function isOfficeEditableFile(fileName: string, mimeType?: string | null): boolean {
  if (officeMetaFromFileName(fileName)) return true;
  const m = (mimeType || "").toLowerCase();
  return (
    m.includes("spreadsheet") ||
    m.includes("excel") ||
    m === "text/csv" ||
    m.includes("wordprocessing") ||
    m.includes("msword") ||
    m.includes("presentation")
  );
}

/** Clé document OnlyOffice — doit changer après chaque save (URL / taille). */
export function buildDocumentKey(
  attachmentId: string,
  versionHint: string | number
): string {
  const hint = String(versionHint)
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(-24);
  const raw = `rh_${attachmentId}_${hint}`;
  return raw.replace(/[^a-zA-Z0-9._=-]/g, "_").slice(0, 120);
}

export function signOfficeToken(payload: Record<string, unknown>): string {
  return jwt.sign(payload, onlyOfficeJwtSecret(), {
    algorithm: "HS256",
    expiresIn: "3h",
  });
}

export function verifyOfficeToken<T extends object = Record<string, unknown>>(
  token: string
): T | null {
  try {
    return jwt.verify(token, onlyOfficeJwtSecret(), {
      algorithms: ["HS256"],
    }) as T;
  } catch {
    return null;
  }
}

/** Token court pour que OnlyOffice fetch le fichier sans session cookie. */
export function signFileAccessToken(params: {
  attachmentId: string;
  taskId: string;
}): string {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 3; // 3h
  const body = `${params.taskId}.${params.attachmentId}.${exp}`;
  const sig = createHmac("sha256", onlyOfficeJwtSecret())
    .update(body)
    .digest("hex");
  return Buffer.from(`${body}.${sig}`).toString("base64url");
}

export function verifyFileAccessToken(
  token: string
): { taskId: string; attachmentId: string } | null {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf8");
    const [taskId, attachmentId, expStr, sig] = raw.split(".");
    if (!taskId || !attachmentId || !expStr || !sig) return null;
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return null;
    const body = `${taskId}.${attachmentId}.${expStr}`;
    const expected = createHmac("sha256", onlyOfficeJwtSecret())
      .update(body)
      .digest("hex");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return { taskId, attachmentId };
  } catch {
    return null;
  }
}

export function buildEditorConfig(params: {
  fileName: string;
  documentKey: string;
  documentUrl: string;
  callbackUrl: string;
  user: { id: string; name: string };
  mode?: "edit" | "view";
}) {
  const meta = officeMetaFromFileName(params.fileName);
  if (!meta) throw new Error("Format non éditable dans OnlyOffice");

  const config = {
    document: {
      fileType: meta.fileType,
      key: params.documentKey,
      title: params.fileName,
      url: params.documentUrl,
      permissions: {
        edit: params.mode !== "view",
        download: true,
        print: true,
        review: false,
        comment: true,
      },
    },
    documentType: meta.documentType,
    editorConfig: {
      mode: params.mode || "edit",
      lang: "fr",
      callbackUrl: params.callbackUrl,
      user: {
        id: params.user.id,
        name: params.user.name,
      },
      customization: {
        forcesave: true,
        autosave: true,
        compactHeader: true,
        feedback: false,
        help: false,
      },
    },
  };

  const token = signOfficeToken(config as unknown as Record<string, unknown>);
  return {
    ...config,
    token,
  };
}

export function onlyOfficeScriptUrl(): string {
  return `${onlyOfficeBaseUrl()}/web-apps/apps/api/documents/api.js`;
}
