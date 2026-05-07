import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const LICORICE = "#1A1110";
const OLD_ROSE = "#C08B8B";
const TEA_GREEN = "#C8F285";
const OLD_LACE = "#F5EBE0";
const LEYNA_EMAIL = "leyna@glowupagence.fr";

export default async function GmailSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const role = (session.user as { role?: string }).role;
  if (role !== "ADMIN") redirect("/dashboard");

  const token = await prisma.gmailToken.findUnique({
    where: { email: LEYNA_EMAIL },
    select: { updatedAt: true },
  });

  return (
    <div className="space-y-6" style={{ fontFamily: "Switzer, system-ui, sans-serif" }}>
      <header>
        <h1
          className="text-3xl font-semibold tracking-tight"
          style={{ color: LICORICE, fontFamily: "Spectral, serif" }}
        >
          Connexion Gmail Leyna
        </h1>
      </header>

      <section
        className="rounded-2xl border p-6 bg-white space-y-4"
        style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}
      >
        {token ? (
          <>
            <span
              className="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium"
              style={{ backgroundColor: TEA_GREEN, color: LICORICE }}
            >
              ✅ Boite Gmail connectée
            </span>
            <p className="text-sm" style={{ color: LICORICE }}>
              Connectée le {new Date(token.updatedAt).toLocaleString("fr-FR")}
            </p>
            <Link
              href="/api/auth/gmail"
              className="inline-flex items-center rounded-xl border px-4 py-2 text-sm"
              style={{ borderColor: OLD_ROSE, color: LICORICE, backgroundColor: OLD_LACE }}
            >
              Reconnecter
            </Link>
          </>
        ) : (
          <Link
            href="/api/auth/gmail"
            className="inline-flex items-center rounded-xl px-4 py-2 text-sm font-medium"
            style={{ backgroundColor: TEA_GREEN, color: LICORICE }}
          >
            🔗 Connecter la boite de Leyna
          </Link>
        )}
      </section>
    </div>
  );
}
