import { useState } from "react";
import { DndContext, DragEndEvent, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { useOrdersStore } from "../../store/orders.store";
import type { Order, OrderStatus } from "../../types";
import { KANBAN_COLUMNS } from "../../types";
import KanbanColumn from "./KanbanColumn";
import OrderCard from "./OrderCard";

interface Props {
  orders: Order[];
  onCardClick: (order: Order) => void;
  dragEnabled?: boolean;
}

export default function KanbanBoard({ orders, onCardClick, dragEnabled = true }: Props) {
  const moveOrder = useOrdersStore((s) => s.moveOrder);
  const [activeId, setActiveId] = useState<string | null>(null);

  const archiveDropEnabled = true;
  const cardDragEnabled = dragEnabled || archiveDropEnabled;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const orderId = active.id as string;
    const newStatus = over.id as OrderStatus;
    const order = orders.find((item) => item.id === orderId);
    if (!order || order.status === newStatus) return;

    if (newStatus === "ARCHIVED") {
      void moveOrder(orderId, newStatus);
      return;
    }

    if (!dragEnabled) return;
    void moveOrder(orderId, newStatus);
  };

  const grouped = KANBAN_COLUMNS.reduce<Record<OrderStatus, Order[]>>(
    (acc, col) => {
      acc[col.status] = orders.filter((order) => order.status === col.status);
      return acc;
    },
    {} as Record<OrderStatus, Order[]>
  );

  const activeOrder = activeId ? orders.find((order) => order.id === activeId) : null;

  return (
    <DndContext
      sensors={cardDragEnabled ? sensors : undefined}
      onDragStart={cardDragEnabled ? (event) => setActiveId(event.active.id as string) : undefined}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="kanban-board">
        {KANBAN_COLUMNS.map((column) => (
          <KanbanColumn
            key={column.status}
            status={column.status}
            label={column.label}
            orders={grouped[column.status] || []}
            onCardClick={onCardClick}
            dragEnabled={dragEnabled}
            archiveDropEnabled={archiveDropEnabled}
          />
        ))}
      </div>

      <DragOverlay>
        {activeOrder && (
          <div className="pointer-events-none w-[280px] rotate-1 opacity-90 shadow-glow">
            <OrderCard order={activeOrder} onClick={() => {}} dragEnabled={cardDragEnabled} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
