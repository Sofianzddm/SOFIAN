import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { TalentSidebar } from "@/components/layout/talent-sidebar";
import { Header } from "@/components/layout/header";

export default async function TalentLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  // Vérifier que c'est bien un TALENT
  if (session.user.role !== "TALENT") {
    redirect("/dashboard");
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <TalentSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
