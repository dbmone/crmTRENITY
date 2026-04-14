import { useEffect, useState } from "react";
import { useOrdersStore } from "../store/orders.store";
import { useAuthStore } from "../store/auth.store";
import { Order } from "../types";
import KanbanBoard from "../components/kanban/KanbanBoard";
import CreateOrderModal from "../components/kanban/CreateOrderModal";
import OrderDetailModal from "../components/kanban/OrderDetailModal";
import Header from "../components/layout/Header";
import { Plus, Filter, RefreshCw } from "lucide-react";

export default function BoardPage() {
  const user = useAuthStore((s) => s.user);
  const { orders, isLoading, fetchOrders, filter, setFilter } = useOrdersStore();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetchOrders();
  }, []);

  const isMarketer = user?.role === "MARKETER" || user?.role === "ADMIN";

  return (
    <div className="min-h-screen bg-surface-secondary">
      <Header />

      <div className="px-6 py-5">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-ink-primary">Доска заказов</h2>
            <button
              onClick={() => fetchOrders()}
              className="p-1.5 rounded-lg hover:bg-white text-ink-tertiary hover:text-ink-primary transition-colors"
              title="Обновить"
            >
              <RefreshCw size={15} className={isLoading ? "animate-spin" : ""} />
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Filter toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                filter
                  ? "bg-brand-50 text-brand-600 border border-brand-200"
                  : "bg-white border border-gray-200 text-ink-secondary hover:bg-surface-tertiary"
              }`}
            >
              <Filter size={14} />
              Фильтр
            </button>

            {/* Create order */}
            {isMarketer && (
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-800 transition-colors"
              >
                <Plus size={15} />
                Новый заказ
              </button>
            )}
          </div>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="mb-4 p-4 bg-white rounded-xl border border-gray-100 flex items-center gap-4">
            <button
              onClick={() => setFilter(null)}
              className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${
                !filter ? "bg-brand-50 text-brand-600" : "text-ink-secondary hover:bg-surface-secondary"
              }`}
            >
              Все заказы
            </button>
            {isMarketer && (
              <button
                onClick={() => setFilter({ marketerId: user!.id })}
                className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  filter?.marketerId === user?.id ? "bg-brand-50 text-brand-600" : "text-ink-secondary hover:bg-surface-secondary"
                }`}
              >
                Мои заказы
              </button>
            )}
            {!isMarketer && (
              <button
                onClick={() => setFilter({ creatorId: user!.id })}
                className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  filter?.creatorId === user?.id ? "bg-brand-50 text-brand-600" : "text-ink-secondary hover:bg-surface-secondary"
                }`}
              >
                Назначенные мне
              </button>
            )}
          </div>
        )}

        {/* Loading state */}
        {isLoading && orders.length === 0 && (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-ink-tertiary">Загружаю заказы...</span>
            </div>
          </div>
        )}

        {/* Kanban */}
        {(!isLoading || orders.length > 0) && (
          <KanbanBoard orders={orders} onCardClick={setSelectedOrder} />
        )}

        {/* Empty state */}
        {!isLoading && orders.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-16 h-16 bg-surface-tertiary rounded-2xl flex items-center justify-center mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9B9B9B" strokeWidth="1.5">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </div>
            <p className="text-sm text-ink-secondary mb-1">Пока нет заказов</p>
            <p className="text-xs text-ink-tertiary">
              {isMarketer ? 'Нажмите "Новый заказ" чтобы создать первый' : "Ожидайте назначения от маркетолога"}
            </p>
          </div>
        )}
      </div>

      {/* Modals */}
      <CreateOrderModal isOpen={showCreate} onClose={() => setShowCreate(false)} />
      <OrderDetailModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />
    </div>
  );
}
