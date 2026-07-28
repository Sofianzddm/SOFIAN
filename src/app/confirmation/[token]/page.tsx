import { ConfirmationClient } from "./confirm-client";

export const metadata = {
  title: "Confirmation collaboration",
  robots: { index: false, follow: false },
};

export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ConfirmationClient token={token} />;
}
