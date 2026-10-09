import { redirect } from "next/navigation";
import { PeopleApp } from "@/components/rh/people/PeopleApp";
import { isRhHr, requireRhSession } from "@/lib/rh/auth";
import { hasRhSecureSession } from "@/lib/rh/secure-session";

export default async function RhPeoplePage() {
  const session = await requireRhSession();
  if (!session) {
    redirect("/rh/login");
  }
  // Console admin RH uniquement (Sofian / Maud) — pas les managers N+1
  if (!isRhHr(session.employee.rhRole)) {
    redirect("/rh/espace");
  }
  if (!(await hasRhSecureSession(session.app.user.id))) {
    redirect("/rh/login?mfa=1");
  }
  return <PeopleApp />;
}
