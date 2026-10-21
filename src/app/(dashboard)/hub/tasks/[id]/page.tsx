import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { TaskDetailApp } from "@/components/rh/tasks/TaskDetailApp";

type Props = { params: Promise<{ id: string }> | { id: string } };

/** Page détail tâche Hub — ADMIN. */
export default async function HubTaskDetailPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }
  if ((session.user as { role?: string }).role !== "ADMIN") {
    redirect("/dashboard");
  }

  const resolved = await Promise.resolve(params);
  const taskId = resolved.id;

  return (
    <Suspense
      fallback={
        <div className="py-16 text-center text-sm text-gray-500">
          Chargement de la tâche…
        </div>
      }
    >
      <TaskDetailApp taskId={taskId} mode="manage" variant="embedded" />
    </Suspense>
  );
}
