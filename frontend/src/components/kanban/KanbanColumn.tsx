import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Order, OrderStatus } from "../../types";
import OrderCard from "./OrderCard";
import { Archive } from "lucide-react";

interface Props {
  status: OrderStatus;
  label: string;
  orders: Order[];
  onCardClick: (order: Order) => void;
}

const COL_CONFIG: Record<OrderStatus, {
  accent: string;
  headerText: string;
  badge: string;
  dropBg: string;
  colBg: string;
  dim: boolean;
}> = {
  NEW: {
    accent:     "bg-blue-500",
    headerText: "text-blue-300",
    badge:      "bg-blue-500/20 text-blue-300 border-blue-500/20",
    dropBg:     "bg-blue-500/5",
    colBg:      "bg-bg-surface",
    dim:        false,
  },
  IN_PROGRESS: {
    accent:     "bg-amber-500",
    headerText: "text-amber-300",
    badge:      "bg-amber-500/20 text-amber-300 border-amber-500/20",
    dropBg:     "bg-amber-500/5",
    colBg:      "bg-bg-surface",
    dim:        false,
  },
  ON_REVIEW: {
    accent:     "bg-purple-500",
    headerText: "text-purple-300",
    badge:      "bg-purple-500/20 text-purple-300 border-purple-500/20",
    dropBg:     "bg-purple-500/5",
    colBg:      "bg-bg-surface",
    dim:        false,
  },
  DONE: {
    accent:     "bg-green-500",
    headerText: "text-green-400",
    badge:      "bg-green-500/20 text-green-300 border-green-500/20",
    dropBg:     "bg-green-500/5",
    colBg:      "bg-bg-surface",
    dim:        false,
  },
  ARCHIVED: {
    accent:     "bg-transparent",
    headerText: "text-ink-tertiary",
    badge:      "bg-bg-raised text-ink-tertiary border-bg-border",
    dropBg:     "bg-bg-hover",
    colBg:      "bg-[#0D0D0D]",
    dim:        true,
  },
};

export default function KanbanColumn({ status, label, orders, onCardClick }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const cfg  = COL_CONFIG[status];
  const ids  = orders.map((o) => o.id);
  const isArchived = status === "ARCHIVED";

  return (
    <div
      className={`flex-shrink-0 w-[260px] flex flex-col rounded-xl border overflow-hidden transition-colors ${
        isArchived
          ? "border-bg-border/50 opacity-75 hover:opacity-90"
          : "border-bg-border"
      } ${cfg.colBg}`}
      style={{ height: "100%" }}
    >
      {/* Accent bar — only for non-archived */}
      {!isArchived && <div className={`h-0.5 w-full flex-shrink-0 ${cfg.accent}`} />}

      {/* Column header */}
      <div className={`flex items-center gap-2 px-3.5 py-3 border-b flex-shrink-0 ${
        isArchived ? "border-bg-border/40" : "border-bg-border"
      }`}>
        {isArchived && <Archive size={13} className="text-ink-tertiary flex-shrink-0" />}
        <h3 className={`font-medium text-sm flex-1 ${cfg.headerText}`}>{label}</h3>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${cfg.badge}`}>
          {orders.length}
        </span>
      </div>

      {/* Card list */}
      <div
        ref={setNodeRef}
        className={`col-scroll p-2 transition-colors ${
          isOver ? (isArchived ? "bg-bg-hover/50" : cfg.dropBg) : ""
        } ${isArchived && isOver ? "ring-1 ring-inset ring-bg-border/60 rounded-b-xl" : ""}`}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-1.5">
            {orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onClick={onCardClick}
                dim={isArchived}
              />
            ))}
          </div>
        </SortableContext>

        {orders.length === 0 && (
          <div className={`flex flex-col items-center justify-center h-24 gap-2 select-none ${
            isArchived ? "text-ink-muted/50" : "text-ink-muted"
          }`}>
            {isArchived
              ? <><Archive size={20} className="opacity-30" /><span className="text-xs">Перетащи сюда для архивации</span></>
              : <span className="text-xs">Нет задач</span>
            }
          </div>
        )}
      </div>
    </div>
  );
}
