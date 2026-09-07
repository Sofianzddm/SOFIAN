import { redirect } from "next/navigation";
import { requireDecisionCenterPage } from "@/lib/decision-center/access";
import { DcSubNav } from "@/components/decision-center/DcSubNav";

export default async function DecisionCenterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireDecisionCenterPage();
  if (!ctx) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-6xl">
      <DcSubNav role={ctx.dcRole} capabilities={ctx.capabilities} />
      {children}
    </div>
  );
}
