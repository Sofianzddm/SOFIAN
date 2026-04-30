"use client";

import { useMemo, useState } from "react";
import { CANNES_2026_DAYS } from "@/lib/cannes/dates";
import Modal from "./Modal";
import PresenceForm from "./forms/PresenceForm";
import type { CannesPresence } from "../types";
type Props = { presences: CannesPresence[]; isAdmin: boolean };

export default function PlanningTalentsView({ presences, isAdmin }: Props) {
  const [creatingPresence, setCreatingPresence] = useState(false);
  const [selectedPresence, setSelectedPresence] = useState<CannesPresence | null>(null);

  const rows = useMemo(() => presences.filter((p) => p.talent), [presences]);

  function toSocialUrl(value: string | null | undefined, platform: "instagram" | "tiktok") {
    if (!value) return "";
    const raw = value.trim();
    if (!raw) return "";
    if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
    const username = raw.replace(/^@/, "");
    if (!username) return "";
    return platform === "instagram"
      ? `https://instagram.com/${username}`
      : `https://www.tiktok.com/@${username}`;
  }

  function escapeCsvCell(value: string) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  function exportTalentsCsv() {
    const headers = [
      "Prenom",
      "Nom",
      "Date arrivee",
      "Date depart",
      "Hotel",
      "Instagram",
      "TikTok",
    ];

    const lines = rows.map((presence) => {
      const instagramUrl = toSocialUrl(presence.talent?.instagram, "instagram");
      const tiktokUrl = toSocialUrl(presence.talent?.tiktok, "tiktok");
      return [
        presence.talent?.prenom || "",
        presence.talent?.nom || "",
        new Date(presence.arrivalDate).toLocaleDateString("fr-FR"),
        new Date(presence.departureDate).toLocaleDateString("fr-FR"),
        presence.hotel || "",
        instagramUrl,
        tiktokUrl,
      ]
        .map((value) => escapeCsvCell(value))
        .join(";");
    });

    const csvContent = `\uFEFF${headers.map((value) => escapeCsvCell(value)).join(";")}\n${lines.join("\n")}`;
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "cannes-2026-presence-talents.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-xl border border-[#E5E0D8] bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <p className="font-medium text-[#1A1110]">{rows.length} talents sur place</p>
        <div className="flex items-center gap-2">
          <button
            onClick={exportTalentsCsv}
            className="rounded border border-[#E5E0D8] px-3 py-2 text-sm text-[#1A1110] hover:bg-[#F5EBE0]"
          >
            Exporter CSV
          </button>
          {isAdmin && (
            <button
              onClick={() => setCreatingPresence(true)}
              className="rounded bg-[#1A1110] px-3 py-2 text-sm text-[#F5EBE0] hover:bg-[#C08B8B]"
            >
              + Ajouter une presence
            </button>
          )}
        </div>
      </div>
      <div className="space-y-2">
        {rows.map((p) => (
          <button key={p.id} onClick={() => setSelectedPresence(p)} className="w-full rounded border border-[#E5E0D8] p-3 text-left">
            <p className="font-medium text-[#1A1110]">{p.talent?.prenom} {p.talent?.nom}</p>
            <p className="text-sm text-[#1A1110]/70">
              {new Date(p.arrivalDate).toLocaleDateString("fr-FR")} - {new Date(p.departureDate).toLocaleDateString("fr-FR")} · {p.hotel || "Hotel non renseigne"}
            </p>
            <div className="mt-2 grid grid-cols-12 gap-1">
              {CANNES_2026_DAYS.map((d) => {
                const active = new Date(p.arrivalDate) <= d && new Date(p.departureDate) >= d;
                return <div key={d.toISOString()} className={`h-2 rounded ${active ? "bg-[#C8F285]" : "bg-[#F5EBE0]"}`} />;
              })}
            </div>
          </button>
        ))}
      </div>

      <Modal open={creatingPresence} title="Ajouter une presence talent" onClose={() => setCreatingPresence(false)}>
        <PresenceForm forcedType="talent" onClose={() => setCreatingPresence(false)} />
      </Modal>

      <Modal open={!!selectedPresence} title="Presence talent" onClose={() => setSelectedPresence(null)}>
        {selectedPresence && (
          isAdmin ? (
            <PresenceForm initialData={selectedPresence} onClose={() => setSelectedPresence(null)} />
          ) : (
            <div className="space-y-2 text-sm text-[#1A1110]/80">
              <p>Hotel : {selectedPresence.hotel || "-"}</p>
              <p>Vol arrivee : {selectedPresence.flightArrival || "-"}</p>
              <p>Vol depart : {selectedPresence.flightDeparture || "-"}</p>
              <p>Notes : {selectedPresence.notes || "-"}</p>
            </div>
          )
        )}
      </Modal>
    </div>
  );
}
