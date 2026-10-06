import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { isMailerRole } from "@/lib/requireMailerAccess";
import MailerClient from "@/app/(dashboard)/admin/mailer/MailerClient";

export default async function AccountManagerMailerPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const role = (session.user as { role?: string }).role;
  if (role !== "CM" && role !== "ADMIN") redirect("/admin/mailer");
  if (!isMailerRole(role)) redirect("/dashboard");

  return <MailerClient />;
}
