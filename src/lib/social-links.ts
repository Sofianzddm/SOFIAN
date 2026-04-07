export function normalizeInstagramHandle(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;

  if (/^(https?:)?\/\//i.test(raw) || raw.toLowerCase().includes("instagram.com/")) {
    const withProtocol = /^(https?:)?\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const u = new URL(withProtocol);
      if (!u.hostname.toLowerCase().includes("instagram.com")) return null;
      const handle = u.pathname.replace(/^\/+/, "").split("/")[0]?.trim();
      return handle || null;
    } catch {
      return null;
    }
  }

  return raw.replace(/^@/, "").trim() || null;
}

export function getInstagramProfileUrl(value: string | null | undefined): string | null {
  const handle = normalizeInstagramHandle(value);
  if (!handle) return null;
  return `https://instagram.com/${encodeURIComponent(handle)}`;
}
