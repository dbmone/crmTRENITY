import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Archive } from "lucide-react";
import type { Order, OrderStatus } from "../../types";
import OrderCard from "./OrderCard";

interface Props {
  status: OrderStatus;
  label: string;
  orders: Order[];
  onCardClick: (order: Order) => void;
  dragEnabled?: boolean;
  archiveDropEnabled?: boolean;
}

const COL_CONFIG: Record<
  OrderStatus,
  {
    accent: string;
    headerText: string;
    badge: string;
    dropBg: string;
    colBg: string;
  }
> = {
  NEW: {
    accent: "bg-blue-500",
    headerText: "text-blue-300",
    badge: "bg-blue-500/20 text-blue-300 border-blue-500/20",
    dropBg: "bg-blue-500/5",
    colBg: "bg-bg-surface",
  },
  IN_PROGRESS: {
    accent: "bg-amber-500",
    headerText: "text-amber-300",
    badge: "bg-amber-500/20 text-amber-300 border-amber-500/20",
    dropBg: "bg-amber-500/5",
    colBg: "bg-bg-surface",
  },
  ON_REVIEW: {
    accent: "bg-purple-500",
    headerText: "text-purple-300",
    badge: "bg-purple-500/20 text-purple-300 border-purple-500/20",
    dropBg: "bg-purple-500/5",
    colBg: "bg-bg-surface",
  },
  DONE: {
    accent: "bg-green-500",
    headerText: "text-green-400",
    badge: "bg-green-500/20 text-green-300 border-green-500/20",
    dropBg: "bg-green-500/5",
    colBg: "bg-bg-surface",
  },
  ARCHIVED: {
    accent: "bg-transparent",
    headerText: "text-ink-tertiary",
    badge: "bg-bg-raised text-ink-tertiary border-bg-border",
    dropBg: "bg-bg-hover",
    colBg: "bg-[#0D0D0D]",
  },
};

export default function KanbanColumn({
  status,
  label,
  orders,
  onCardClick,
  dragEnabled = true,
  archiveDropEnabled = true,
}: Props) {
  const isArchived = status === "ARCHIVED";
  const canDropHere = dragEnabled || (archiveDropEnabled && isArchived);
  const cardDragEnabled = dragEnabled || archiveDropEnabled;
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled: !canDropHere });
  const cfg = COL_CONFIG[status];
  const ids = orders.map((order) => order.id);

  return (
    <div
      className={`flex w-[260px] flex-shrink-0 flex-col overflow-hidden rounded-xl border transition-colors animate-soft-in ${
        isArchived ? "border-bg-border/50 opacity-75 hover:opacity-90" : "border-bg-border"
      } ${cfg.colBg}`}
      style={{ height: "100%" }}
    >
      {!isArchived && <div className={`h-0.5 w-full flex-shrink-0 ${cfg.accent}`} />}

      <div
        className={`flex flex-shrink-0 items-center gap-2 border-b px-3.5 py-3 ${
          isArchived ? "border-bg-border/40" : "border-bg-border"
        }`}
      >
        {isArchived && <Archive size={13} className="flex-shrink-0 text-ink-tertiary" />}
        <h3 className={`flex-1 text-sm font-medium ${cfg.headerText}`}>{label}</h3>
        <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${cfg.badge}`}>{orders.length}</span>
      </div>

      <div
        ref={setNodeRef}
        className={`col-scroll p-2 transition-colors ${
          isOver ? (isArchived ? "bg-bg-hover/50" : cfg.dropBg) : ""
        } ${isArchived && isOver ? "rounded-b-xl ring-1 ring-inset ring-bg-border/60" : ""}`}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-1.5">
            {orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onClick={onCardClick}
                dim={isArchived}
                dragEnabled={cardDragEnabled}
              />
            ))}
          </div>
        </SortableContext>

        {orders.length === 0 && (
          <div
            className={`flex h-24 select-none flex-col items-center justify-center gap-2 ${
              isArchived ? "text-ink-muted/50" : "text-ink-muted"
            }`}
          >
            {isArchived ? (
              <>
                <Archive size={20} className="opacity-30" />
                <span className="text-xs">Перетащи сюда, чтобы убрать заказ с доски</span>
              </>
            ) : (
              <span className="text-xs">Нет заказов</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
