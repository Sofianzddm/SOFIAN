"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { RhDataProvider, useRhData } from "@/components/rh/RhDataContext";
import { TaskHub } from "@/components/rh/tasks/TaskHub";
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

function PatronHubInner({ variant }: { variant: "embedded" | "standalone" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const taskParam = searchParams.get("task");
  const { me, employees, loading, error } = useRhData();

  // Compat deep-link legacy `/hub?task=` → page détail
  useEffect(() => {
    if (taskParam) router.replace(`/hub/tasks/${taskParam}`);
  }, [taskParam, router]);

  if (error === "NO_RH_PROFILE") {
    router.replace("/rh/login");
    return null;
  }

  if (taskParam) {
    return null;
  }

  const light = variant === "embedded";
  const shellBg = light ? "transparent" : "#08090C";
  const shellFg = light ? "#6b7280" : "#8B95A5";

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
      <TaskHub
        mode="manage"
        meId={me.employee.id}
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

export function PatronHubApp({
  variant = "embedded",
}: {
  variant?: "embedded" | "standalone";
}) {
  return (
    <RhDataProvider loadPeople>
      <PatronHubInner variant={variant} />
    </RhDataProvider>
  );
}
