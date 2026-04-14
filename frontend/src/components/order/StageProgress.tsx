import { OrderStage, STAGE_LABELS } from "../../types";

interface Props {
  stages: OrderStage[];
  compact?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  DONE: "bg-stage-done",
  IN_PROGRESS: "bg-stage-progress",
  PENDING: "bg-stage-pending",
};

export default function StageProgress({ stages, compact = false }: Props) {
  if (!stages || stages.length === 0) return null;

  const sorted = [...stages].sort((a, b) => a.sortOrder - b.sortOrder);

  if (compact) {
    return (
      <div className="flex gap-1">
        {sorted.map((s) => (
          <div
            key={s.id}
            className={`h-1.5 flex-1 rounded-full ${STATUS_COLORS[s.status]}`}
            title={`${STAGE_LABELS[s.name]}: ${s.status === "DONE" ? "Готово" : s.status === "IN_PROGRESS" ? "В работе" : "Ожидает"}`}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {sorted.map((s) => (
          <div
            key={s.id}
            className={`h-2 flex-1 rounded-full ${STATUS_COLORS[s.status]}`}
          />
        ))}
      </div>
      <div className="flex justify-between">
        {sorted.map((s) => (
          <span
            key={s.id}
            className={`text-[10px] leading-tight ${
              s.status === "DONE"
                ? "text-emerald-600 font-medium"
                : s.status === "IN_PROGRESS"
                ? "text-amber-600 font-medium"
                : "text-ink-tertiary"
            }`}
          >
            {STAGE_LABELS[s.name]}
          </span>
        ))}
      </div>
    </div>
  );
}
