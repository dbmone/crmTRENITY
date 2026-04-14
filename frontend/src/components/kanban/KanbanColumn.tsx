import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Order, OrderStatus } from "../../types";
import OrderCard from "./OrderCard";

interface Props {
  status: OrderStatus;
  label: string;
  orders: Order[];
  onCardClick: (order: Order) => void;
}

const COL_CONFIG: Record<OrderStatus, {
  accent: string;       // colored top bar
  headerText: string;   // column title color
  badge: string;        // count badge
  dropBg: string;       // drag-over background
}> = {
  NEW: {
    accent:     "bg-blue-500",
    headerText: "text-blue-300",
    badge:      "bg-blue-500/20 text-blue-300 border-blue-500/20",
    dropBg:     "bg-blue-500/5",
  },
  IN_PROGRESS: {
    accent:     "bg-amber-500",
    headerText: "text-amber-300",
    badge:      "bg-amber-500/20 text-amber-300 border-amber-500/20",
    dropBg:     "bg-amber-500/5",
  },
  ON_REVIEW: {
    accent:     "bg-purple-500",
    headerText: "text-purple-300",
    badge:      "bg-purple-500/20 text-purple-300 border-purple-500/20",
    dropBg:     "bg-purple-500/5",
  },
  DONE: {
    accent:     "bg-green-500",
    headerText: "text-green-400",
    badge:      "bg-green-500/20 text-green-300 border-green-500/20",
    dropBg:     "bg-green-500/5",
  },
  ARCHIVED: {
    accent:     "bg-ink-muted",
    headerText: "text-ink-secondary",
    badge:      "bg-bg-raised text-ink-tertiary border-bg-border",
    dropBg:     "bg-bg-hover",
  },
};

export default function KanbanColumn({ status, label, orders, onCardClick }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const cfg = COL_CONFIG[status];
  const ids  = orders.map((o) => o.id);

  return (
    <div className="flex-shrink-0 w-[280px] flex flex-col rounded-xl bg-bg-surface border border-bg-border overflow-hidden"
      style={{ height: "100%" }}>

      {/* Accent bar */}
      <div className={`h-0.5 w-full flex-shrink-0 ${cfg.accent}`} />

      {/* Column header */}
      <div className="flex items-center gap-2 px-3.5 py-3 border-b border-bg-border flex-shrink-0">
        <h3 className={`font-semibold text-sm flex-1 ${cfg.headerText}`}>{label}</h3>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${cfg.badge}`}>
          {orders.length}
        </span>
      </div>

      {/* Card list — independently scrollable */}
      <div
        ref={setNodeRef}
        className={`col-scroll p-2.5 transition-colors ${isOver ? cfg.dropBg : ""}`}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} onClick={onCardClick} />
            ))}
          </div>
        </SortableContext>

        {orders.length === 0 && (
          <div className="flex items-center justify-center h-20 text-xs text-ink-muted select-none">
            Нет задач
          </div>
        )}
      </div>
    </div>
  );
}
