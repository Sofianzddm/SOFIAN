"use client";

import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import SimulateurEmvClient from "./SimulateurEmvClient";

export default function SimulateurEmvPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin text-glowup-rose" />
          Chargement…
        </div>
      }
    >
      <SimulateurEmvClient />
    </Suspense>
  );
}
