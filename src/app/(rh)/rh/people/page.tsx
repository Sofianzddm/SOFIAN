import { redirect } from "next/navigation";
import { PeopleApp } from "@/components/rh/people/PeopleApp";
import { canAccessRhPeople, requireRhSession } from "@/lib/rh/auth";
import { hasRhSecureSession } from "@/lib/rh/secure-session";

export default async function RhPeoplePage() {
  const session = await requireRhSession();
  if (!session) {
    redirect("/rh/login");
  }
  // Console employeur : ADMIN plateforme uniquement
  if (!canAccessRhPeople(session.employee.appRole)) {
    redirect("/rh/espace");
  }
  if (!(await hasRhSecureSession(session.app.user.id))) {
    redirect("/rh/login?mfa=1");
  }
  return <PeopleApp />;
}
