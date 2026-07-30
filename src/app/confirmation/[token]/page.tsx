import { ConfirmationClient } from "./confirm-client";

export const metadata = {
  title: "Confirmation collaboration",
  robots: { index: false, follow: false },
};

export default async function ConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { token } = await params;
  const { preview } = await searchParams;
  return <ConfirmationClient token={token} preview={preview === "1"} />;
}
