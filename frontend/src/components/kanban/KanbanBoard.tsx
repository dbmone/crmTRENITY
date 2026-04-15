import { DndContext, DragEndEvent, PointerSensor, TouchSensor, useSensor, useSensors, DragOverlay } from "@dnd-kit/core";
import { Order, KANBAN_COLUMNS, OrderStatus } from "../../types";
import { useOrdersStore } from "../../store/orders.store";
import KanbanColumn from "./KanbanColumn";
import OrderCard from "./OrderCard";
import { useState } from "react";

interface Props {
  orders: Order[];
  onCardClick: (order: Order) => void;
}

export default function KanbanBoard({ orders, onCardClick }: Props) {
  const moveOrder = useOrdersStore((s) => s.moveOrder);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const orderId   = active.id as string;
    const newStatus = over.id as OrderStatus;
    const order = orders.find((o) => o.id === orderId);
    if (!order || order.status === newStatus) return;
    moveOrder(orderId, newStatus);
  };

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
      <div className="kanban-board">
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
          <div className="w-[280px] rotate-1 opacity-90 pointer-events-none shadow-glow">
            <OrderCard order={activeOrder} onClick={() => {}} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
