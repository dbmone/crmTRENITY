import { useEffect, useState } from "react";
import { Archive, Search, X } from "lucide-react";
import OrderDetailModal from "../components/kanban/OrderDetailModal";
import { Order } from "../types";
import * as api from "../api/client";

export default function ArchivePage() {
  const [orders,  setOrders]  = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");
  const [selected, setSelected] = useState<Order | null>(null);

  const load = async (q?: string) => {
    setLoading(true);
    try {
      const data = await api.getOrders({ includeArchived: "true", status: "ARCHIVED", ...(q ? { search: q } : {}) } as any);
      const list = Array.isArray(data) ? data : (data.orders ?? []);
      setOrders(list);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const handleSearch = (v: string) => {
    setSearch(v);
    if (timer) clearTimeout(timer);
    setTimer(setTimeout(() => load(v), 400));
  };

  return (
    <div className="min-h-full bg-bg-base">

      <div className="max-w-4xl mx-auto px-6 py-8" data-tour="archive-page">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-ink-primary flex items-center gap-2">
              <Archive size={20} className="text-ink-tertiary" />
              Архив
            </h1>
            <p className="text-sm text-ink-tertiary mt-1">Завершённые и архивные заказы</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-5 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary pointer-events-none" />
          <input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Поиск..."
            className="w-full pl-9 pr-8 py-2.5 text-sm bg-bg-surface border border-bg-border rounded-lg text-ink-primary placeholder-ink-tertiary outline-none focus:border-green-500/50 transition-colors"
          />
          {search && (
            <button onClick={() => { setSearch(""); load(); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-tertiary">
              <X size={14} />
            </button>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-bg-surface border border-bg-border rounded-card p-4 animate-fade-in" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="skeleton h-4 w-48 mb-2" />
                    <div className="skeleton h-3 w-32" />
                  </div>
                  <div className="skeleton h-3 w-20 flex-shrink-0" />
                </div>
              </div>
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-16 text-ink-tertiary animate-fade-in">
            <Archive size={32} className="mx-auto mb-3 opacity-30" />
            <p>В архиве пусто</p>
          </div>
        ) : (
          <div className="space-y-2 stagger-children">
            {orders.map((o) => (
              <button
                key={o.id}
                onClick={() => setSelected(o)}
                className="w-full text-left bg-bg-surface border border-bg-border rounded-card p-4 hover:border-bg-hover transition-colors"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-ink-primary truncate">{o.title}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-ink-tertiary">
                      <span>@{o.marketer.telegramUsername || o.marketer.displayName}</span>
                      {o.deadline && (
                        <span>• {new Date(o.deadline).toLocaleDateString("ru-RU")}</span>
                      )}
                      <span>• {o.creators?.length ?? 0} креаторов</span>
                    </div>
                  </div>
                  <span className="text-xs text-ink-tertiary flex-shrink-0">
                    {new Date(o.updatedAt).toLocaleDateString("ru-RU")}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <OrderDetailModal order={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
