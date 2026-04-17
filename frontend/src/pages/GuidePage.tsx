import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Bot, CheckCircle2, Compass, MonitorSmartphone, PlayCircle, Sparkles } from "lucide-react";
import * as api from "../api/client";
import { TOUR_STEPS } from "../data/tourSteps";
import { useAuthStore } from "../store/auth.store";
import { useTourStore } from "../store/tour.store";
import type { UserRole } from "../types";

const ROLE_LABELS: Record<UserRole, string> = {
  CREATOR: "Креатор",
  LEAD_CREATOR: "Лид креаторов",
  HEAD_CREATOR: "Главный креатор",
  MARKETER: "Маркетолог",
  HEAD_MARKETER: "Главный маркетолог",
  ADMIN: "Администратор",
};

function persistGuideSeen() {
  const current = useAuthStore.getState().user;
  if (!current) return;

  const next = { ...current, guideSeenAt: new Date().toISOString() };
  localStorage.setItem("user", JSON.stringify(next));
  useAuthStore.setState({ user: next });
}

export default function GuidePage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const startTour = useTourStore((s) => s.start);
  const [busy, setBusy] = useState(false);

  const steps = useMemo(() => {
    if (!user) return [];
    return TOUR_STEPS[user.role] ?? [];
  }, [user]);

  const finishGuide = async () => {
    await api.markGuideSeen();
    persistGuideSeen();
    navigate("/", { replace: true });
  };

  const handleStart = async () => {
    if (!user) return;
    startTour(user.role, {
      onFinish: finishGuide,
      onSkip: finishGuide,
    });
    navigate("/", { replace: true });
  };

  const handleSkip = async () => {
    setBusy(true);
    try {
      await finishGuide();
    } finally {
      setBusy(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-full bg-bg-base">

      <main className="mx-auto max-w-4xl px-4 py-4 sm:px-6 sm:py-6 content-ready">
        <section className="overflow-hidden rounded-[32px] border border-bg-border bg-bg-surface shadow-modal animate-fade-in">
          <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="p-5 sm:p-7 lg:p-8">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-green-300">
                <Compass size={14} />
                Интерактивный гайд
              </div>

              <h1 className="max-w-3xl text-2xl font-black tracking-tight text-ink-primary sm:text-3xl">
                Пройдём CRM в живом интерфейсе, а не по слайдам
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-secondary">
                Гайд сам проведёт тебя по CRM: откроет нужные экраны, карточки заказа, вкладки и разделы.
                Тебе остаётся только нажимать «Далее», читать пояснения и смотреть, что именно происходит на сайте,
                что дублируется в Telegram и куда потом попадает результат.
              </p>

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <div className="rounded-2xl border border-bg-border bg-bg-raised/60 p-3 animate-fade-in">
                  <MonitorSmartphone size={16} className="mb-1.5 text-green-400" />
                  <p className="text-sm font-semibold text-ink-primary">Живой интерфейс</p>
                  <p className="mt-1 text-xs leading-5 text-ink-secondary">
                    Подсветка идёт по настоящим кнопкам, вкладкам и разделам CRM, а не по макетам.
                  </p>
                </div>
                <div className="rounded-2xl border border-bg-border bg-bg-raised/60 p-3 animate-fade-in" style={{ animationDelay: "40ms" }}>
                  <Bot size={16} className="mb-1.5 text-blue-400" />
                  <p className="text-sm font-semibold text-ink-primary">Связь с ботом</p>
                  <p className="mt-1 text-xs leading-5 text-ink-secondary">
                    По пути гайд объясняет, что дублируется в Telegram и где это потом искать.
                  </p>
                </div>
                <div className="rounded-2xl border border-bg-border bg-bg-raised/60 p-3 animate-fade-in" style={{ animationDelay: "80ms" }}>
                  <Sparkles size={16} className="mb-1.5 text-amber-400" />
                  <p className="text-sm font-semibold text-ink-primary">Без сложных терминов</p>
                  <p className="mt-1 text-xs leading-5 text-ink-secondary">
                    Только понятные русские формулировки: что нажать, что увидеть и что произойдёт.
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleStart}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-green-500 px-5 py-3 text-sm font-black text-black transition-colors hover:bg-green-400"
                >
                  <PlayCircle size={16} />
                  Начать интерактивный тур
                </button>
                <button
                  type="button"
                  onClick={handleSkip}
                  disabled={busy}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-bg-border px-5 py-3 text-sm font-semibold text-ink-primary transition-colors hover:bg-bg-raised disabled:opacity-50"
                >
                  <ArrowRight size={16} />
                  Пока пропустить
                </button>
              </div>
            </div>

            <div className="border-t border-bg-border bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.18),_transparent_34%),linear-gradient(180deg,rgba(10,14,20,0.92),rgba(5,8,13,0.98))] p-4 sm:p-6 lg:border-l lg:border-t-0">
              <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-green-300/90">
                <CheckCircle2 size={14} />
                Твой маршрут
              </div>
              <h2 className="text-xl font-black text-white">Роль: {ROLE_LABELS[user.role] ?? user.role}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Для твоей роли я покажу {steps.length} ключевых шагов. Тур можно проходить заново из вкладки «Гайд» в любое время.
              </p>

              <div className="mt-4 space-y-2">
                {steps.slice(0, 8).map((step, index) => (
                  <div key={`${step.route}-${step.title}`} className="rounded-xl border border-white/10 bg-white/5 p-3 animate-fade-in" style={{ animationDelay: `${index * 40}ms` }}>
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-xl bg-white/10 text-[11px] font-black text-green-300">
                        {String(index + 1).padStart(2, "0")}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Шаг {index + 1}</div>
                        <div className="mt-0.5 text-sm font-semibold text-white leading-snug">{step.title}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {steps.length > 8 && (
                <p className="mt-4 text-sm text-slate-400">
                  И это ещё не всё: остальные шаги продолжатся уже прямо на рабочих экранах CRM.
                </p>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
