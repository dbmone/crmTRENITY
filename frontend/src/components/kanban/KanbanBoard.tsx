import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, DragOverlay } from "@dnd-kit/core";
import { Order, KANBAN_COLUMNS, OrderStatus } from "../../types";
import { useOrdersStore } from "../../store/orders.store";
import KanbanColumn from "./KanbanColumn";
import { useState } from "react";

interface Props {
  orders: Order[];
  onCardClick: (order: Order) => void;
}

export default function KanbanBoard({ orders, onCardClick }: Props) {
  const moveOrder = useOrdersStore((s) => s.moveOrder);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const orderId = active.id as string;
    const newStatus = over.id as OrderStatus;

    const order = orders.find((o) => o.id === orderId);
    if (!order || order.status === newStatus) return;

    moveOrder(orderId, newStatus);
  };

  // Группируем заказы по статусу
  const grouped = KANBAN_COLUMNS.reduce<Record<OrderStatus, Order[]>>(
    (acc, col) => {
      acc[col.status] = orders.filter((o) => o.status === col.status);
      return acc;
    },
    {} as Record<OrderStatus, Order[]>
  );

  const activeOrder = activeId ? orders.find((o) => o.id === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => setActiveId(e.active.id as string)}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="kanban-scroll flex gap-4 pb-4">
        {KANBAN_COLUMNS.map((col) => (
          <KanbanColumn
            key={col.status}
            status={col.status}
            label={col.label}
            orders={grouped[col.status] || []}
            onCardClick={onCardClick}
          />
        ))}
      </div>

      <DragOverlay>
        {activeOrder && (
          <div className="bg-white rounded-xl border border-brand-200 shadow-xl p-3.5 w-[300px] opacity-90 rotate-2">
            <h3 className="text-sm font-medium">{activeOrder.title}</h3>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
