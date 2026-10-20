import { redirect } from "next/navigation";

/** Ancienne URL discrète → hub dans le layout ADMIN. */
export default function RhHubRedirectPage() {
  redirect("/hub");
}
