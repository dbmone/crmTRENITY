import { useEffect, useState } from "react";
import { TrendingUp, DollarSign, Info } from "lucide-react";
import * as api from "../api/client";
import { useAuthStore } from "../store/auth.store";
import type { EarningEntry } from "../types";

const ROLE_LABELS: Record<string, string> = {
  CREATOR:              "Как креатор",
  LEAD_CREATOR:         "Как тим лид",
  LEAD_CREATOR_TEAM:    "За команду (тим лид)",
  HEAD_LEAD_CREATOR:    "Как гл. тим лид",
  HEAD_LEAD_CREATOR_TEAM: "За команду (гл. тим лид)",
  HEAD_CREATOR_TEAM:    "За команду (гл. креатор)",
  HEAD_CREATOR_SELF:    "Как исполнитель",
  MARKETER:             "Как маркетолог",
  HEAD_MARKETER:        "Как гл. маркетолог",
  HELPER_CHECKBOXSTORYBOARD: "Помощь с раскадровкой",
  HELPER_CHECKBOXANIMATION:  "Помощь с анимацией",
  HELPER_CHECKBOXEDITING:    "Помощь с монтажом",
  HELPER_CHECKBOXSCENARIO:   "Помощь со сценарием",
};

function fmt(n: number) {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

export default function EarningsPage() {
  const user = useAuthStore((s) => s.user);
  const [entries, setEntries] = useState<EarningEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getMyEarnings().then(setEntries).finally(() => setLoading(false));
  }, []);

  const total = entries.reduce((s, e) => s + e.amount, 0);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <TrendingUp size={22} className="text-green-400" />
        <h1 className="text-xl font-black text-ink-primary">Мои заработки</h1>
      </div>

      {/* Итого */}
      <div className="mb-6 flex items-center gap-4 rounded-2xl border border-green-500/20 bg-green-500/8 p-5">
        <DollarSign size={28} className="text-green-400" />
        <div>
          <div className="text-sm text-ink-tertiary">Итого за выполненные заказы</div>
          <div className="text-2xl font-black text-green-400">{fmt(total)} ₽</div>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-2xl border border-bg-border bg-bg-surface p-10 text-center text-ink-tertiary">
          Нет выполненных заказов с расчётом
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((e, i) => (
            <div key={`${e.orderId}-${e.role}-${i}`} className="rounded-2xl border border-bg-border bg-bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-ink-primary">{e.orderTitle}</div>
                  <div className="mt-1 text-xs text-ink-tertiary">
                    {ROLE_LABELS[e.role] ?? e.role}
                    {e.hasTax && (
                      <span className="ml-2 rounded-full bg-amber-400/15 px-1.5 py-0.5 text-amber-300">
                        НДС +6%
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-black text-green-400">{fmt(e.amount)} ₽</div>
                  <div className="text-xs text-ink-tertiary">
                    {e.adjustedPct !== e.basePct
                      ? <span title={`База: ${e.basePct}%, с вычетами: ${e.adjustedPct}%`}>
                          {e.adjustedPct}% <span className="line-through opacity-50">{e.basePct}%</span>
                        </span>
                      : `${e.basePct}%`
                    }
                  </div>
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between text-xs text-ink-tertiary">
                <span>Стоимость заказа: {fmt(e.orderPrice)} ₽{e.hasTax ? ` → ${fmt(e.effectivePrice)} ₽` : ""}</span>
                <span>{new Date(e.createdAt).toLocaleDateString("ru-RU")}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 flex items-start gap-2 rounded-2xl border border-bg-border bg-bg-raised/50 p-4 text-xs text-ink-tertiary">
        <Info size={14} className="mt-0.5 flex-shrink-0" />
        <span>Показаны только заказы со статусом «Готово» и указанной стоимостью. Проценты настраиваются администратором.</span>
      </div>
    </div>
  );
}
