"use client";

import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { RhDataProvider, useRhData } from "@/components/rh/RhDataContext";
import { TaskDetailPage } from "@/components/rh/tasks/TaskDetailPage";
import { LIME } from "@/components/rh/mock/shared";
import "@/components/rh/tokens.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-rh-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-rh-mono",
  display: "swap",
});

function TaskDetailInner({
  taskId,
  mode,
  variant,
}: {
  taskId: string;
  mode: "manage" | "mine";
  variant: "embedded" | "standalone";
}) {
  const router = useRouter();
  const { me, employees, loading, error } = useRhData();

  if (error === "NO_RH_PROFILE") {
    router.replace("/rh/login");
    return null;
  }

  const light = variant === "embedded";
  const shellBg = light ? "transparent" : "#08090C";
  const shellFg = light ? "#6b7280" : "#8B95A5";
  const backHref = mode === "manage" ? "/hub" : "/rh/espace?tab=tasks";

  if (loading && !me) {
    return (
      <div
        className="grid place-items-center text-[14px] py-16"
        style={{ background: shellBg, color: shellFg }}
      >
        Chargement…
      </div>
    );
  }

  if (!me) {
    return (
      <div
        className="grid place-items-center text-[14px] py-16"
        style={{ background: shellBg, color: shellFg }}
      >
        Session requise
      </div>
    );
  }

  return (
    <div
      className={`rh-root ${light ? "rh-hub-light" : ""} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
      style={
        {
          "--rh-font":
            "var(--font-rh-sans), 'Space Grotesk', system-ui, sans-serif",
          "--rh-mono":
            "var(--font-rh-mono), 'JetBrains Mono', ui-monospace, monospace",
          fontFamily: "var(--rh-font)",
          minHeight: light ? undefined : "100vh",
          background: light ? "transparent" : "#08090C",
        } as React.CSSProperties
      }
    >
      <TaskDetailPage
        taskId={taskId}
        mode={mode}
        meId={me.employee.id}
        backHref={backHref}
        employees={employees.map((e) => ({
          id: String(e.id),
          name: String(e.name || "—"),
          initials: String(e.initials || "??"),
          avatarColor: String(e.avatarColor || LIME),
          avatarUrl: (e.avatarUrl as string | null) || null,
          department: String(e.department || ""),
          jobTitle: String(e.jobTitle || ""),
        }))}
      />
    </div>
  );
}

export function TaskDetailApp({
  taskId,
  mode,
  variant = "embedded",
}: {
  taskId: string;
  mode: "manage" | "mine";
  variant?: "embedded" | "standalone";
}) {
  return (
    <RhDataProvider loadPeople>
      <Suspense
        fallback={
          <div className="py-16 text-center text-sm text-gray-500">
            Chargement…
          </div>
        }
      >
        <TaskDetailInner taskId={taskId} mode={mode} variant={variant} />
      </Suspense>
    </RhDataProvider>
  );
}
