import { redirect } from "next/navigation";

/** Ancienne URL → /enrichissement */
export default function EmailsATrouverRedirect() {
  redirect("/enrichissement");
}
