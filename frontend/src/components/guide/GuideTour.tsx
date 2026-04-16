import { useState } from "react";
import type { GuideStep } from "../../data/guideSteps";

type Props = {
  steps: GuideStep[];
  onFinish: () => Promise<void> | void;
  onSkip: () => Promise<void> | void;
  roleLabel: string;
};

function Mockup({ variant }: { variant?: string }) {
  if (!variant) return null;

  const card = "rounded-3xl border border-white/10 bg-slate-950/70 shadow-[0_20px_60px_rgba(0,0,0,0.35)]";

  if (variant === "kanban" || variant === "all-orders" || variant === "progress") {
    return (
      <div className={`${card} p-4`}>
        <div className="flex gap-3">
          {[0, 1, 2].map((col) => (
            <div key={col} className="flex-1 rounded-2xl bg-white/5 p-3">
              <div className="mb-3 h-3 w-20 rounded-full bg-white/15" />
              {[0, 1, 2].map((row) => (
                <div key={row} className="mb-2 rounded-2xl bg-white/10 p-3 last:mb-0">
                  <div className="h-3 w-24 rounded-full bg-white/20" />
                  <div className="mt-2 h-2 w-16 rounded-full bg-green-400/40" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === "order-card" || variant === "tabs" || variant === "approval" || variant === "stages") {
    return (
      <div className={`${card} p-5`}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="h-4 w-40 rounded-full bg-white/20" />
            <div className="mt-2 h-2 w-24 rounded-full bg-white/10" />
          </div>
          <div className="rounded-full bg-green-400/15 px-3 py-1 text-xs text-green-300">IN_PROGRESS</div>
        </div>
        <div className="mb-4 flex gap-2 overflow-hidden">
          {["ТЗ", "Этапы", "Файлы", "Чат"].map((tab, idx) => (
            <div key={tab} className={`rounded-full px-3 py-1.5 text-xs ${idx === 0 ? "bg-green-400/20 text-green-200" : "bg-white/8 text-slate-300"}`}>
              {tab}
            </div>
          ))}
        </div>
        <div className="space-y-3">
          {[0, 1, 2].map((row) => (
            <div key={row} className="rounded-2xl bg-white/7 p-4">
              <div className="h-3 w-32 rounded-full bg-white/15" />
              <div className="mt-3 h-2 w-full rounded-full bg-white/10" />
              <div className="mt-2 h-2 w-5/6 rounded-full bg-white/10" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === "create-order" || variant === "tz-upload" || variant === "chat") {
    return (
      <div className={`${card} p-5`}>
        <div className="mb-4 rounded-2xl bg-white/7 p-4">
          <div className="h-3 w-24 rounded-full bg-white/15" />
          <div className="mt-3 h-11 rounded-2xl bg-white/8" />
          <div className="mt-3 h-24 rounded-2xl bg-white/8" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-white/7 p-4">
            <div className="h-3 w-20 rounded-full bg-white/15" />
            <div className="mt-3 h-16 rounded-2xl border border-dashed border-green-400/30 bg-green-400/5" />
          </div>
          <div className="rounded-2xl bg-white/7 p-4">
            <div className="h-3 w-16 rounded-full bg-white/15" />
            <div className="mt-3 space-y-2">
              <div className="h-2 w-full rounded-full bg-white/10" />
              <div className="h-2 w-4/5 rounded-full bg-white/10" />
              <div className="h-2 w-3/5 rounded-full bg-white/10" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (variant === "users" || variant === "team" || variant === "lead" || variant === "head-creator" || variant === "admin-panel") {
    return (
      <div className={`${card} p-5`}>
        <div className="space-y-3">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="flex items-center gap-3 rounded-2xl bg-white/7 p-3">
              <div className="h-10 w-10 rounded-full bg-green-400/20" />
              <div className="min-w-0 flex-1">
                <div className="h-3 w-28 rounded-full bg-white/15" />
                <div className="mt-2 h-2 w-16 rounded-full bg-white/10" />
              </div>
              <div className="rounded-full bg-white/8 px-3 py-1 text-xs text-slate-300">роль</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === "dashboard" || variant === "bot-report") {
    return (
      <div className={`${card} p-5`}>
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((cardIdx) => (
            <div key={cardIdx} className="rounded-2xl bg-white/7 p-4">
              <div className="h-2 w-16 rounded-full bg-white/15" />
              <div className="mt-4 h-8 w-12 rounded-xl bg-green-400/20" />
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-2xl bg-white/7 p-4">
          <div className="flex items-end gap-3">
            {[28, 54, 36, 68, 44, 72].map((h, idx) => (
              <div key={idx} className="flex-1 rounded-t-2xl bg-green-400/35" style={{ height: `${h}px` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${card} p-5`}>
      <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-10 text-center text-sm text-slate-300">
        Интерактивный макет шага
      </div>
    </div>
  );
}

export default function GuideTour({ steps, onFinish, onSkip, roleLabel }: Props) {
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);

  const step = steps[index];
  const progress = ((index + 1) / steps.length) * 100;
  const isLast = index === steps.length - 1;

  const run = async (action: () => Promise<void> | void) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.22),_transparent_32%),linear-gradient(180deg,_rgba(15,23,42,0.95),_rgba(2,6,23,0.98))] p-5 sm:p-8 shadow-[0_35px_80px_rgba(0,0,0,0.45)]">
      <div className="absolute -right-16 top-8 h-32 w-32 rounded-full bg-green-400/10 blur-3xl" />
      <div className="absolute left-8 top-24 h-28 w-28 rounded-full bg-sky-400/10 blur-3xl" />

      <div className="relative mb-6">
        <div className="mb-2 flex items-center justify-between gap-3 text-xs uppercase tracking-[0.24em] text-slate-400">
          <span>Шаг {index + 1} из {steps.length}</span>
          <span>{roleLabel}</span>
        </div>
        <div className="h-2 rounded-full bg-white/8">
          <div className="h-2 rounded-full bg-gradient-to-r from-green-400 to-emerald-300 transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="relative grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
        <div className="rounded-[28px] border border-white/10 bg-white/6 p-6 sm:p-8">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-green-400/15 text-3xl shadow-[inset_0_0_0_1px_rgba(74,222,128,0.25)]">
            {step.emoji}
          </div>
          <h2 className="text-3xl font-black tracking-tight text-white sm:text-4xl">{step.title}</h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-200 sm:text-lg">
            {step.description}
          </p>
        </div>

        <Mockup variant={step.image} />
      </div>

      <div className="relative mt-8 flex flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => run(onSkip)}
          disabled={busy}
          className="order-3 text-sm font-medium text-slate-300 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-50 sm:order-1"
        >
          Пропустить
        </button>

        <div className="order-1 flex gap-3 sm:order-2">
          <button
            type="button"
            onClick={() => setIndex((prev) => Math.max(0, prev - 1))}
            disabled={busy || index === 0}
            className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Prev
          </button>
          {isLast ? (
            <button
              type="button"
              onClick={() => run(onFinish)}
              disabled={busy}
              className="rounded-2xl bg-green-400 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-green-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Завершить
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIndex((prev) => Math.min(steps.length - 1, prev + 1))}
              disabled={busy}
              className="rounded-2xl bg-green-400 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-green-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
