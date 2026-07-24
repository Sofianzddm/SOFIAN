// src/app/api/download/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { S3_PUBLIC_BASE } from "@/lib/s3";

export const dynamic = "force-dynamic";

/**
 * Proxy de téléchargement authentifié.
 *
 * Les factures (talents, contrats, etc.) sont stockées sur un stockage externe
 * (Cloudinary / S3). En cross-origin, l'attribut HTML `download` est ignoré par
 * le navigateur : le fichier s'ouvre au lieu d'être téléchargé.
 *
 * Cette route récupère le fichier côté serveur (même origine que l'app) et le
 * renvoie avec `Content-Disposition: attachment`, ce qui force le téléchargement.
 *
 * Usage : /api/download?url=<url encodée>&filename=<nom optionnel>
 */

/** Hôtes autorisés pour éviter tout SSRF / open-proxy. */
function isAllowedHost(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  if (host === "res.cloudinary.com" || host.endsWith(".cloudinary.com")) return true;
  if (host.endsWith(".amazonaws.com")) return true;
  try {
    const s3Host = new URL(S3_PUBLIC_BASE).hostname.toLowerCase();
    if (s3Host && host === s3Host) return true;
  } catch {
    // S3_PUBLIC_BASE non configuré : on ignore.
  }
  return false;
}

function filenameFromUrl(url: URL): string {
  const last = url.pathname.split("/").filter(Boolean).pop() || "facture";
  return decodeURIComponent(last);
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const raw = request.nextUrl.searchParams.get("url");
  if (!raw) {
    return NextResponse.json({ error: "Paramètre 'url' manquant" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "URL invalide" }, { status: 400 });
  }

  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return NextResponse.json({ error: "Protocole non supporté" }, { status: 400 });
  }

  // Hôte non autorisé (ex. URLs de démo) : on redirige vers l'original.
  if (!isAllowedHost(target)) {
    return NextResponse.redirect(target.toString());
  }

  const upstream = await fetch(target.toString(), { cache: "no-store" });
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: "Fichier introuvable" },
      { status: upstream.status || 502 }
    );
  }

  const requested = request.nextUrl.searchParams.get("filename");
  const filename = (requested || filenameFromUrl(target)).replace(/["\r\n]/g, "");
  const contentType =
    upstream.headers.get("content-type") || "application/octet-stream";

  const headers = new Headers({
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "private, max-age=0, no-store",
  });
  const contentLength = upstream.headers.get("content-length");
  if (contentLength) headers.set("Content-Length", contentLength);

  return new NextResponse(upstream.body as any, { status: 200, headers });
}
