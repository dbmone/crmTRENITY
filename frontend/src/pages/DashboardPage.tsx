import { useEffect, useState } from "react";
import { LayoutDashboard, TrendingUp, Clock, CheckCircle, Users, AlertTriangle, FileText } from "lucide-react";
import Header from "../components/layout/Header";
import * as api from "../api/client";

interface DashboardData {
  orders: {
    total: number;
    new: number;
    inProgress: number;
    onReview: number;
    done: number;
    archived: number;
    overdue: number;
  };
  users: {
    total: number;
    ADMIN?: number;
    HEAD_MARKETER?: number;
    MARKETER?: number;
    HEAD_CREATOR?: number;
    LEAD_CREATOR?: number;
    CREATOR?: number;
  };
  reportsLastWeek: number;
  avgCompletionDays: string | null;
}

export default function DashboardPage() {
  const [data,    setData]    = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const d = await (api as any).getDashboard();
        setData(d);
      } catch {
        setError(true);
      }
      setLoading(false);
    })();
  }, []);

  const STATUS_BARS = [
    { key: "new",        label: "Новые",      color: "text-blue-400",    bg: "bg-blue-400" },
    { key: "inProgress", label: "В работе",   color: "text-amber-400",   bg: "bg-amber-400" },
    { key: "onReview",   label: "На правках", color: "text-purple-400",  bg: "bg-purple-400" },
    { key: "done",       label: "Готово",     color: "text-green-400",   bg: "bg-green-400" },
    { key: "archived",   label: "Архив",      color: "text-ink-tertiary",bg: "bg-ink-tertiary" },
  ] as const;

  const o = data?.orders;
  const totalNonArchived = o ? o.total - (o.archived || 0) : 0;

  return (
    <div className="min-h-screen bg-bg-base">
      <Header />

      <div className="max-w-5xl mx-auto px-6 py-8" data-tour="dashboard-page">
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
        ) : error || !data ? (
          <div className="text-center py-16 text-ink-tertiary">Не удалось загрузить данные</div>
        ) : (
          <div className="space-y-6">
            {/* KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KPICard icon={<TrendingUp size={16} className="text-green-400" />}    label="Всего заказов" value={o!.total}      accent="green" />
              <KPICard icon={<Clock size={16} className="text-amber-400" />}         label="В работе"      value={o!.inProgress}  accent="amber" />
              <KPICard icon={<AlertTriangle size={16} className="text-red-400" />}   label="Просрочено"    value={o!.overdue}     accent="red" />
              <KPICard icon={<CheckCircle size={16} className="text-green-400" />}   label="Завершено"     value={o!.done}        accent="green" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* By status */}
              <div className="bg-bg-surface border border-bg-border rounded-card p-5">
                <h3 className="text-sm font-semibold text-ink-primary mb-4">По статусам</h3>
                <div className="space-y-3">
                  {STATUS_BARS.map(({ key, label, color, bg }) => {
                    const count = o![key] ?? 0;
                    const pct   = o!.total ? Math.round((count / o!.total) * 100) : 0;
                    return (
                      <div key={key}>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-xs font-medium ${color}`}>{label}</span>
                          <span className="text-xs text-ink-tertiary">{count} ({pct}%)</span>
                        </div>
                        <div className="h-1.5 bg-bg-raised rounded-full overflow-hidden">
                          <div className={`h-full ${bg} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right panel */}
              <div className="space-y-4">
                {/* Team */}
                <div className="bg-bg-surface border border-bg-border rounded-card p-5">
                  <h3 className="text-sm font-semibold text-ink-primary mb-3">Команда</h3>
                  <div className="space-y-2">
                    {[
                      { label: "Маркетологов", value: (data.users.MARKETER ?? 0) + (data.users.HEAD_MARKETER ?? 0), color: "text-blue-400" },
                      { label: "Креаторов",    value: (data.users.CREATOR ?? 0) + (data.users.LEAD_CREATOR ?? 0) + (data.users.HEAD_CREATOR ?? 0), color: "text-green-400" },
                      { label: "Всего польз.", value: data.users.total, color: "text-ink-secondary" },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="flex items-center justify-between p-2.5 bg-bg-raised rounded-lg">
                        <div className="flex items-center gap-2">
                          <Users size={13} className={color} />
                          <span className="text-sm text-ink-secondary">{label}</span>
                        </div>
                        <span className="text-sm font-semibold text-ink-primary">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Extra stats */}
                <div className="bg-bg-surface border border-bg-border rounded-card p-5">
                  <h3 className="text-sm font-semibold text-ink-primary mb-3">Активность</h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-2.5 bg-bg-raised rounded-lg">
                      <div className="flex items-center gap-2">
                        <FileText size={13} className="text-amber-400" />
                        <span className="text-sm text-ink-secondary">Отчётов за неделю</span>
                      </div>
                      <span className="text-sm font-semibold text-ink-primary">{data.reportsLastWeek}</span>
                    </div>
                    {data.avgCompletionDays && (
                      <div className="flex items-center justify-between p-2.5 bg-bg-raised rounded-lg">
                        <div className="flex items-center gap-2">
                          <Clock size={13} className="text-purple-400" />
                          <span className="text-sm text-ink-secondary">Ср. время выполнения</span>
                        </div>
                        <span className="text-sm font-semibold text-ink-primary">{data.avgCompletionDays} дн.</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
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
