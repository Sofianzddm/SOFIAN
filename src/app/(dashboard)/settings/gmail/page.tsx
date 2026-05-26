import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import GmailSettingsClient from "./GmailSettingsClient";

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
    <GmailSettingsClient
      connectedAt={token ? token.updatedAt.toISOString() : null}
      defaultRecipient={session.user.email || ""}
    />
  );
}
