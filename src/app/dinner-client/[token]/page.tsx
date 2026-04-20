import { DinnerClientPortal } from "./portal-client";

export default async function DinnerClientPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <DinnerClientPortal token={token} />;
}

