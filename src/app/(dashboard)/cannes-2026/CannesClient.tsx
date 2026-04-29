"use client";

import { useMemo, useState } from "react";
import { Toaster } from "sonner";
import AgendaView from "./components/AgendaView";
import ContactsView from "./components/ContactsView";
import PlanningTeamView from "./components/PlanningTeamView";
import PlanningTalentsView from "./components/PlanningTalentsView";
import type { CannesContact, CannesEvent, CannesPresence } from "./types";

type Tab = "agenda" | "contacts" | "team" | "talents";

type Props = {
  isAdmin: boolean;
  initialEvents: CannesEvent[];
  initialContacts: CannesContact[];
  initialPresences: CannesPresence[];
};

export default function CannesClient({
  isAdmin,
  initialEvents,
  initialContacts,
  initialPresences,
}: Props) {
  const [tab, setTab] = useState<Tab>("agenda");
  const teamPresences = useMemo(
    () => initialPresences.filter((p) => !!p.userId),
    [initialPresences]
  );
  const talentPresences = useMemo(
    () => initialPresences.filter((p) => !!p.talentId),
    [initialPresences]
  );

  return (
    <>
      <Toaster position="bottom-right" richColors />
      <div className="min-h-screen bg-[#F5EBE0]">
        <header className="border-b border-[#E5E0D8] bg-white">
          <div className="mx-auto max-w-7xl px-6 py-8">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[#C08B8B]">Festival de Cannes</p>
                <h1 className="mt-1 font-[Spectral] text-4xl font-light text-[#1A1110]">Edition 2026</h1>
                <p className="mt-2 text-sm text-[#1A1110]/60">12 -&gt; 23 mai 2026 · Espace partage Glow Up</p>
              </div>
              {isAdmin && (
                <span className="rounded-full bg-[#C8F285] px-3 py-1 text-xs font-medium text-[#1A1110]">
                  Mode Admin
                </span>
              )}
            </div>

            <nav className="mt-8 flex gap-1 border-b border-[#E5E0D8]">
              {[
                ["agenda", "Agenda"],
                ["contacts", "Contacts sur place"],
                ["team", "Planning equipe"],
                ["talents", "Planning talents"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key as Tab)}
                  className={`relative px-5 py-3 text-sm font-medium transition ${
                    tab === key ? "text-[#1A1110]" : "text-[#1A1110]/50 hover:text-[#1A1110]"
                  }`}
                >
                  {label}
                  {tab === key && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-[#1A1110]" />}
                </button>
              ))}
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-6 py-8">
          {tab === "agenda" && (
            <AgendaView events={initialEvents} presences={initialPresences} isAdmin={isAdmin} />
          )}
          {tab === "contacts" && <ContactsView contacts={initialContacts} isAdmin={isAdmin} />}
          {tab === "team" && <PlanningTeamView presences={teamPresences} isAdmin={isAdmin} />}
          {tab === "talents" && <PlanningTalentsView presences={talentPresences} isAdmin={isAdmin} />}
        </main>
      </div>
    </>
  );
}
