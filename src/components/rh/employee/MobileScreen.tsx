"use client";

import { RhAvatar, RhButton, RhCard } from "@/components/rh/ui/primitives";
import { EMP_COLORS } from "@/components/rh/employee/parts";
import { useRhData } from "@/components/rh/RhDataContext";

/** Vue mobile = résumé des données live (pas une app native). */
export function MobileScreen() {
  const { me, home, inbox } = useRhData();
  const kpis = (home?.kpis as Array<{ label: string; value: string; unit: string }>) || [];
  const todos = (home?.todos as Array<{ id: string; title: string; tag: string }>) || [];

  return (
    <div className="rh-screen flex justify-center">
      <div
        className="w-[min(360px,100%)] rounded-[28px] p-3"
        style={{ background: "#15191F", border: "1px solid #2B333F" }}
      >
        <div className="rounded-[22px] p-4 flex flex-col gap-3" style={{ background: "#0A0C0F", minHeight: 520 }}>
          <div className="flex items-center gap-2">
            <RhAvatar
              initials={me?.employee.initials || "??"}
              color={me?.employee.avatarColor || EMP_COLORS.accent}
              size={34}
            />
            <div>
              <div className="text-[14px] font-semibold">{me?.employee.prenom || "—"}</div>
              <div className="rh-mono text-[9px]" style={{ color: EMP_COLORS.dim }}>
                {me?.employee.matricule}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {kpis.slice(0, 4).map((k) => (
              <RhCard key={k.label} className="p-3">
                <div className="rh-mono text-[9px]" style={{ color: EMP_COLORS.dim }}>{k.label}</div>
                <div className="rh-mono text-[20px] font-bold" style={{ color: EMP_COLORS.accent }}>
                  {k.value}
                  <span className="text-[11px] ml-1" style={{ color: EMP_COLORS.dim }}>{k.unit}</span>
                </div>
              </RhCard>
            ))}
          </div>

          <div className="text-[12.5px] font-semibold">À faire</div>
          {todos.length === 0 ? (
            <div className="text-[12px]" style={{ color: EMP_COLORS.muted }}>Rien en attente</div>
          ) : (
            todos.slice(0, 4).map((t) => (
              <div key={t.id} className="rounded-[10px] p-3" style={{ background: EMP_COLORS.inset }}>
                <div className="rh-mono text-[9px] mb-1" style={{ color: EMP_COLORS.warning }}>{t.tag}</div>
                <div className="text-[12px]">{t.title}</div>
              </div>
            ))
          )}

          <div className="text-[12.5px] font-semibold mt-2">Demandes ({inbox.length})</div>
          {inbox.slice(0, 3).map((i) => (
            <div key={String(i.id)} className="rounded-[10px] p-3" style={{ background: EMP_COLORS.inset }}>
              <div className="rh-mono text-[9px]" style={{ color: EMP_COLORS.dim }}>
                {String(i.reference || i.type)}
              </div>
              <div className="text-[12px]">{String(i.title)}</div>
            </div>
          ))}

          <RhButton className="mt-auto w-full">Ouvrir Absences</RhButton>
        </div>
      </div>
    </div>
  );
}
