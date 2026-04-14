import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Order, STAGE_LABELS } from "../../types";
import StageProgress from "../order/StageProgress";
import { Clock, FileText, Paperclip, AlertTriangle } from "lucide-react";

interface Props {
  order: Order;
  onClick: (order: Order) => void;
}

export default function OrderCard({ order, onClick }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: order.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const daysLeft = order.deadline
    ? Math.ceil((new Date(order.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  const isUrgent = daysLeft !== null && daysLeft <= 2;
  const isOverdue = daysLeft !== null && daysLeft < 0;

  const currentStage = order.stages?.find((s) => s.status === "IN_PROGRESS");

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onClick(order)}
      className={`bg-white rounded-xl border p-3.5 cursor-pointer transition-all hover:shadow-md hover:border-gray-200 active:scale-[0.98] ${
        isDragging ? "shadow-lg border-brand-200" : "border-gray-100 shadow-sm"
      }`}
    >
      {/* Title */}
      <h3 className="text-sm font-medium text-ink-primary mb-2 leading-snug">
        {order.title}
      </h3>

      {/* Current stage badge */}
      {currentStage && (
        <span className="inline-block text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium mb-2">
          {STAGE_LABELS[currentStage.name]}
        </span>
      )}

      {/* Stage progress */}
      {order.stages && order.stages.length > 0 && (
        <div className="mb-3">
          <StageProgress stages={order.stages} compact />
        </div>
      )}

      {/* Tags: marketer + creators */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-brand-50 text-brand-600 font-medium">
          @{order.marketer.telegramUsername || order.marketer.displayName}
        </span>
        {order.creators?.map((c) => (
          <span
            key={c.id}
            className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
              c.isLead
                ? "bg-amber-50 text-amber-700"
                : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {c.isLead ? "⭐ " : ""}@{c.creator.telegramUsername || c.creator.displayName}
          </span>
        ))}
      </div>

      {/* Footer: deadline + files */}
      <div className="flex items-center justify-between">
        {daysLeft !== null ? (
          <span
            className={`flex items-center gap-1 text-[11px] font-medium ${
              isOverdue
                ? "text-red-500"
                : isUrgent
                ? "text-amber-600"
                : "text-ink-tertiary"
            }`}
          >
            {isOverdue ? (
              <AlertTriangle size={12} />
            ) : (
              <Clock size={12} />
            )}
            {isOverdue
              ? `Просрочено ${Math.abs(daysLeft)} дн.`
              : daysLeft === 0
              ? "Сегодня!"
              : daysLeft === 1
              ? "Завтра"
              : `${daysLeft} дн.`}
          </span>
        ) : (
          <span />
        )}

        <div className="flex items-center gap-2">
          {order.files && order.files.length > 0 && (
            <span className="flex items-center gap-0.5 text-[11px] text-ink-tertiary">
              <Paperclip size={11} />
              {order.files.length}
            </span>
          )}
          {order._count?.reports ? (
            <span className="flex items-center gap-0.5 text-[11px] text-ink-tertiary">
              <FileText size={11} />
              {order._count.reports}
            </span>
          ) : null}
        </div>
      </div>

      {/* Creator avatars */}
      {order.creators && order.creators.length > 0 && (
        <div className="flex -space-x-1.5 mt-2.5">
          {order.creators.slice(0, 4).map((c) => {
            const initials = c.creator.displayName
              .split(" ")
              .map((w) => w[0])
              .join("")
              .toUpperCase()
              .slice(0, 2);
            return (
              <div
                key={c.id}
                className="w-6 h-6 rounded-full bg-brand-100 border-2 border-white flex items-center justify-center text-[9px] font-semibold text-brand-600"
                title={c.creator.displayName}
              >
                {initials}
              </div>
            );
          })}
          {order.creators.length > 4 && (
            <div className="w-6 h-6 rounded-full bg-surface-tertiary border-2 border-white flex items-center justify-center text-[9px] font-medium text-ink-secondary">
              +{order.creators.length - 4}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
