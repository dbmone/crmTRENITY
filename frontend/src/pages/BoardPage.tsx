import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Search, SlidersHorizontal, X } from "lucide-react";
import * as api from "../api/client";
import CreateOrderModal from "../components/kanban/CreateOrderModal";
import KanbanBoard from "../components/kanban/KanbanBoard";
import KanbanSkeleton from "../components/kanban/KanbanSkeleton";
import OrderDetailModal from "../components/kanban/OrderDetailModal";
import { TOUR_STEPS } from "../data/tourSteps";
import { useAuthStore } from "../store/auth.store";
import { useOrdersStore } from "../store/orders.store";
import { useTourStore } from "../store/tour.store";
import { Order } from "../types";

export default function BoardPage() {
  const user = useAuthStore((s) => s.user);
  const { orders, isLoading, fetchOrders, filter, setFilter } = useOrdersStore();

  const [showCreate, setShowCreate] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [search, setSearch] = useState("");
  const [searchTimer, setSearchTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [dragEnabled, setDragEnabled] = useState(false);

  const tourActive = useTourStore((s) => s.active);
  const tourRole = useTourStore((s) => s.role);
  const tourStepIndex = useTourStore((s) => s.stepIndex);

  const isMarketer =
    user?.permissions?.create_order ??
    ["MARKETER", "HEAD_MARKETER", "ADMIN", "HEAD_CREATOR"].includes(user?.role ?? "");

  const tourStep = useMemo(
    () => (tourActive && tourRole ? TOUR_STEPS[tourRole]?.[tourStepIndex] ?? null : null),
    [tourActive, tourRole, tourStepIndex]
  );

  const forcedTab = useMemo(() => {
    switch (tourStep?.target) {
      case "tab-stages":
        return "stages" as const;
      case "tab-tz":
      case "tz-voice":
      case "tz-voice-ai":
      case "tz-upload-zone":
      case "tz-send-telegram":
        return "tz" as const;
      case "tab-files":
      case "files-upload-zone":
        return "files" as const;
      case "tab-reports":
        return "reports" as const;
      case "tab-comments":
        return "comments" as const;
      default:
        return null;
    }
  }, [tourStep?.target]);

  useEffect(() => {
    void fetchOrders();
    (async () => {
      try {
        const settings = await api.getSettings();
        setDragEnabled(settings.kanban_drag_enabled === "true");
      } catch {
        // noop
      }
    })();
  }, [fetchOrders]);

  useEffect(() => {
    if (!tourActive || tourStep?.route !== "/") {
      setShowCreate(false);
      setSelectedOrder(null);
      return;
    }

    const target = tourStep.target ?? "";
    const createTargets = new Set([
      "create-btn",
      "create-modal",
      "create-title",
      "create-description",
      "create-tz-files",
      "create-submit",
    ]);
    const orderTargets = new Set([
      "order-modal",
      "tab-stages",
      "tab-tz",
      "tab-files",
      "tab-reports",
      "tab-comments",
      "tz-voice",
      "tz-voice-ai",
      "tz-upload-zone",
      "tz-send-telegram",
      "files-upload-zone",
    ]);
    const firstOrder = orders[0] ?? null;

    if (target === "create-btn") {
      setShowCreate(false);
      setSelectedOrder(null);
      return;
    }

    if (createTargets.has(target)) {
      setShowCreate(true);
      setSelectedOrder(null);
      return;
    }

    setShowCreate(false);

    if (target === "order-card") {
      setSelectedOrder(null);
      return;
    }

    if (orderTargets.has(target)) {
      if (firstOrder) {
        setSelectedOrder((prev) => (prev?.id === firstOrder.id ? prev : firstOrder));
      }
      return;
    }

    setSelectedOrder(null);
  }, [orders, tourActive, tourStep?.route, tourStep?.target]);

  const handleSearch = (value: string) => {
    setSearch(value);
    if (searchTimer) clearTimeout(searchTimer);

    const timer = setTimeout(() => {
      useOrdersStore.setState((state: any) => ({
        ...state,
        filter: { ...(state.filter ?? {}), search: value || undefined },
      }));
      void fetchOrders();
    }, 400);

    setSearchTimer(timer);
  };

  const clearSearch = () => {
    setSearch("");
    useOrdersStore.setState((state: any) => {
      const nextFilter = { ...(state.filter ?? {}) };
      delete nextFilter.search;
      return { ...state, filter: Object.keys(nextFilter).length ? nextFilter : null };
    });
    void fetchOrders();
  };

  const activeFilter = filter?.marketerId === user?.id || filter?.creatorId === user?.id;

  return (
    <div className="min-h-0 flex-1 flex flex-col overflow-hidden bg-bg-base">
      <div className="flex items-center gap-2 border-b border-bg-border bg-bg-surface px-3 py-2.5 flex-shrink-0 sm:px-6">
        <div className="relative flex-1 sm:flex-none sm:w-48">
          <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary" />
          <input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Поиск..."
            className="w-full rounded-lg border border-bg-border bg-bg-raised py-1.5 pl-8 pr-7 text-sm text-ink-primary outline-none transition-colors placeholder-ink-tertiary focus:border-green-500/40"
          />
          {search && (
            <button
              onClick={clearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-tertiary hover:text-ink-primary"
            >
              <X size={13} />
            </button>
          )}
        </div>

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
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
            activeFilter
              ? "border-green-500/30 bg-green-500/10 text-green-400"
              : "border-bg-border text-ink-tertiary hover:border-bg-hover hover:text-ink-primary"
          }`}
        >
          <SlidersHorizontal size={12} />
          <span className="hidden sm:inline">{activeFilter ? "Мои заказы" : "Все заказы"}</span>
        </button>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-xs text-ink-tertiary sm:block">{orders.length} заказов</span>

          <button
            onClick={() => void fetchOrders()}
            title="Обновить"
            className="rounded-lg border border-bg-border p-1.5 text-ink-tertiary transition-colors hover:bg-bg-raised hover:text-ink-primary"
          >
            <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} />
          </button>

          {isMarketer && (
            <button
              onClick={() => setShowCreate(true)}
              data-tour="create-btn"
              className="flex items-center gap-1.5 rounded-lg bg-green-500 px-3 py-1.5 text-xs font-bold text-black transition-colors hover:bg-green-400 sm:px-3.5"
            >
              <Plus size={13} />
              <span className="hidden sm:inline">Новый заказ</span>
            </button>
          )}
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden pt-3" data-tour="board">
        {isLoading && orders.length === 0 && <KanbanSkeleton />}

        {!isLoading && orders.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center animate-fade-in">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-bg-border bg-bg-surface">
              <div className="h-7 w-7 rounded-lg border-2 border-dashed border-bg-hover" />
            </div>
            <p className="mb-1 text-sm font-medium text-ink-secondary">Нет заказов</p>
            <p className="text-xs text-ink-tertiary">
              {isMarketer ? "Создай первый заказ" : "Ожидай назначения"}
            </p>
          </div>
        )}

        {orders.length > 0 && (
          <KanbanBoard orders={orders} onCardClick={setSelectedOrder} dragEnabled={dragEnabled} />
        )}
      </div>

      <CreateOrderModal isOpen={showCreate} onClose={() => setShowCreate(false)} />
      <OrderDetailModal order={selectedOrder} onClose={() => setSelectedOrder(null)} forcedTab={forcedTab} />
    </div>
  );
}
