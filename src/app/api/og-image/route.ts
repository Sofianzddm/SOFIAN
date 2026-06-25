import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy d'image same-origin.
 * Récupère une image distante (ex: og:image d'un Airbnb) et la renvoie depuis
 * notre domaine. Permet l'affichage sans souci de CORS et fiabilise l'export PDF
 * (html2canvas / useCORS ne "taint" plus le canvas).
 *
 *  GET /api/og-image?url=<url encodée>
 *
 * Volontairement public : utilisé par la page proposition (lien privé par token).
 */

export const runtime = "nodejs";

// Garde-fou SSRF basique : on n'autorise que http(s) vers des hôtes publics.
function isSafeHttpUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    return null;
  }
  return u;
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("url");
  if (!raw) {
    return NextResponse.json({ error: "Paramètre url manquant" }, { status: 400 });
  }

  const url = isSafeHttpUrl(raw);
  if (!url) {
    return NextResponse.json({ error: "URL invalide" }, { status: 400 });
  }

  try {
    const upstream = await fetch(url.toString(), {
      headers: {
        // Certains CDN renvoient un 403 sans User-Agent "navigateur".
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        Referer: `${url.protocol}//${url.host}/`,
      },
      redirect: "follow",
    });

    if (!upstream.ok) {
      return NextResponse.json({ error: "Image inaccessible" }, { status: 502 });
    }

    const contentType = upstream.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "La ressource n'est pas une image" }, { status: 415 });
    }

    const buffer = await upstream.arrayBuffer();
    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        // L'image d'une annonce change rarement : on met en cache agressivement.
        "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
      },
    });
  } catch (error) {
    console.error("GET /api/og-image:", error);
    return NextResponse.json({ error: "Erreur de proxy" }, { status: 500 });
  }
}
