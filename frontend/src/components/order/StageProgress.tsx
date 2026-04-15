import { OrderStage, StageName, STAGE_LABELS } from "../../types";

interface Props {
  stages: OrderStage[];
  compact?: boolean;
}

const STAGE_ORDER: StageName[] = ["STORYBOARD", "ANIMATION", "EDITING", "REVIEW", "COMPLETED"];

export default function StageProgress({ stages, compact = false }: Props) {
  if (!stages || stages.length === 0) return null;

  // Show only the latest revision round
  const maxRound = Math.max(...stages.map((s) => s.revisionRound ?? 0));
  const currentStages = stages.filter((s) => (s.revisionRound ?? 0) === maxRound);
  const revisionCount = maxRound; // number of revision rounds

  if (compact) {
    return (
      <div className="flex gap-1">
        {STAGE_ORDER.map((name) => {
          const s = currentStages.find((x) => x.name === name);
          if (!s) return null;
          return (
            <div
              key={name}
              className={`h-1.5 flex-1 rounded-full ${
                s.status === "DONE" ? "bg-green-500" :
                s.status === "IN_PROGRESS" ? "bg-amber-400" : "bg-bg-border"
              }`}
              title={STAGE_LABELS[name]}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {revisionCount > 0 && (
        <div className="flex items-center gap-1 mb-0.5">
          <span className="text-[9px] font-semibold text-purple-400 uppercase tracking-wider">
            Правка #{revisionCount}
          </span>
        </div>
      )}
      <div className="flex gap-1">
        {STAGE_ORDER.map((name) => {
          const s = currentStages.find((x) => x.name === name);
          if (!s) return null;
          return (
            <div key={name}
              className={`h-2 flex-1 rounded-full transition-all ${
                s.status === "DONE" ? "bg-green-500" :
                s.status === "IN_PROGRESS" ? "bg-amber-400 pulse-green" : "bg-bg-border"
              }`}
              title={STAGE_LABELS[name]}
            />
          );
        })}
      </div>
      <div className="flex">
        {STAGE_ORDER.map((name) => {
          const s = currentStages.find((x) => x.name === name);
          if (!s) return null;
          return (
            <span key={name} className={`flex-1 text-[9px] truncate ${
              s.status === "DONE" ? "text-green-400 font-medium" :
              s.status === "IN_PROGRESS" ? "text-amber-400 font-medium" : "text-ink-tertiary"
            }`}>
              {STAGE_LABELS[name]}
            </span>
          );
        })}
      </div>
    </div>
  );
}
