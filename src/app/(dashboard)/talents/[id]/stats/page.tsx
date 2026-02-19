import { redirect } from "next/navigation";

export default async function TalentStatsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/talents/${id}/edit?step=stats`);
}
