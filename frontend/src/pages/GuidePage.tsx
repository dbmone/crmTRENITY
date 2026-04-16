import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/layout/Header";
import GuideTour from "../components/guide/GuideTour";
import { GUIDE_STEPS } from "../data/guideSteps";
import { useAuthStore } from "../store/auth.store";
import * as api from "../api/client";
import type { UserRole } from "../types";

const ROLE_LABELS: Record<UserRole, string> = {
  CREATOR: "Creator",
  LEAD_CREATOR: "Lead Creator",
  HEAD_CREATOR: "Head Creator",
  MARKETER: "Marketer",
  HEAD_MARKETER: "Head Marketer",
  ADMIN: "Admin",
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

  const steps = useMemo(() => {
    if (!user) return GUIDE_STEPS.CREATOR;
    return GUIDE_STEPS[user.role] ?? GUIDE_STEPS.CREATOR;
  }, [user]);

  const finish = async () => {
    await api.markGuideSeen();
    persistGuideSeen();
    navigate("/", { replace: true });
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-bg-base">
      <Header />

      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.3em] text-green-400/80">Guide</span>
          <h1 className="text-3xl font-black tracking-tight text-ink-primary sm:text-4xl">Быстрый онбординг по CRM</h1>
          <p className="max-w-2xl text-sm leading-6 text-ink-secondary sm:text-base">
            Этот сценарий собран под вашу роль и показывает только главное: где находится нужный функционал, как не путать ТЗ и файлы и как вести заказ без лишнего шума.
          </p>
        </div>

        <GuideTour
          steps={steps}
          roleLabel={ROLE_LABELS[user.role] || user.role}
          onFinish={finish}
          onSkip={finish}
        />
      </main>
    </div>
  );
}
