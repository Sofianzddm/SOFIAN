import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { canAccessStrategy } from "@/app/api/strategy/_utils";

/**
 * Extrait l'aperçu (image og:image) d'une page web.
 * Utilisé par le builder de proposition pour pré-remplir l'image d'un lien
 * logistique (chalet Airbnb, etc.) au moment de la saisie.
 *
 *  GET /api/link-preview?url=<url encodée>  →  { image, title }
 *
 * Réservé à l'agence (rôles stratégie / admin).
 */

export const runtime = "nodejs";

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

function extractMeta(html: string, base: URL) {
  const pick = (patterns: RegExp[]): string | null => {
    for (const re of patterns) {
      const m = html.match(re);
      if (m?.[1]) return m[1].trim();
    }
    return null;
  };

  const decode = (s: string) =>
    s
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");

  const rawImage = pick([
    /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']twitter:image:src["'][^>]+content=["']([^"']+)["']/i,
  ]);

  const rawTitle = pick([
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    /<title[^>]*>([^<]+)<\/title>/i,
  ]);

  let image: string | null = null;
  if (rawImage) {
    try {
      image = new URL(decode(rawImage), base).toString();
    } catch {
      image = null;
    }
  }

  return { image, title: rawTitle ? decode(rawTitle) : null };
}

export async function GET(request: NextRequest) {
  const session = await getAppSession(request);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (!canAccessStrategy(String(session.user.role || ""))) {
    return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
  }

  const raw = request.nextUrl.searchParams.get("url");
  if (!raw) {
    return NextResponse.json({ error: "Paramètre url manquant" }, { status: 400 });
  }
  const url = isSafeHttpUrl(raw);
  if (!url) {
    return NextResponse.json({ error: "URL invalide" }, { status: 400 });
  }

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Page inaccessible", image: null }, { status: 502 });
    }
    // On ne lit qu'un début de page : les balises OG sont dans le <head>.
    const html = (await res.text()).slice(0, 600_000);
    const meta = extractMeta(html, new URL(res.url || url.toString()));
    return NextResponse.json(meta);
  } catch (error) {
    console.error("GET /api/link-preview:", error);
    return NextResponse.json({ error: "Erreur lors de la récupération", image: null }, { status: 500 });
  }
}
