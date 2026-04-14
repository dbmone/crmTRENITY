import { useEffect, useState } from "react";
import { LayoutDashboard, TrendingUp, Clock, CheckCircle, Users, AlertTriangle } from "lucide-react";
import Header from "../components/layout/Header";
import * as api from "../api/client";

interface Stats {
  total: number; byStatus: Record<string, number>;
  overdue: number; avgDays: number; activeCreators: number; totalMarketers: number;
}

export default function DashboardPage() {
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await (api as any).getDashboard();
        setStats(data);
      } catch {
        // Fallback — собираем сами из /api/orders
        try {
          const r = await api.getOrders({} as any);
          const orders = Array.isArray(r) ? r : (r.orders ?? []);
          const now = Date.now();
          setStats({
            total: orders.length,
            byStatus: orders.reduce((a: any, o: any) => { a[o.status] = (a[o.status] || 0) + 1; return a; }, {}),
            overdue: orders.filter((o: any) => o.deadline && new Date(o.deadline).getTime() < now && o.status !== "DONE").length,
            avgDays: 0,
            activeCreators: [...new Set(orders.flatMap((o: any) => o.creators?.map((c: any) => c.creatorId) ?? []))].length,
            totalMarketers: [...new Set(orders.map((o: any) => o.marketerId))].length,
          });
        } catch {}
      }
      setLoading(false);
    })();
  }, []);

  const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
    NEW:         { label: "Новые",       color: "text-blue-400",   bg: "bg-blue-400" },
    IN_PROGRESS: { label: "В работе",    color: "text-amber-400",  bg: "bg-amber-400" },
    ON_REVIEW:   { label: "На правках",  color: "text-purple-400", bg: "bg-purple-400" },
    DONE:        { label: "Готово",      color: "text-green-400",  bg: "bg-green-400" },
    ARCHIVED:    { label: "Архив",       color: "text-ink-tertiary",bg:"bg-ink-tertiary" },
  };

  return (
    <div className="min-h-screen bg-bg-base">
      <Header />

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-ink-primary flex items-center gap-2">
            <LayoutDashboard size={20} className="text-green-400" />
            Аналитика
          </h1>
          <p className="text-sm text-ink-tertiary mt-1">Общая статистика по заказам</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : stats ? (
          <div className="space-y-6">
            {/* KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KPICard icon={<TrendingUp size={16} className="text-green-400" />} label="Всего заказов" value={stats.total} accent="green" />
              <KPICard icon={<Clock size={16} className="text-amber-400" />} label="В работе" value={stats.byStatus?.IN_PROGRESS ?? 0} accent="amber" />
              <KPICard icon={<AlertTriangle size={16} className="text-red-400" />} label="Просрочено" value={stats.overdue} accent="red" />
              <KPICard icon={<CheckCircle size={16} className="text-green-400" />} label="Завершено" value={stats.byStatus?.DONE ?? 0} accent="green" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* By status */}
              <div className="bg-bg-surface border border-bg-border rounded-card p-5">
                <h3 className="text-sm font-semibold text-ink-primary mb-4">По статусам</h3>
                <div className="space-y-3">
                  {Object.entries(STATUS_LABELS).map(([status, meta]) => {
                    const count = stats.byStatus?.[status] ?? 0;
                    const pct   = stats.total ? Math.round((count / stats.total) * 100) : 0;
                    return (
                      <div key={status}>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-xs font-medium ${meta.color}`}>{meta.label}</span>
                          <span className="text-xs text-ink-tertiary">{count} ({pct}%)</span>
                        </div>
                        <div className="h-1.5 bg-bg-raised rounded-full overflow-hidden">
                          <div
                            className={`h-full ${meta.bg} rounded-full transition-all`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Team */}
              <div className="bg-bg-surface border border-bg-border rounded-card p-5">
                <h3 className="text-sm font-semibold text-ink-primary mb-4">Команда</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-bg-raised rounded-lg">
                    <div className="flex items-center gap-2">
                      <Users size={14} className="text-blue-400" />
                      <span className="text-sm text-ink-secondary">Маркетологов</span>
                    </div>
                    <span className="text-sm font-semibold text-ink-primary">{stats.totalMarketers}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-bg-raised rounded-lg">
                    <div className="flex items-center gap-2">
                      <Users size={14} className="text-green-400" />
                      <span className="text-sm text-ink-secondary">Активных креаторов</span>
                    </div>
                    <span className="text-sm font-semibold text-ink-primary">{stats.activeCreators}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-bg-raised rounded-lg">
                    <div className="flex items-center gap-2">
                      <TrendingUp size={14} className="text-amber-400" />
                      <span className="text-sm text-ink-secondary">На правках</span>
                    </div>
                    <span className="text-sm font-semibold text-ink-primary">{stats.byStatus?.ON_REVIEW ?? 0}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-16 text-ink-tertiary">Не удалось загрузить данные</div>
        )}
      </div>
    </div>
  );
}

function KPICard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number; accent: string }) {
  const borders: Record<string, string> = {
    green: "border-green-500/20", amber: "border-amber-500/20",
    red: "border-red-500/20", blue: "border-blue-500/20",
  };
  return (
    <div className={`bg-bg-surface border ${borders[accent] || "border-bg-border"} rounded-card p-4`}>
      <div className="flex items-center gap-2 mb-2">{icon}<span className="text-xs text-ink-tertiary">{label}</span></div>
      <div className="text-3xl font-bold text-ink-primary">{value}</div>
    </div>
  );
}
