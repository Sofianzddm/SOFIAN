import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import GmailSettingsClient from "./GmailSettingsClient";

export default async function GmailSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const role = (session.user as { role?: string }).role;
  // ADMIN : gestion complète ; BD (Joey) : connecter sa boîte portefeuille.
  if (role !== "ADMIN" && role !== "BUSINESS_DEVELOPER") redirect("/dashboard");

  return <GmailSettingsClient defaultRecipient={session.user.email || ""} />;
}
