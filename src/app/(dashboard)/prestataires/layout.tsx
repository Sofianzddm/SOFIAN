import { redirect } from "next/navigation";

/** CRM prestataires inaccessible — aucune exception de rôle. */
export default function PrestatairesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  redirect("/dashboard");
  return children;
}
