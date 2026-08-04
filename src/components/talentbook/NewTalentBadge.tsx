/** Pastille starburst « New talent » — talents arrivés il y a moins de 2 mois. */

/** Ellipse starburst (~24 pointes), plus large que haute. */
function buildStarburstPath(
  cx: number,
  cy: number,
  outerRx: number,
  outerRy: number,
  innerRx: number,
  innerRy: number,
  points: number
): string {
  const steps = points * 2;
  const parts: string[] = [];
  for (let i = 0; i < steps; i++) {
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const rx = i % 2 === 0 ? outerRx : innerRx;
    const ry = i % 2 === 0 ? outerRy : innerRy;
    const x = cx + Math.cos(angle) * rx;
    const y = cy + Math.sin(angle) * ry;
    parts.push(`${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return `${parts.join(" ")} Z`;
}

const STARBURST_PATH = buildStarburstPath(70, 52, 67, 49, 52, 37, 22);

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
      className={`pointer-events-none relative select-none ${className}`}
      style={{ width: 88, height: 66, transform: "rotate(14deg)" }}
      aria-label="New talent"
    >
      <svg
        viewBox="0 0 140 104"
        className="absolute inset-0 h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <path
          d={STARBURST_PATH}
          fill="#EAF6BD"
          stroke="#2A1911"
          strokeWidth="1.35"
          strokeLinejoin="miter"
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center px-2 text-center font-switzer font-bold leading-tight tracking-wide text-[#2A1911]"
        style={{ fontSize: 11, transform: "rotate(-2deg)" }}
      >
        New talent
      </span>
    </div>
  );
}
