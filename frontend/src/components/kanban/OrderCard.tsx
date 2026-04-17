import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlertTriangle, Clock, FileText, MessageSquare, Paperclip } from "lucide-react";
import { Order, STAGE_LABELS, StageName } from "../../types";
import UserProfileCard from "../UserProfileCard";

interface Props {
  order: Order;
  onClick: (order: Order) => void;
  dim?: boolean;
  dragEnabled?: boolean;
}

const STAGE_ORDER: StageName[] = ["STORYBOARD", "ANIMATION", "EDITING", "REVIEW", "COMPLETED"];

function shortName(displayName: string): string {
  const parts = displayName.trim().split(" ");
  const first = parts[0] || "";
  return first.length > 8 ? `${first.slice(0, 7)}...` : first;
}

export default function OrderCard({ order, onClick, dim, dragEnabled = true }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: order.id, disabled: !dragEnabled });

  const style = {
    transform: dragEnabled ? CSS.Transform.toString(transform) : undefined,
    transition: dragEnabled ? transition : undefined,
    opacity: isDragging ? 0 : 1,
  };

  const daysLeft = order.deadline
    ? Math.ceil((new Date(order.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  const isOverdue = daysLeft !== null && daysLeft < 0;
  const isUrgent = daysLeft !== null && daysLeft >= 0 && daysLeft <= 2;

  const allStages = order.stages ?? [];
  const maxRound = allStages.length > 0 ? Math.max(...allStages.map((s) => s.revisionRound ?? 0)) : 0;
  const curStages = allStages.filter((s) => (s.revisionRound ?? 0) === maxRound);
  const doneStages = curStages.filter((s) => s.status === "DONE").length;
  const totalStages = curStages.length || 5;
  const activeStage = curStages.find((s) => s.status === "IN_PROGRESS");
  const pct = totalStages > 0 ? Math.round((doneStages / totalStages) * 100) : 0;

  const commentCount = (order._count as any)?.comments ?? 0;
  const fileCount = order.files?.length ?? (order._count as any)?.files ?? 0;
  const reportCount = (order._count as any)?.reports ?? 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(dragEnabled ? attributes : {})}
      {...(dragEnabled ? listeners : {})}
      data-tour="order-card"
      onClick={() => onClick(order)}
      className={`group relative cursor-pointer select-none rounded-xl border bg-bg-raised p-3 transition-all duration-200 animate-soft-in-fast ${
        isDragging
          ? "border-green-500/40 shadow-glow"
          : isOverdue
            ? "border-red-500/25 hover:border-red-500/40"
            : "border-bg-border hover:border-bg-hover hover:bg-[#1E1E1E]"
      } ${dim ? "opacity-60 grayscale-[0.4]" : ""}`}
    >
      {isOverdue && (
        <div className="absolute left-0 top-0 h-full w-0.5 rounded-l-xl bg-red-500/60" />
      )}

      <p className="mb-2.5 line-clamp-2 pr-1 text-sm font-medium leading-snug text-ink-primary">
        {order.title}
      </p>

      {curStages.length > 0 && (
        <div className="mb-2.5">
          {maxRound > 0 && (
            <div className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-purple-400">
              Правка {maxRound}
            </div>
          )}
          <div className="mb-1 flex gap-0.5">
            {STAGE_ORDER.map((name) => {
              const stage = curStages.find((s) => s.name === name);
              if (!stage) return null;

              return (
                <div
                  key={name}
                  title={STAGE_LABELS[name]}
                  className={`h-1 flex-1 rounded-full transition-all ${
                    maxRound > 0
                      ? stage.status === "DONE"
                        ? "bg-purple-500"
                        : stage.status === "IN_PROGRESS"
                          ? "bg-orange-400 pulse-green"
                          : "bg-bg-border"
                      : stage.status === "DONE"
                        ? "bg-green-500"
                        : stage.status === "IN_PROGRESS"
                          ? "bg-amber-400 pulse-green"
                          : "bg-bg-border"
                  }`}
                />
              );
            })}
          </div>
          <div className="flex items-center justify-between">
            <span
              className={`text-[10px] font-medium ${
                activeStage
                  ? maxRound > 0 ? "text-orange-400" : "text-amber-400"
                  : pct === 100
                    ? maxRound > 0 ? "text-purple-400" : "text-green-400"
                    : "text-ink-tertiary"
              }`}
            >
              {activeStage ? (
                <>
                  {STAGE_LABELS[activeStage.name]}
                  {activeStage.awaitingClientApproval && (
                    <span className="ml-1 text-[9px] text-blue-400 opacity-80">· апрув заказчика</span>
                  )}
                </>
              ) : pct === 100 ? "Завершено" : `${pct}%`}
            </span>
            <span className="text-[10px] text-ink-tertiary">
              {doneStages}/{totalStages}
            </span>
          </div>
        </div>
      )}

      <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
        {order.marketer && (
          <UserProfileCard
            userId={order.marketer.id}
            trigger={
              <span className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-blue-500/20 bg-blue-500/15 px-1.5 py-0.5 transition-colors hover:border-blue-500/40">
                <div className="flex h-4 w-4 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-500/20">
                  {order.marketer.avatarUrl ? (
                    <img src={order.marketer.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
                  ) : (
                    <span className="text-[8px] font-bold text-blue-400">
                      {order.marketer.displayName?.[0]?.toUpperCase()}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium text-blue-300">
                  {shortName(order.marketer.displayName)}
                </span>
              </span>
            }
          />
        )}

        {order.creators && order.creators.length > 0 && (
          <>
            <div className="h-3 w-px flex-shrink-0 bg-bg-border" />
            <div className="flex flex-wrap gap-1">
              {order.creators.slice(0, 3).map((creator) => (
                <UserProfileCard
                  key={creator.id}
                  userId={creator.creatorId}
                  trigger={
                    <span
                      className={`inline-flex cursor-pointer items-center gap-1 rounded-full border px-1.5 py-0.5 transition-colors ${
                        creator.isLead
                          ? "border-amber-500/20 bg-amber-500/15 hover:border-amber-500/40"
                          : "border-green-500/20 bg-green-500/10 hover:border-green-500/40"
                      }`}
                    >
                      <div
                        className={`flex h-4 w-4 flex-shrink-0 items-center justify-center overflow-hidden rounded-full ${
                          creator.isLead ? "bg-amber-500/20" : "bg-green-500/15"
                        }`}
                      >
                        {creator.creator.avatarUrl ? (
                          <img src={creator.creator.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
                        ) : (
                          <span className={`text-[8px] font-bold ${creator.isLead ? "text-amber-400" : "text-green-400"}`}>
                            {creator.creator.displayName?.[0]?.toUpperCase()}
                          </span>
                        )}
                      </div>
                      <span className={`text-[10px] font-medium ${creator.isLead ? "text-amber-300" : "text-green-300"}`}>
                        {shortName(creator.creator.displayName)}
                        {creator.isLead ? " *" : ""}
                      </span>
                    </span>
                  }
                />
              ))}

              {order.creators.length > 3 && (
                <span className="inline-flex items-center rounded-full bg-bg-border px-1.5 py-0.5 text-[10px] text-ink-tertiary">
                  +{order.creators.length - 3}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div>
          {daysLeft !== null ? (
            <span className={`flex items-center gap-1 text-[11px] font-medium ${
              isOverdue ? "text-red-400" : isUrgent ? "text-amber-400" : "text-ink-tertiary"
            }`}>
              {isOverdue ? <AlertTriangle size={10} /> : <Clock size={10} />}
              {isOverdue
                ? `Просрочено ${Math.abs(daysLeft)} дн.`
                : daysLeft === 0
                  ? "Сегодня"
                  : daysLeft === 1
                    ? "Завтра"
                    : `${daysLeft} дн.`}
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
