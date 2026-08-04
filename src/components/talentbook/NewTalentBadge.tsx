/** Label vertical « NEW TALENT » — talents arrivés il y a moins de 2 mois. */

export function isNewTalent(dateArrivee: string | Date | null | undefined): boolean {
  if (!dateArrivee) return false;
  const arrived = new Date(dateArrivee);
  if (Number.isNaN(arrived.getTime())) return false;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 2);
  return arrived >= cutoff;
}

export function NewTalentBadge({ className = "" }: { className?: string }) {
  return (
    <div
      className={`pointer-events-none flex flex-col items-center gap-2.5 select-none ${className}`}
      aria-label="New talent"
    >
      <span className="block h-px w-3 bg-white/90" aria-hidden />
      <span
        className="font-switzer text-[10px] font-light uppercase leading-none tracking-[0.38em] text-white"
        style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
      >
        New talent
      </span>
      <span className="block h-px w-3 bg-white/90" aria-hidden />
    </div>
  );
}
