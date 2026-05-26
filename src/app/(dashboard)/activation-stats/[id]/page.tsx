import ManageReportClient from "./ManageReportClient";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ManageReportClient reportId={id} />;
}
