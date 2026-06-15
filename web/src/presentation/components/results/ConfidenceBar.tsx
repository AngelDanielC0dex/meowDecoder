import type { CertaintyLevel } from "@/domain/analysis/classification";

const COLORS: Record<CertaintyLevel, string> = {
  high: "bg-green-600",
  medium: "bg-amber-500",
  low: "bg-red-500",
};

export function ConfidenceBar({
  probability,
  certainty,
  label,
}: {
  probability: number;
  certainty: CertaintyLevel;
  label: string;
}) {
  const pct = Math.round(probability * 100);
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm text-ink-600">
        <span>{label}</span>
        <span aria-hidden="true">{pct}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${pct}%`}
        className="h-2.5 w-full overflow-hidden rounded-full bg-brand-100"
      >
        <div className={`h-full rounded-full ${COLORS[certainty]}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
