import { useEffect, useState } from "react";
import { useOrdersStore } from "../store/orders.store";
import { useAuthStore } from "../store/auth.store";
import { Order } from "../types";
import KanbanBoard from "../components/kanban/KanbanBoard";
import CreateOrderModal from "../components/kanban/CreateOrderModal";
import OrderDetailModal from "../components/kanban/OrderDetailModal";
import Header from "../components/layout/Header";
import { Plus, RefreshCw, Search, X, SlidersHorizontal } from "lucide-react";

export default function BoardPage() {
  const user = useAuthStore((s) => s.user);
  const { orders, isLoading, fetchOrders, filter, setFilter } = useOrdersStore();

  const [showCreate,    setShowCreate]    = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [search,        setSearch]        = useState("");
  const [searchTimer,   setSearchTimer]   = useState<ReturnType<typeof setTimeout> | null>(null);

  const isMarketer = user?.permissions?.create_order ?? ["MARKETER", "HEAD_MARKETER", "ADMIN", "HEAD_CREATOR"].includes(user?.role ?? "");

  useEffect(() => { fetchOrders(); }, []);

  const handleSearch = (val: string) => {
    setSearch(val);
    if (searchTimer) clearTimeout(searchTimer);
    const t = setTimeout(() => {
      useOrdersStore.setState((s: any) => ({
        ...s,
        filter: { ...(s.filter ?? {}), search: val || undefined },
      }));
      fetchOrders();
    }, 400);
    setSearchTimer(t);
  };

  const clearSearch = () => {
    setSearch("");
    useOrdersStore.setState((s: any) => {
      const f = { ...(s.filter ?? {}) };
      delete f.search;
      return { ...s, filter: Object.keys(f).length ? f : null };
    });
    fetchOrders();
  };

  const activeFilter = filter?.marketerId === user?.id || filter?.creatorId === user?.id;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-bg-base">
      <Header />

      {/* Compact toolbar */}
      <div className="flex items-center gap-2 px-3 sm:px-6 py-2.5 border-b border-bg-border bg-bg-surface flex-shrink-0">
        {/* Search */}
        <div className="relative flex-1 sm:flex-none sm:w-48">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary pointer-events-none" />
          <input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Поиск..."
            className="w-full pl-8 pr-7 py-1.5 text-sm bg-bg-raised border border-bg-border rounded-lg text-ink-primary placeholder-ink-tertiary outline-none focus:border-green-500/40 transition-colors"
          />
          {search && (
            <button onClick={clearSearch} className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-tertiary hover:text-ink-primary">
              <X size={13} />
            </button>
          )}
        </div>

        {/* Filter toggle */}
        <button
          onClick={() => {
            if (activeFilter) {
              setFilter(null);
            } else if (isMarketer) {
              setFilter({ marketerId: user!.id });
            } else {
              setFilter({ creatorId: user!.id });
            }
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            activeFilter
              ? "bg-green-500/10 text-green-400 border-green-500/30"
              : "border-bg-border text-ink-tertiary hover:text-ink-primary hover:border-bg-hover"
          }`}
        >
          <SlidersHorizontal size={12} />
          <span className="hidden sm:inline">{activeFilter ? "Мои заказы" : "Все заказы"}</span>
        </button>

        <div className="ml-auto flex items-center gap-2">
          {/* Stats */}
          <span className="text-xs text-ink-tertiary hidden sm:block">
            {orders.length} заказов
          </span>

          {/* Refresh */}
          <button
            onClick={() => fetchOrders()}
            title="Обновить"
            className="p-1.5 rounded-lg hover:bg-bg-raised border border-bg-border text-ink-tertiary hover:text-ink-primary transition-colors"
          >
            <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} />
          </button>

          {/* Create */}
          {isMarketer && (
            <button
              onClick={() => setShowCreate(true)}
              data-tour="create-btn"
              className="flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 rounded-lg bg-green-500 text-black text-xs font-bold hover:bg-green-400 transition-colors"
            >
              <Plus size={13} />
              <span className="hidden sm:inline">Новый заказ</span>
            </button>
          )}
        </div>
      </div>

      {/* Board area — takes remaining height */}
      <div className="flex-1 overflow-hidden relative pt-3" data-tour="board">
        {/* Full-height loading */}
        {isLoading && orders.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-ink-tertiary">Загрузка...</p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && orders.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-2xl bg-bg-surface border border-bg-border flex items-center justify-center mb-4">
              <div className="w-7 h-7 border-2 border-dashed border-bg-hover rounded-lg" />
            </div>
            <p className="text-sm text-ink-secondary mb-1 font-medium">Нет заказов</p>
            <p className="text-xs text-ink-tertiary">
              {isMarketer ? 'Создай первый заказ' : "Ожидай назначения"}
            </p>
          </div>
        )}

        {(!isLoading || orders.length > 0) && orders.length > 0 && (
          <KanbanBoard orders={orders} onCardClick={setSelectedOrder} />
        )}
      </div>

      <CreateOrderModal isOpen={showCreate} onClose={() => setShowCreate(false)} />
      <OrderDetailModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />
    </div>
  );
}
