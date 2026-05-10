import { Suspense } from "react";

import CannesCoiffeurManageClient from "./CannesCoiffeurManageClient";

function ManageFallback() {
  return (
    <main className="flex min-h-dvh min-h-screen flex-col items-center justify-center overflow-x-hidden bg-gradient-login px-[max(1rem,env(safe-area-inset-left))] pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))] text-glowup-lace/75">
      <p className="text-sm">Chargement…</p>
    </main>
  );
}

export default function CannesCoiffeurManagePage() {
  return (
    <Suspense fallback={<ManageFallback />}>
      <CannesCoiffeurManageClient />
    </Suspense>
  );
}
