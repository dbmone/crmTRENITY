import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Order, STAGE_LABELS, StageName } from "../../types";
import { Clock, AlertTriangle, MessageSquare, Paperclip, FileText } from "lucide-react";
import UserProfileCard from "../UserProfileCard";

interface Props {
  order: Order;
  onClick: (order: Order) => void;
  dim?: boolean;
}

const STAGE_ORDER: StageName[] = ["STORYBOARD", "ANIMATION", "EDITING", "REVIEW", "COMPLETED"];

function shortName(displayName: string): string {
  const parts = displayName.trim().split(" ");
  const first = parts[0] || "";
  return first.length > 8 ? first.slice(0, 7) + "…" : first;
}

export default function OrderCard({ order, onClick, dim }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: order.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };

  const daysLeft = order.deadline
    ? Math.ceil((new Date(order.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  const isOverdue = daysLeft !== null && daysLeft < 0;
  const isUrgent  = daysLeft !== null && daysLeft >= 0 && daysLeft <= 2;

  const doneStages  = order.stages?.filter((s) => s.status === "DONE").length ?? 0;
  const totalStages = order.stages?.length ?? 5;
  const activeStage = order.stages?.find((s) => s.status === "IN_PROGRESS");
  const pct         = totalStages > 0 ? Math.round((doneStages / totalStages) * 100) : 0;

  const commentCount = (order._count as any)?.comments ?? 0;
  const fileCount    = order.files?.length ?? (order._count as any)?.files ?? 0;
  const reportCount  = (order._count as any)?.reports ?? 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onClick(order)}
      className={`group relative bg-bg-raised border rounded-xl p-3 cursor-pointer select-none transition-all duration-150 ${
        isDragging
          ? "border-green-500/40 shadow-glow"
          : isOverdue
          ? "border-red-500/25 hover:border-red-500/40"
          : "border-bg-border hover:border-bg-hover hover:bg-[#1E1E1E]"
      } ${dim ? "opacity-60 grayscale-[0.4]" : ""}`}
    >
      {/* Overdue indicator */}
      {isOverdue && (
        <div className="absolute top-0 left-0 w-0.5 h-full bg-red-500/60 rounded-l-xl" />
      )}

      {/* Title */}
      <p className="text-sm font-medium text-ink-primary leading-snug line-clamp-2 mb-2.5 pr-1">
        {order.title}
      </p>

      {/* Stage progress bar */}
      {order.stages && order.stages.length > 0 && (
        <div className="mb-2.5">
          <div className="flex gap-0.5 mb-1">
            {STAGE_ORDER.map((name) => {
              const st = order.stages!.find((s) => s.name === name);
              if (!st) return null;
              return (
                <div
                  key={name}
                  title={STAGE_LABELS[name]}
                  className={`flex-1 h-1 rounded-full transition-all ${
                    st.status === "DONE"
                      ? "bg-green-500"
                      : st.status === "IN_PROGRESS"
                      ? "bg-amber-400 pulse-green"
                      : "bg-bg-border"
                  }`}
                />
              );
            })}
          </div>
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-medium ${
              activeStage ? "text-amber-400" : pct === 100 ? "text-green-400" : "text-ink-tertiary"
            }`}>
              {activeStage ? STAGE_LABELS[activeStage.name] : pct === 100 ? "Завершено" : `${pct}%`}
            </span>
            <span className="text-[10px] text-ink-tertiary">{doneStages}/{totalStages}</span>
          </div>
        </div>
      )}

      {/* People row */}
      <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
        {/* Marketer */}
        {order.marketer && (
          <UserProfileCard
            userId={order.marketer.id}
            trigger={
              <span
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/20 hover:border-blue-500/40 transition-colors cursor-pointer"
              >
                <div className="w-4 h-4 rounded-full bg-blue-500/20 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {order.marketer.avatarUrl
                    ? <img src={order.marketer.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                    : <span className="text-[8px] font-bold text-blue-400">{order.marketer.displayName?.[0]?.toUpperCase()}</span>
                  }
                </div>
                <span className="text-[10px] text-blue-300 font-medium">{shortName(order.marketer.displayName)}</span>
              </span>
            }
          />
        )}

        {/* Creators */}
        {order.creators && order.creators.length > 0 && (
          <>
            <div className="w-px h-3 bg-bg-border flex-shrink-0" />
            <div className="flex flex-wrap gap-1">
              {order.creators.slice(0, 3).map((c) => (
                <UserProfileCard
                  key={c.id}
                  userId={c.creatorId}
                  trigger={
                    <span
                      onClick={(e) => e.stopPropagation()}
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border transition-colors cursor-pointer ${
                        c.isLead
                          ? "bg-amber-500/15 border-amber-500/20 hover:border-amber-500/40"
                          : "bg-green-500/10 border-green-500/20 hover:border-green-500/40"
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0 ${
                        c.isLead ? "bg-amber-500/20" : "bg-green-500/15"
                      }`}>
                        {c.creator.avatarUrl
                          ? <img src={c.creator.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                          : <span className={`text-[8px] font-bold ${c.isLead ? "text-amber-400" : "text-green-400"}`}>
                              {c.creator.displayName?.[0]?.toUpperCase()}
                            </span>
                        }
                      </div>
                      <span className={`text-[10px] font-medium ${c.isLead ? "text-amber-300" : "text-green-300"}`}>
                        {shortName(c.creator.displayName)}{c.isLead ? " ★" : ""}
                      </span>
                    </span>
                  }
                />
              ))}
              {order.creators.length > 3 && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-bg-border text-[10px] text-ink-tertiary">
                  +{order.creators.length - 3}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Footer: deadline + counters */}
      <div className="flex items-center justify-between">
        <div>
          {daysLeft !== null ? (
            <span className={`flex items-center gap-1 text-[11px] font-medium ${
              isOverdue ? "text-red-400" : isUrgent ? "text-amber-400" : "text-ink-tertiary"
            }`}>
              {isOverdue ? <AlertTriangle size={10} /> : <Clock size={10} />}
              {isOverdue
                ? `Просрочено ${Math.abs(daysLeft)} дн.`
                : daysLeft === 0 ? "Сегодня"
                : daysLeft === 1 ? "Завтра"
                : `${daysLeft} дн.`
              }
            </span>
          ) : (
            <span className="text-[11px] text-ink-muted">Без дедлайна</span>
          )}
        </div>

        <div className="flex items-center gap-2 text-ink-muted">
          {fileCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px]">
              <Paperclip size={9} /> {fileCount}
            </span>
          )}
          {reportCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px]">
              <FileText size={9} /> {reportCount}
            </span>
          )}
          {commentCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px]">
              <MessageSquare size={9} /> {commentCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
