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

const COLUMN_STYLES: Record<OrderStatus, { dot: string; bg: string; border: string }> = {
  NEW: { dot: "bg-brand-400", bg: "bg-brand-50/30", border: "border-brand-100" },
  IN_PROGRESS: { dot: "bg-blue-400", bg: "bg-blue-50/30", border: "border-blue-100" },
  ON_REVIEW: { dot: "bg-amber-400", bg: "bg-amber-50/30", border: "border-amber-100" },
  DONE: { dot: "bg-emerald-400", bg: "bg-emerald-50/30", border: "border-emerald-100" },
  ARCHIVED: { dot: "bg-gray-400", bg: "bg-gray-50/30", border: "border-gray-200" },
};

export default function KanbanColumn({ status, label, orders, onCardClick }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const styles = COLUMN_STYLES[status];
  const ids = orders.map((o) => o.id);

  return (
    <div className="flex-shrink-0 w-[300px]">
      {/* Column header */}
      <div className="flex items-center gap-2.5 px-2 mb-3">
        <div className={`w-2.5 h-2.5 rounded-full ${styles.dot}`} />
        <span className="text-sm font-medium text-ink-primary">{label}</span>
        <span className="text-xs text-ink-tertiary bg-surface-tertiary rounded-full px-2 py-0.5">
          {orders.length}
        </span>
      </div>

      {/* Droppable area */}
      <div
        ref={setNodeRef}
        className={`rounded-xl p-2 min-h-[200px] transition-colors border ${
          isOver
            ? `${styles.bg} ${styles.border} border-dashed`
            : "bg-surface-secondary/50 border-transparent"
        }`}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2.5">
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} onClick={onCardClick} />
            ))}
          </div>
        </SortableContext>

        {orders.length === 0 && (
          <div className="flex items-center justify-center h-24 text-sm text-ink-tertiary">
            Перетащите сюда
          </div>
        )}
      </div>
    </div>
  );
}
