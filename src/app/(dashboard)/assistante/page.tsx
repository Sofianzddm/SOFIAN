import { redirect } from "next/navigation";

/** Ancienne URL → /enrichissement */
export default function AssistanteRedirect() {
  redirect("/enrichissement");
}
