import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../store/auth.store";
import { Check, X, Shield, RefreshCw, UserX, Crown, Users, ChevronRight, ChevronDown, Trash2, UserPlus, RotateCcw, Lock, Unlock, MoveHorizontal, List, GitBranch, Search } from "lucide-react";
import * as api from "../api/client";
import { TOUR_STEPS } from "../data/tourSteps";
import { useTourStore } from "../store/tour.store";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Админ", HEAD_MARKETER: "Гл. маркетолог",
  MARKETER: "Маркетолог", HEAD_CREATOR: "Гл. креатор",
  HEAD_LEAD_CREATOR: "Гл. тим лид",
  LEAD_CREATOR: "Тим лид", CREATOR: "Креатор",
};
const ROLE_COLORS: Record<string, string> = {
  ADMIN: "text-red-400 bg-red-400/10",           HEAD_MARKETER: "text-purple-400 bg-purple-400/10",
  MARKETER: "text-blue-400 bg-blue-400/10",      HEAD_CREATOR: "text-orange-400 bg-orange-400/10",
  HEAD_LEAD_CREATOR: "text-yellow-400 bg-yellow-400/10",
  LEAD_CREATOR: "text-amber-400 bg-amber-400/10", CREATOR: "text-green-400 bg-green-400/10",
};

interface UserRow {
  id: string; displayName: string; telegramUsername: string | null;
  role: string; status: string; isActive: boolean; createdAt: string;
  teamLeadId?: string | null;
  teamLead?: { id: string; displayName: string } | null;
  _count?: { assignments: number; subordinates?: number };
}

export default function AdminPage() {
  const user     = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [users,    setUsers]    = useState<UserRow[]>([]);
  const [pending,  setPending]  = useState<UserRow[]>([]);
  const [blocked,  setBlocked]  = useState<UserRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState<"users" | "pending" | "team" | "access" | "rights" | "finance">(
    searchParams.get("tab") === "pending" ? "pending" : "users"
  );
  const [working,  setWorking]  = useState<string | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [dragEnabled, setDragEnabled] = useState(false);
  const [dragSettingLoading, setDragSettingLoading] = useState(false);
  const [dragSettingSaving, setDragSettingSaving] = useState(false);
  const tourActive = useTourStore((s) => s.active);
  const tourRole = useTourStore((s) => s.role);
  const tourStepIndex = useTourStore((s) => s.stepIndex);

  const isAdmin    = user?.role === "ADMIN";
  const isHeadMark = user?.role === "HEAD_MARKETER" || isAdmin;
  const isHeadCreator = user?.role === "HEAD_CREATOR" || isAdmin;
  const isLead     = user?.role === "LEAD_CREATOR"  || isAdmin;
  const canAccess  = isAdmin || isHeadMark || isHeadCreator || isLead;
  const tourStep = useMemo(
    () => (tourActive && tourRole ? TOUR_STEPS[tourRole]?.[tourStepIndex] ?? null : null),
    [tourActive, tourRole, tourStepIndex]
  );

  const load = async () => {
    setLoading(true);
    try {
      const u = await api.getUsers({ includeAll: true });
      const all = Array.isArray(u) ? u : (u.users ?? []);
      setUsers(all.filter((x: UserRow) => x.status === "APPROVED" && x.isActive !== false));
      setPending(all.filter((x: UserRow) => x.status === "PENDING"));
      setBlocked(all.filter((x: UserRow) => x.status === "BLOCKED" || x.isActive === false));
    } catch {}
    setLoading(false);
  };

  const loadDragSetting = async () => {
    if (!isAdmin) return;
    setDragSettingLoading(true);
    try {
      const settings = await Promise.race<Record<string, string>>([
        api.getSettings(),
        new Promise<Record<string, string>>((_, reject) => {
          window.setTimeout(() => reject(new Error("settings timeout")), 4000);
        }),
      ]);
      setDragEnabled(settings.kanban_drag_enabled === "true");
    } catch {
      setDragEnabled(false);
    } finally {
      setDragSettingLoading(false);
    }
  };

  useEffect(() => {
    if (!canAccess) { navigate("/"); return; }
    load();
  }, [canAccess]);

  useEffect(() => {
    void loadDragSetting();
  }, [isAdmin]);

  useEffect(() => {
    if (!tourActive || tourStep?.route !== "/admin") return;

    switch (tourStep.target) {
      case "admin-pending-tab":
        setTab("pending");
        break;
      case "admin-team-tab":
        setTab("team");
        break;
      case "admin-access-tab":
        setTab("access");
        break;
      case "admin-rights-tab":
        if (isAdmin) setTab("rights");
        break;
      default:
        setTab("users");
        break;
    }
  }, [isAdmin, tourActive, tourStep?.route, tourStep?.target]);

  const approve = async (id: string, role?: string) => {
    setWorking(id);
    try {
      await api.approveUser(id, role);
      await load();
    } catch (e: any) { alert(e.response?.data?.error || "Ошибка"); }
    setWorking(null);
  };

  const reject = async (id: string) => {
    if (!confirm("Отклонить заявку?")) return;
    setWorking(id);
    try {
      await api.rejectUser(id);
      await load();
    } catch (e: any) { alert(e.response?.data?.error || "Ошибка"); }
    setWorking(null);
  };

  const changeRole = async (id: string, role: string) => {
    setWorking(id);
    try {
      await api.changeRole(id, role);
      await load();
    } catch (e: any) { alert(e.response?.data?.error || "Ошибка"); }
    setWorking(null);
  };

  const deactivate = async (id: string) => {
    if (!confirm("Деактивировать пользователя?")) return;
    setWorking(id);
    try {
      await api.deactivateUser(id);
      await load();
    } catch (e: any) { alert(e.response?.data?.error || "Ошибка"); }
    setWorking(null);
  };

  const restore = async (id: string) => {
    setWorking(id);
    try {
      await api.restoreUser(id);
      await load();
    } catch (e: any) { alert(e.response?.data?.error || "Ошибка"); }
    setWorking(null);
  };

  const cleanup = async () => {
    if (!confirm("Удалить файлы из заказов в архиве 90+ дней?")) return;
    setCleaning(true);
    try {
      const r = await (api as any).runCleanup();
      alert(`Очистка завершена: удалено ${r.deleted} файлов, освобождено ${r.freedMb} МБ`);
    } catch (e: any) { alert(e.response?.data?.error || "Ошибка"); }
    setCleaning(false);
  };

  const assignTeamLead = async (userId: string, teamLeadId: string | null) => {
    setWorking(userId);
    try {
      await (api as any).setTeamLead(userId, teamLeadId);
      await load();
    } catch (e: any) { alert(e.response?.data?.error || "Ошибка"); }
    setWorking(null);
  };

  const saveDragSetting = async (nextValue: boolean) => {
    setDragSettingSaving(true);
    try {
      await api.updateSetting("kanban_drag_enabled", nextValue ? "true" : "false");
      setDragEnabled(nextValue);
    } catch (e: any) { alert(e.response?.data?.error || "Ошибка"); }
    setDragSettingSaving(false);
  };

  if (!canAccess) return null;

  type TabId = "users" | "pending" | "team" | "access" | "rights" | "finance";
  const TABS: { id: TabId; label: string }[] = (
    [
      { id: "users"   as TabId, label: "Пользователи" },
      { id: "pending" as TabId, label: pending.length > 0 ? `Заявки (${pending.length})` : "Заявки" },
      { id: "team"    as TabId, label: "Иерархия" },
      { id: "access"  as TabId, label: "Доступ" },
      ...(isAdmin ? [{ id: "rights" as TabId, label: "Права" }] : []),
      ...(isAdmin ? [{ id: "finance" as TabId, label: "Финансы" }] : []),
    ]
  );

  return (
    <div className="min-h-full bg-bg-base">

      <div className={`${tab === "team" ? "max-w-[1500px]" : "max-w-5xl"} mx-auto px-6 py-8`} data-tour="admin-page">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-ink-primary flex items-center gap-2">
              <Shield size={20} className="text-green-400" />
              Управление командой
            </h1>
            <p className="text-sm text-ink-tertiary mt-1">Заявки, роли и доступ</p>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button onClick={cleanup} disabled={cleaning}
                title="Очистить файлы архивных заказов (90+ дней)"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-500/20 text-red-400/70 hover:text-red-400 hover:bg-red-500/10 text-xs transition-colors disabled:opacity-40">
                <Trash2 size={13} />
                {cleaning ? "Чистим..." : "Очистка файлов"}
              </button>
            )}
            <button onClick={load} className="p-2 rounded-lg border border-bg-border hover:bg-bg-raised text-ink-tertiary hover:text-ink-primary transition-colors">
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {isAdmin && (
          <div className="mb-6 bg-bg-surface border border-bg-border rounded-xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-ink-primary flex items-center gap-2">
                  <MoveHorizontal size={15} className="text-amber-400" />
                  Ручное перетаскивание заказов на доске
                </h2>
                <p className="text-xs text-ink-tertiary mt-1 max-w-2xl">
                  Если выключено, карточки сами переходят по столбцам от этапов и статуса. Если включено, пользователи снова смогут двигать их вручную мышкой.
                </p>
              </div>
              <button
                onClick={() => saveDragSetting(!dragEnabled)}
                disabled={dragSettingLoading || dragSettingSaving}
                className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full border transition-colors ${
                  dragEnabled ? "bg-green-500 border-green-500" : "bg-bg-raised border-bg-border"
                } disabled:opacity-50`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                    dragEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            <div className="mt-3 text-xs">
              {dragSettingLoading ? (
                <span className="text-ink-tertiary">Загружаю настройку...</span>
              ) : dragSettingSaving ? (
                <span className="text-ink-tertiary">Сохраняю...</span>
              ) : dragEnabled ? (
                <span className="text-green-400">Сейчас ручное перетаскивание включено.</span>
              ) : (
                <span className="text-amber-400">Сейчас колонка заказа определяется автоматически по этапу.</span>
              )}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-bg-border mb-6">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              data-tour={
                id === "users" ? "admin-users-tab"
                : id === "pending" ? "admin-pending-tab"
                : id === "team" ? "admin-team-tab"
                : id === "access" ? "admin-access-tab"
                : id === "rights" ? "admin-rights-tab"
                : undefined
              }
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === id ? "border-green-500 text-green-400" : "border-transparent text-ink-tertiary hover:text-ink-primary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-bg-surface border border-bg-border rounded-xl p-4 animate-fade-in" style={{ animationDelay: `${i * 70}ms` }}>
                <div className="flex items-center gap-3">
                  <div className="skeleton w-9 h-9 rounded-full flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="skeleton h-3.5 w-36 mb-1.5" />
                    <div className="skeleton h-3 w-24" />
                  </div>
                  <div className="skeleton h-7 w-20 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        ) : tab === "pending" ? (
          <PendingList rows={pending} onApprove={approve} onReject={reject} working={working} isAdmin={isAdmin} isHeadMark={isHeadMark} />
        ) : tab === "team" ? (
          <TeamHierarchy
            users={users}
            isAdmin={isAdmin}
            isHeadCreator={isHeadCreator}
            isHeadMark={isHeadMark}
            isLeadCreator={user?.role === "LEAD_CREATOR"}
            currentUserId={user?.id ?? ""}
            working={working}
            onAssignTeamLead={assignTeamLead}
          />
        ) : tab === "access" ? (
          <PreApproveTab isAdmin={isAdmin} isHeadMark={isHeadMark} isHeadCreator={isHeadCreator} />
        ) : tab === "rights" ? (
          <PermissionsTab users={[...users, ...blocked]} />
        ) : tab === "finance" ? (
          <FinanceSettingsTab />
        ) : (
          <UsersList rows={users} blocked={blocked} onChangeRole={changeRole} onDeactivate={deactivate} onRestore={restore} working={working} currentUser={user} isAdmin={isAdmin} />
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Team Hierarchy Tab
// ──────────────────────────────────────────────────────────────────────────────

function AssignSelect({ value, options, disabled, placeholder, onChange }: {
  value: string; options: UserRow[]; disabled: boolean;
  placeholder: string; onChange: (v: string | null) => void;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-[220px] max-w-full flex-none text-xs px-2 py-1.5 rounded-lg bg-bg-raised border border-bg-border text-ink-tertiary outline-none hover:border-green-500/40 transition-colors cursor-pointer truncate"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.id} value={o.id}>{o.displayName}</option>)}
    </select>
  );
}

function UserRow2({ user, indent = 0, badge, assign }: {
  user: UserRow; indent?: number; badge?: string;
  assign?: React.ReactNode;
}) {
  const initials = user.displayName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  return (
    <div className="flex items-start gap-3 py-1.5" style={{ paddingLeft: indent * 20 }}>
      <div className="flex min-w-0 flex-1 items-start gap-2">
        {indent > 0 && <ChevronRight size={12} className="mt-2 text-ink-tertiary flex-shrink-0 -ml-2" />}
        <div className="w-7 h-7 rounded-full bg-bg-raised border border-bg-border flex items-center justify-center flex-shrink-0">
          <span className="text-[10px] font-bold text-ink-tertiary">{initials}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm text-ink-primary">{user.displayName}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${ROLE_COLORS[user.role] || ""}`}>
              {badge || ROLE_LABELS[user.role] || user.role}
            </span>
          </div>
          {user.telegramUsername && (
            <a href={`https://t.me/${user.telegramUsername}`} target="_blank" rel="noreferrer"
              className="mt-1 inline-block text-xs text-ink-tertiary hover:text-green-400 transition-colors">
              @{user.telegramUsername}
            </a>
          )}
        </div>
      </div>
      {assign && <div className="ml-auto flex-none">{assign}</div>}
    </div>
  );
}

function PersonFlowCard({
  user,
  badge,
  tone,
  meta,
  assign,
}: {
  user: UserRow;
  badge: string;
  tone: "orange" | "amber" | "green" | "purple" | "blue";
  meta?: string;
  assign?: React.ReactNode;
}) {
  const initials = user.displayName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  const toneStyles: Record<string, string> = {
    orange: "border-orange-400/30 bg-orange-400/10 text-orange-300",
    amber: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    green: "border-green-400/30 bg-green-400/10 text-green-300",
    purple: "border-purple-400/30 bg-purple-400/10 text-purple-300",
    blue: "border-blue-400/30 bg-blue-400/10 text-blue-300",
  };

  return (
    <div className="relative rounded-lg border border-bg-border bg-bg-surface p-2 shadow-sm w-full transition-colors hover:border-bg-border/80">
      <div className="flex items-center gap-2">
        <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border text-[10px] font-bold ${toneStyles[tone]}`}>
          {initials}
        </div>
        <div className="min-w-0 flex-1 flex flex-col justify-center">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-[13px] font-medium text-ink-primary truncate">{user.displayName}</p>
            <span className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${ROLE_COLORS[user.role] || ""}`}>
              {badge}
            </span>
          </div>
        </div>
      </div>
      {assign && <div className="mt-2 pt-2 border-t border-bg-border/50">{assign}</div>}
    </div>
  );
}

function TeamHierarchy({ users, isAdmin, isHeadCreator, isHeadMark, isLeadCreator, currentUserId, working, onAssignTeamLead }: {
  users: UserRow[];
  isAdmin: boolean;
  isHeadCreator: boolean;
  isHeadMark: boolean;
  isLeadCreator: boolean;
  currentUserId: string;
  working: string | null;
  onAssignTeamLead: (userId: string, teamLeadId: string | null) => void;
}) {
  const [viewMode, setViewMode] = useState<"tree" | "list">("tree");
  const [search, setSearch] = useState("");
  // collapsed HEAD node ids
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const byRole = (role: string) => users.filter((u) => u.role === role);
  const childrenOf = (parentId: string) => users.filter((u) => u.teamLeadId === parentId);

  const headCreators  = byRole("HEAD_CREATOR");
  const headMarketers = byRole("HEAD_MARKETER");
  const leadCreators  = byRole("LEAD_CREATOR");
  const marketers     = byRole("MARKETER");
  const creators      = byRole("CREATOR");
  const creatorParentOptions = [...headCreators, ...leadCreators];
  const creatorParentIds = new Set(creatorParentOptions.map((user) => user.id));

  const canMgCreators  = isAdmin || isHeadCreator;
  const canMgMarketers = isAdmin || isHeadMark;
  const leadsOfHead = (headCreatorId: string) => childrenOf(headCreatorId).filter((u) => u.role === "LEAD_CREATOR");
  const directCreatorsOfHead = (headCreatorId: string) => childrenOf(headCreatorId).filter((u) => u.role === "CREATOR");
  const creatorsOfLead = (leadCreatorId: string) => childrenOf(leadCreatorId).filter((u) => u.role === "CREATOR");

  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Orphans
  const orphanCreators = creators.filter((c) => !c.teamLeadId || !creatorParentIds.has(c.teamLeadId));
  const orphanLeads    = leadCreators.filter((l) => !l.teamLeadId || !headCreators.some((h) => h.id === l.teamLeadId));
  const orphanMkts     = marketers.filter((m) => !m.teamLeadId || !headMarketers.some((h) => h.id === m.teamLeadId));

  // ── TREE VIEW ────────────────────────────────────────────────────────────────

  const DiagramView = () => (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="rounded-card border border-bg-border bg-bg-surface p-5">
        <div className="mb-4 flex items-center gap-2">
          <GitBranch size={14} className="text-orange-400" />
          <div>
            <h3 className="text-sm font-semibold text-ink-primary">Блок-схема команды креаторов</h3>
            <p className="text-xs text-ink-tertiary">Главный креатор находится наверху. Ниже идут тимлиды и креаторы, которых можно вешать либо на тимлида, либо сразу на главного.</p>
          </div>
        </div>

        {headCreators.length === 0 && leadCreators.length === 0 && creators.length === 0 ? (
          <p className="py-6 text-xs text-ink-tertiary">Нет пользователей</p>
        ) : (
          <div className="space-y-5">
            {headCreators.map((hc) => {
              const myLeads = leadsOfHead(hc.id);
              const myDirectCreators = directCreatorsOfHead(hc.id);
              return (
                <div key={hc.id} className="rounded-2xl border border-bg-border/80 bg-bg-raised/20 p-4">
                  <div className="mx-auto max-w-md">
                    <PersonFlowCard
                      user={hc}
                      badge="Главный креатор"
                      tone="orange"
                      meta={`${myLeads.length} тимлидов · ${myDirectCreators.length} прямых креаторов`}
                    />
                  </div>

                  {(myLeads.length > 0 || myDirectCreators.length > 0) && (
                    <>
                      <div className="mx-auto my-3 h-6 w-px bg-bg-border" />
                      <div className="grid gap-4 lg:grid-cols-2">
                        <div className="space-y-3">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-tertiary">Через тимлидов</p>
                          {myLeads.length === 0 ? (
                            <p className="rounded-xl border border-dashed border-bg-border px-3 py-4 text-xs text-ink-tertiary">Пока без тимлидов</p>
                          ) : myLeads.map((lc) => {
                            const myCreators = creatorsOfLead(lc.id);
                            const canEditCreatorsHere = canMgCreators || (isLeadCreator && lc.id === currentUserId);
                            return (
                              <div key={lc.id} className="space-y-3">
                                <PersonFlowCard
                                  user={lc}
                                  badge="Тимлид"
                                  tone="amber"
                                  meta={`${myCreators.length} креаторов`}
                                  assign={canMgCreators ? (
                                    <AssignSelect
                                      value={lc.teamLeadId || ""}
                                      options={headCreators}
                                      disabled={working === lc.id}
                                      placeholder="Без главного креатора"
                                      onChange={(v) => onAssignTeamLead(lc.id, v)}
                                    />
                                  ) : undefined}
                                />
                                {myCreators.length > 0 && (
                                  <div className="space-y-2 pl-4">
                                    {myCreators.map((cr) => (
                                      <PersonFlowCard
                                        key={cr.id}
                                        user={cr}
                                        badge="Креатор"
                                        tone="green"
                                        assign={canEditCreatorsHere ? (
                                          <AssignSelect
                                            value={cr.teamLeadId || ""}
                                            options={creatorParentOptions}
                                            disabled={working === cr.id}
                                            placeholder="Назначить руководителя..."
                                            onChange={(v) => onAssignTeamLead(cr.id, v)}
                                          />
                                        ) : undefined}
                                      />
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <div className="space-y-3">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-tertiary">Прямое подчинение</p>
                          {myDirectCreators.length === 0 ? (
                            <p className="rounded-xl border border-dashed border-bg-border px-3 py-4 text-xs text-ink-tertiary">Нет креаторов без тимлида в этой ветке</p>
                          ) : myDirectCreators.map((cr) => (
                            <PersonFlowCard
                              key={cr.id}
                              user={cr}
                              badge="Креатор"
                              tone="green"
                              assign={canMgCreators ? (
                                <AssignSelect
                                  value={cr.teamLeadId || ""}
                                  options={creatorParentOptions}
                                  disabled={working === cr.id}
                                  placeholder="Назначить руководителя..."
                                  onChange={(v) => onAssignTeamLead(cr.id, v)}
                                />
                              ) : undefined}
                            />
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {orphanLeads.length > 0 && (
              <div className="rounded-2xl border border-dashed border-amber-400/20 bg-amber-400/5 p-4">
                <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-amber-300">Тимлиды без главного креатора</p>
                <div className="space-y-3">
                  {orphanLeads.map((lc) => (
                    <PersonFlowCard
                      key={lc.id}
                      user={lc}
                      badge="Тимлид"
                      tone="amber"
                      assign={canMgCreators && headCreators.length > 0 ? (
                        <AssignSelect
                          value={lc.teamLeadId || ""}
                          options={headCreators}
                          disabled={working === lc.id}
                          placeholder="Назначить главного креатора..."
                          onChange={(v) => onAssignTeamLead(lc.id, v)}
                        />
                      ) : undefined}
                    />
                  ))}
                </div>
              </div>
            )}

            {orphanCreators.length > 0 && (
              <div className="rounded-2xl border border-dashed border-green-400/20 bg-green-400/5 p-4">
                <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-green-300">Креаторы без связки</p>
                <div className="space-y-3">
                  {orphanCreators.map((cr) => (
                    <PersonFlowCard
                      key={cr.id}
                      user={cr}
                      badge="Креатор"
                      tone="green"
                      assign={canMgCreators && creatorParentOptions.length > 0 ? (
                        <AssignSelect
                          value={cr.teamLeadId || ""}
                          options={creatorParentOptions}
                          disabled={working === cr.id}
                          placeholder="Назначить тимлида или главного..."
                          onChange={(v) => onAssignTeamLead(cr.id, v)}
                        />
                      ) : undefined}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-card border border-bg-border bg-bg-surface p-5">
        <div className="mb-4 flex items-center gap-2">
          <GitBranch size={14} className="text-blue-400" />
          <div>
            <h3 className="text-sm font-semibold text-ink-primary">Блок-схема маркетологов</h3>
            <p className="text-xs text-ink-tertiary">У маркетологов схема проще: главный маркетолог наверху, его маркетологи — ниже.</p>
          </div>
        </div>

        {headMarketers.length === 0 && marketers.length === 0 ? (
          <p className="py-6 text-xs text-ink-tertiary">Нет пользователей</p>
        ) : (
          <div className="space-y-5">
            {headMarketers.map((hm) => {
              const myMkts = childrenOf(hm.id).filter((u) => u.role === "MARKETER");
              return (
                <div key={hm.id} className="rounded-2xl border border-bg-border/80 bg-bg-raised/20 p-4">
                  <div className="mx-auto max-w-md">
                    <PersonFlowCard
                      user={hm}
                      badge="Главный маркетолог"
                      tone="purple"
                      meta={`${myMkts.length} маркетологов`}
                    />
                  </div>

                  {myMkts.length > 0 && (
                    <>
                      <div className="mx-auto my-3 h-6 w-px bg-bg-border" />
                      <div className="grid gap-3 md:grid-cols-2">
                        {myMkts.map((m) => (
                          <PersonFlowCard
                            key={m.id}
                            user={m}
                            badge="Маркетолог"
                            tone="blue"
                            assign={canMgMarketers ? (
                              <AssignSelect
                                value={m.teamLeadId || ""}
                                options={headMarketers}
                                disabled={working === m.id}
                                placeholder="Без главного маркетолога"
                                onChange={(v) => onAssignTeamLead(m.id, v)}
                              />
                            ) : undefined}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {orphanMkts.length > 0 && (
              <div className="rounded-2xl border border-dashed border-blue-400/20 bg-blue-400/5 p-4">
                <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-blue-300">Маркетологи без группы</p>
                <div className="space-y-3">
                  {orphanMkts.map((m) => (
                    <PersonFlowCard
                      key={m.id}
                      user={m}
                      badge="Маркетолог"
                      tone="blue"
                      assign={canMgMarketers && headMarketers.length > 0 ? (
                        <AssignSelect
                          value={m.teamLeadId || ""}
                          options={headMarketers}
                          disabled={working === m.id}
                          placeholder="Назначить главного маркетолога..."
                          onChange={(v) => onAssignTeamLead(m.id, v)}
                        />
                      ) : undefined}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const TreeView = () => (
    <div className="space-y-5">
      {/* CREATOR TREE */}
      <div className="bg-bg-surface border border-bg-border rounded-card p-5">
        <h3 className="text-sm font-semibold text-ink-primary flex items-center gap-2 mb-3">
          <Users size={14} className="text-orange-400" /> Команда креаторов
        </h3>

        {headCreators.length === 0 && leadCreators.length === 0 && creators.length === 0 && (
          <p className="text-xs text-ink-tertiary py-3">Нет пользователей</p>
        )}

        {headCreators.map((hc) => {
          const myLeads = childrenOf(hc.id).filter((u) => u.role === "LEAD_CREATOR");
          const myDirectCreators = directCreatorsOfHead(hc.id);
          const isOpen = !collapsed.has(hc.id);
          return (
            <div key={hc.id} className="mb-3 last:mb-0">
              {/* HEAD row — clickable to collapse */}
              <div
                className="flex items-center gap-2 py-1.5 cursor-pointer group select-none"
                onClick={() => toggleCollapse(hc.id)}
              >
                <span className="text-ink-tertiary group-hover:text-ink-secondary transition-colors">
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
                <div className="w-7 h-7 rounded-full bg-orange-400/15 border border-orange-400/30 flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-bold text-orange-300">
                    {hc.displayName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)}
                  </span>
                </div>
                <span className="text-sm font-semibold text-ink-primary">{hc.displayName}</span>
                {hc.telegramUsername && (
                  <a href={`https://t.me/${hc.telegramUsername}`} target="_blank" rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-ink-tertiary hover:text-green-400 transition-colors">
                    @{hc.telegramUsername}
                  </a>
                )}
                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 text-orange-400 bg-orange-400/10">
                  Гл. креатор
                </span>
                <span className="ml-auto text-[11px] text-ink-tertiary">
                  {myLeads.length} лид{myLeads.length !== 1 ? "а" : ""} · {myLeads.reduce((s, l) => s + childrenOf(l.id).filter((u) => u.role === "CREATOR").length, 0)} кр.
                </span>
              </div>

              {isOpen && (
                <div className="ml-5 border-l border-bg-border/60 pl-3 mt-1">
                  {myLeads.map((lc) => {
                    const myCreators = creatorsOfLead(lc.id);
                    const isMyTeam = lc.id === currentUserId;
                    const canEditThisLead = canMgCreators;
                    // LEAD_CREATOR can manage creators in their own team
                    const canEditCreatorsHere = canMgCreators || (isLeadCreator && lc.id === currentUserId);
                    const isLeadOpen = !collapsed.has(lc.id);
                    return (
                      <div key={lc.id} className="mb-2 last:mb-0">
                        <div
                          className="flex items-center gap-2 py-1.5 cursor-pointer group select-none"
                          onClick={() => myCreators.length > 0 && toggleCollapse(lc.id)}
                        >
                          {myCreators.length > 0 ? (
                            <span className="text-ink-tertiary group-hover:text-ink-secondary transition-colors">
                              {isLeadOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            </span>
                          ) : (
                            <span className="w-3" />
                          )}
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 border ${isMyTeam ? "bg-amber-400/15 border-amber-400/30" : "bg-bg-raised border-bg-border"}`}>
                            <span className="text-[9px] font-bold text-ink-tertiary">
                              {lc.displayName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)}
                            </span>
                          </div>
                          <span className="text-sm text-ink-primary">{lc.displayName}</span>
                          {lc.telegramUsername && (
                            <a href={`https://t.me/${lc.telegramUsername}`} target="_blank" rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs text-ink-tertiary hover:text-green-400 transition-colors">
                              @{lc.telegramUsername}
                            </a>
                          )}
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 text-amber-400 bg-amber-400/10">
                            Лид {myCreators.length > 0 ? `· ${myCreators.length}` : ""}
                          </span>
                          {canEditThisLead && (
                            <AssignSelect
                              value={lc.teamLeadId || ""}
                              options={headCreators}
                              disabled={working === lc.id}
                              placeholder="Без гл. креатора"
                              onChange={(v) => onAssignTeamLead(lc.id, v)}
                            />
                          )}
                        </div>

                        {isLeadOpen && myCreators.length > 0 && (
                          <div className="ml-4 border-l border-bg-border/40 pl-3">
                            {myCreators.map((cr) => (
                              <UserRow2
                                key={cr.id}
                                user={cr}
                                assign={canEditCreatorsHere ? (
                                  <AssignSelect
                                    value={cr.teamLeadId || ""}
                                    options={creatorParentOptions}
                                    disabled={working === cr.id}
                                    placeholder="Без тимлида"
                                    onChange={(v) => onAssignTeamLead(cr.id, v)}
                                  />
                                ) : undefined}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {myDirectCreators.length > 0 && (
                    <div className="mt-3 border-t border-bg-border/50 pt-3">
                      <p className="mb-2 text-[10px] uppercase tracking-wide text-ink-tertiary">Прямое подчинение</p>
                      <div className="space-y-1">
                        {myDirectCreators.map((cr) => (
                          <UserRow2
                            key={cr.id}
                            user={cr}
                            assign={canMgCreators ? (
                              <AssignSelect
                                value={cr.teamLeadId || ""}
                                options={creatorParentOptions}
                                disabled={working === cr.id}
                                placeholder="Без тимлида"
                                onChange={(v) => onAssignTeamLead(cr.id, v)}
                              />
                            ) : undefined}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Orphan leads */}
        {orphanLeads.length > 0 && (
          <div className="mt-3 pt-3 border-t border-bg-border/60">
            <p className="text-[10px] text-ink-tertiary uppercase tracking-wide mb-2">Тимлиды без главного</p>
            {orphanLeads.map((lc) => {
              const myCreators = creatorsOfLead(lc.id);
              const canEditCreatorsHere = canMgCreators || (isLeadCreator && lc.id === currentUserId);
              return (
                <div key={lc.id}>
                  <UserRow2
                    user={lc}
                    indent={1}
                    assign={canMgCreators && headCreators.length > 0 ? (
                      <AssignSelect
                        value={lc.teamLeadId || ""}
                        options={headCreators}
                        disabled={working === lc.id}
                        placeholder="Назначить гл. креатора..."
                        onChange={(v) => onAssignTeamLead(lc.id, v)}
                      />
                    ) : undefined}
                  />
                  {myCreators.map((cr) => (
                    <UserRow2
                      key={cr.id}
                      user={cr}
                      indent={2}
                      assign={canEditCreatorsHere ? (
                        <AssignSelect
                          value={cr.teamLeadId || ""}
                          options={creatorParentOptions}
                          disabled={working === cr.id}
                          placeholder="Без тимлида"
                          onChange={(v) => onAssignTeamLead(cr.id, v)}
                        />
                      ) : undefined}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* Orphan creators */}
        {orphanCreators.length > 0 && (
          <div className="mt-3 pt-3 border-t border-bg-border/60">
            <p className="text-[10px] text-ink-tertiary uppercase tracking-wide mb-2">Креаторы без тимлида</p>
            {orphanCreators.map((cr) => (
              <UserRow2
                key={cr.id}
                user={cr}
                indent={1}
                assign={canMgCreators && creatorParentOptions.length > 0 ? (
                  <AssignSelect
                    value={cr.teamLeadId || ""}
                    options={creatorParentOptions}
                    disabled={working === cr.id}
                    placeholder="Назначить тимлида..."
                    onChange={(v) => onAssignTeamLead(cr.id, v)}
                  />
                ) : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {/* MARKETER TREE */}
      <div className="bg-bg-surface border border-bg-border rounded-card p-5">
        <h3 className="text-sm font-semibold text-ink-primary flex items-center gap-2 mb-3">
          <Users size={14} className="text-blue-400" /> Команда маркетологов
        </h3>

        {headMarketers.length === 0 && marketers.length === 0 && (
          <p className="text-xs text-ink-tertiary py-3">Нет пользователей</p>
        )}

        {headMarketers.map((hm) => {
          const myMkts = childrenOf(hm.id).filter((u) => u.role === "MARKETER");
          const isOpen = !collapsed.has(hm.id);
          return (
            <div key={hm.id} className="mb-3 last:mb-0">
              <div
                className="flex items-center gap-2 py-1.5 cursor-pointer group select-none"
                onClick={() => toggleCollapse(hm.id)}
              >
                <span className="text-ink-tertiary group-hover:text-ink-secondary transition-colors">
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
                <div className="w-7 h-7 rounded-full bg-purple-400/15 border border-purple-400/30 flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-bold text-purple-300">
                    {hm.displayName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)}
                  </span>
                </div>
                <span className="text-sm font-semibold text-ink-primary">{hm.displayName}</span>
                {hm.telegramUsername && (
                  <a href={`https://t.me/${hm.telegramUsername}`} target="_blank" rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-ink-tertiary hover:text-green-400 transition-colors">
                    @{hm.telegramUsername}
                  </a>
                )}
                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 text-purple-400 bg-purple-400/10">
                  Гл. маркетолог
                </span>
                <span className="ml-auto text-[11px] text-ink-tertiary">{myMkts.length} мкт.</span>
              </div>

              {isOpen && myMkts.length > 0 && (
                <div className="ml-5 border-l border-bg-border/60 pl-3 mt-1">
                  {myMkts.map((m) => (
                    <UserRow2
                      key={m.id}
                      user={m}
                      assign={canMgMarketers ? (
                        <AssignSelect
                          value={m.teamLeadId || ""}
                          options={headMarketers}
                          disabled={working === m.id}
                          placeholder="Без гл. маркетолога"
                          onChange={(v) => onAssignTeamLead(m.id, v)}
                        />
                      ) : undefined}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {orphanMkts.length > 0 && (
          <div className="mt-3 pt-3 border-t border-bg-border/60">
            <p className="text-[10px] text-ink-tertiary uppercase tracking-wide mb-2">Маркетологи без группы</p>
            {orphanMkts.map((m) => (
              <UserRow2
                key={m.id}
                user={m}
                indent={1}
                assign={canMgMarketers && headMarketers.length > 0 ? (
                  <AssignSelect
                    value={m.teamLeadId || ""}
                    options={headMarketers}
                    disabled={working === m.id}
                    placeholder="Назначить в группу..."
                    onChange={(v) => onAssignTeamLead(m.id, v)}
                  />
                ) : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // ── LIST VIEW ────────────────────────────────────────────────────────────────

  const nonAdminUsers = users.filter((u) => u.role !== "ADMIN");
  const filteredUsers = search.trim()
    ? nonAdminUsers.filter((u) =>
        u.displayName.toLowerCase().includes(search.toLowerCase()) ||
        (u.telegramUsername && u.telegramUsername.toLowerCase().includes(search.toLowerCase()))
      )
    : nonAdminUsers;

  const ListView = () => (
    <div className="bg-bg-surface border border-bg-border rounded-card p-5 space-y-3">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по имени или @username..."
          className="w-full pl-8 pr-3 py-2 text-sm bg-bg-raised border border-bg-border rounded-xl text-ink-primary placeholder-ink-tertiary outline-none focus:border-green-500/50 transition-colors"
        />
      </div>

      {filteredUsers.length === 0 && (
        <p className="text-xs text-ink-tertiary py-3 text-center">Никого не найдено</p>
      )}

      <div className="space-y-1">
        {filteredUsers.map((u) => {
          const isCreatorRole = u.role === "CREATOR";
          const isLeadRole = u.role === "LEAD_CREATOR";
          const isMktRole = u.role === "MARKETER";

          const canEditCreatorsHere = canMgCreators || (isLeadCreator && u.teamLeadId === currentUserId);
          const canEditThisUser =
            (isCreatorRole && canEditCreatorsHere) ||
            (isLeadRole && canMgCreators) ||
            (isMktRole && canMgMarketers);

          const assignOptions =
            isCreatorRole ? creatorParentOptions :
            isLeadRole ? headCreators :
            isMktRole ? headMarketers : [];

          const assignPlaceholder =
            isCreatorRole ? "Без тимлида" :
            isLeadRole ? "Без гл. креатора" :
            "Без гл. маркетолога";

          return (
            <div key={u.id} className="flex items-center gap-2 py-1.5 px-1 rounded-xl hover:bg-bg-raised/60 transition-colors">
              <div className="w-7 h-7 rounded-full bg-bg-raised border border-bg-border flex items-center justify-center flex-shrink-0">
                <span className="text-[10px] font-bold text-ink-tertiary">
                  {u.displayName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-sm text-ink-primary">{u.displayName}</span>
                {u.telegramUsername && (
                  <span className="ml-2 text-xs text-ink-tertiary">@{u.telegramUsername}</span>
                )}
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${ROLE_COLORS[u.role] || ""}`}>
                {ROLE_LABELS[u.role] || u.role}
              </span>
              {canEditThisUser && assignOptions.length > 0 && (
                <AssignSelect
                  value={u.teamLeadId || ""}
                  options={assignOptions}
                  disabled={working === u.id}
                  placeholder={assignPlaceholder}
                  onChange={(v) => onAssignTeamLead(u.id, v)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── RENDER ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <DiagramView />

      {/* View toggle */}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setViewMode("tree")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
            viewMode === "tree"
              ? "bg-green-500/15 text-green-300 border border-green-500/30"
              : "text-ink-tertiary hover:text-ink-primary border border-transparent hover:border-bg-border"
          }`}
        >
          <GitBranch size={13} /> Дерево
        </button>
        <button
          type="button"
          onClick={() => setViewMode("list")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
            viewMode === "list"
              ? "bg-green-500/15 text-green-300 border border-green-500/30"
              : "text-ink-tertiary hover:text-ink-primary border border-transparent hover:border-bg-border"
          }`}
        >
          <List size={13} /> Список
        </button>
      </div>

      {viewMode === "tree" ? <TreeView /> : <ListView />}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────

function PendingList({ rows, onApprove, onReject, working, isAdmin, isHeadMark }: any) {
  if (rows.length === 0) return (
    <div className="text-center py-16 text-ink-tertiary">
      <Check size={32} className="mx-auto mb-3 opacity-30" />
      <p>Нет ожидающих заявок</p>
    </div>
  );

  return (
    <div className="space-y-2 stagger-children">
      {rows.map((u: UserRow) => (
        <div key={u.id} className="bg-bg-surface border border-bg-border rounded-card p-4 flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-ink-primary">{u.displayName}</span>
              {u.telegramUsername && <span className="text-sm text-ink-tertiary">@{u.telegramUsername}</span>}
            </div>
            <div className="text-xs text-ink-tertiary mt-0.5">
              Заявка от {new Date(u.createdAt).toLocaleDateString("ru-RU")}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onApprove(u.id, "CREATOR")}
              disabled={working === u.id}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 text-sm font-medium transition-colors disabled:opacity-40"
            >
              <Check size={13} /> Одобрить (Креатор)
            </button>
            {(isAdmin || isHeadMark) && (
              <button
                onClick={() => onApprove(u.id, "MARKETER")}
                disabled={working === u.id}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 text-sm font-medium transition-colors disabled:opacity-40"
              >
                <Check size={13} /> Маркетолог
              </button>
            )}
            <button
              onClick={() => onReject(u.id)}
              disabled={working === u.id}
              className="p-1.5 rounded-lg hover:bg-red-500/10 text-ink-tertiary hover:text-red-400 transition-colors disabled:opacity-40"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function UserRow3({ u, working, currentUser, isAdmin, assignable, onChangeRole, onDeactivate, onRestore, isBlocked = false }: {
  u: UserRow; working: string | null; currentUser: any; isAdmin: boolean;
  assignable: string[]; onChangeRole?: (id: string, role: string) => void;
  onDeactivate?: (id: string) => void; onRestore?: (id: string) => void;
  isBlocked?: boolean;
}) {
  const [editRole, setEditRole] = useState(false);
  return (
    <div className={`bg-bg-surface border rounded-card p-4 flex items-center justify-between gap-4 ${isBlocked ? "border-red-500/20 opacity-70" : "border-bg-border"}`}>
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 border ${isBlocked ? "bg-red-500/10 border-red-500/20" : "bg-green-500/10 border-green-500/20"}`}>
          <span className={`text-xs font-bold ${isBlocked ? "text-red-400" : "text-green-400"}`}>
            {u.displayName.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0,2)}
          </span>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-ink-primary truncate">{u.displayName}</span>
            {u.telegramUsername && (
              <a href={`https://t.me/${u.telegramUsername}`} target="_blank" rel="noreferrer"
                className="text-xs text-ink-tertiary hover:text-green-400 transition-colors">
                @{u.telegramUsername}
              </a>
            )}
            {isBlocked && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 font-medium">Заблокирован</span>}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[u.role] || ""}`}>
              {ROLE_LABELS[u.role] || u.role}
            </span>
            {u.teamLead && <span className="text-xs text-ink-tertiary">тимлид: {u.teamLead.displayName}</span>}
            {u._count && <span className="text-xs text-ink-tertiary">{u._count.assignments} заказов</span>}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {isBlocked ? (
          onRestore && (
            <button onClick={() => onRestore(u.id)} disabled={working === u.id}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 text-xs font-medium transition-colors disabled:opacity-40">
              <RotateCcw size={12} /> Восстановить
            </button>
          )
        ) : editRole ? (
          <div className="flex items-center gap-2">
            <select defaultValue={u.role}
              onChange={(e) => { onChangeRole?.(u.id, e.target.value); setEditRole(false); }}
              className="text-sm bg-bg-raised border border-bg-border rounded-lg px-2 py-1.5 text-ink-primary outline-none"
              autoFocus>
              {assignable.map((r: string) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
            <button onClick={() => setEditRole(false)} className="text-ink-tertiary hover:text-ink-primary"><X size={14} /></button>
          </div>
        ) : (
          <>
            {u.id !== currentUser?.id && (
              <button onClick={() => setEditRole(true)} disabled={working === u.id}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-bg-border text-ink-tertiary hover:text-ink-primary hover:border-bg-hover text-xs transition-colors disabled:opacity-40">
                <Crown size={12} /> Роль
              </button>
            )}
            {isAdmin && u.id !== currentUser?.id && (
              <button onClick={() => onDeactivate?.(u.id)} disabled={working === u.id}
                className="p-1.5 rounded-lg hover:bg-red-500/10 text-ink-tertiary hover:text-red-400 transition-colors disabled:opacity-40">
                <UserX size={15} />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function UsersList({ rows, blocked, onChangeRole, onDeactivate, onRestore, working, currentUser, isAdmin }: any) {
  const assignable = isAdmin
    ? ["CREATOR","LEAD_CREATOR","HEAD_CREATOR","MARKETER","HEAD_MARKETER","ADMIN"]
    : currentUser?.role === "HEAD_MARKETER"
    ? ["MARKETER","CREATOR","LEAD_CREATOR"]
    : currentUser?.role === "HEAD_CREATOR"
    ? ["CREATOR","LEAD_CREATOR"]
    : ["CREATOR"];

  return (
    <div className="space-y-6 content-ready">
      <div className="space-y-2 stagger-children">
        {rows.map((u: UserRow) => (
          <UserRow3 key={u.id} u={u} working={working} currentUser={currentUser} isAdmin={isAdmin}
            assignable={assignable} onChangeRole={onChangeRole} onDeactivate={onDeactivate} />
        ))}
      </div>

      {blocked && blocked.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-red-400/70 uppercase tracking-wide mb-3 flex items-center gap-2">
            <UserX size={13} /> Заблокированные ({blocked.length})
          </h3>
          <div className="space-y-2 stagger-children">
            {blocked.map((u: UserRow) => (
              <UserRow3 key={u.id} u={u} working={working} currentUser={currentUser} isAdmin={isAdmin}
                assignable={assignable} onRestore={onRestore} isBlocked />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Pre-Approve Tab
// ──────────────────────────────────────────────────────────────────────────────

const ALL_ROLES_LIST = [
  { value: "CREATOR",      label: "Креатор" },
  { value: "LEAD_CREATOR", label: "Лид-креатор" },
  { value: "HEAD_CREATOR", label: "Гл. креатор" },
  { value: "MARKETER",     label: "Маркетолог" },
  { value: "HEAD_MARKETER",label: "Гл. маркетолог" },
  { value: "ADMIN",        label: "Админ" },
];

interface PreApproved {
  id: string; displayName: string; telegramUsername: string | null;
  role: string; pinCode: string | null; createdAt: string;
}

function PreApproveTab({ isAdmin, isHeadMark, isHeadCreator }: { isAdmin: boolean; isHeadMark: boolean; isHeadCreator: boolean }) {
  const [input,    setInput]    = useState("");
  const [role,     setRole]     = useState("CREATOR");
  const [saving,   setSaving]   = useState(false);
  const [list,     setList]     = useState<PreApproved[]>([]);
  const [loadingL, setLoadingL] = useState(true);
  const [results,  setResults]  = useState<{ username: string; pin?: string; error?: string }[]>([]);

  const availableRoles = ALL_ROLES_LIST.filter((r) => {
    if (isAdmin) return true;
    if (isHeadMark) return ["MARKETER", "CREATOR", "LEAD_CREATOR"].includes(r.value);
    if (isHeadCreator) return ["CREATOR", "LEAD_CREATOR"].includes(r.value);
    return false;
  });

  const loadList = async () => {
    setLoadingL(true);
    try { const d = await (api as any).getPreApproved(); setList(d); } catch {}
    setLoadingL(false);
  };

  useEffect(() => { loadList(); }, []);

  const submit = async () => {
    const usernames = input.split(/[\n,]+/).map((s) => s.trim().replace(/^@/, "")).filter(Boolean);
    if (!usernames.length) return;
    setSaving(true);
    const res: { username: string; pin?: string; error?: string }[] = [];
    for (const username of usernames) {
      try {
        const u = await (api as any).preApproveUser(username, role);
        res.push({ username, pin: u.pinCode });
      } catch (e: any) {
        res.push({ username, error: e.response?.data?.error || "Ошибка" });
      }
    }
    setResults(res);
    setInput("");
    setSaving(false);
    loadList();
  };

  return (
    <div className="space-y-6">
      <div className="bg-bg-surface border border-bg-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-ink-primary mb-1 flex items-center gap-2">
          <UserPlus size={15} className="text-green-400" />
          Заранее выдать доступ по TG нику
        </h2>
        <p className="text-xs text-ink-tertiary mb-4">
          Введи TG никнеймы (по одному в строке или через запятую). Когда эти люди напишут боту — сразу получат PIN без ручного апрува.
        </p>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={"@username1\n@username2\nusername3"}
          rows={4}
          className="w-full px-3.5 py-2.5 rounded-lg border border-bg-border bg-bg-raised text-sm text-ink-primary placeholder-ink-tertiary outline-none focus:border-green-500/50 transition-colors resize-none mb-3"
        />

        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="text-sm px-3 py-2 rounded-lg border border-bg-border bg-bg-raised text-ink-primary outline-none flex-shrink-0"
          >
            {availableRoles.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>

          <button
            onClick={submit}
            disabled={saving || !input.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500 text-black text-sm font-bold hover:bg-green-400 disabled:opacity-50 transition-colors"
          >
            {saving ? <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : <UserPlus size={14} />}
            {saving ? "Добавляю..." : "Выдать доступ"}
          </button>
        </div>

        {results.length > 0 && (
          <div className="mt-4 space-y-1">
            {results.map((r, i) => (
              <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${r.error ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-400"}`}>
                <span>@{r.username}</span>
                {r.pin ? <span className="font-mono font-bold">PIN: {r.pin}</span> : <span>{r.error}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-xs font-semibold text-ink-tertiary uppercase tracking-wide mb-3">Ожидают регистрации через бот</h3>
        {loadingL ? (
          <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : list.length === 0 ? (
          <p className="text-sm text-ink-tertiary text-center py-8">Список пуст</p>
        ) : (
          <div className="space-y-2">
            {list.map((u) => (
              <div key={u.id} className="flex items-center justify-between p-3 rounded-lg bg-bg-surface border border-bg-border">
                <div>
                  <span className="text-sm text-ink-primary">@{u.telegramUsername}</span>
                  <span className="ml-2 text-xs text-ink-tertiary">{ROLE_LABELS[u.role] || u.role}</span>
                </div>
                {u.pinCode && (
                  <span className="text-xs font-mono bg-bg-raised px-2 py-1 rounded text-green-400">PIN: {u.pinCode}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Permissions Tab
// ──────────────────────────────────────────────────────────────────────────────

const ALL_ROLES_ORDER = ["ADMIN", "HEAD_MARKETER", "MARKETER", "HEAD_CREATOR", "LEAD_CREATOR", "CREATOR"];
const ROLE_SHORT: Record<string, string> = {
  ADMIN: "Админ", HEAD_MARKETER: "Гл.мкт", MARKETER: "Мкт",
  HEAD_CREATOR: "Гл.кр", LEAD_CREATOR: "Лид", CREATOR: "Кр",
};

interface PermConfig { key: string; label: string; roles: string[]; defaultRoles: string[] }
interface Override { permission: string; granted: boolean }

function PermissionsTab({ users }: { users: UserRow[] }) {
  const [perms,     setPerms]     = useState<PermConfig[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState<string | null>(null);
  const [dirty,     setDirty]     = useState<Record<string, string[]>>({});

  const [selUserId, setSelUserId] = useState("");
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [overUser,  setOverUser]  = useState<{ id: string; displayName: string; role: string } | null>(null);
  const [savingOvr, setSavingOvr] = useState<string | null>(null);

  const loadPerms = async () => {
    setLoading(true);
    try { const d = await (api as any).getPermissions(); setPerms(d); } catch {}
    setLoading(false);
  };

  useEffect(() => { loadPerms(); }, []);

  const toggleRole = (key: string, role: string) => {
    const current = dirty[key] ?? perms.find((p) => p.key === key)?.roles ?? [];
    const next = current.includes(role) ? current.filter((r) => r !== role) : [...current, role];
    setDirty((d) => ({ ...d, [key]: next }));
  };

  const save = async (key: string) => {
    const roles = dirty[key] ?? perms.find((p) => p.key === key)?.roles ?? [];
    setSaving(key);
    try {
      const updated = await (api as any).updatePermission(key, roles);
      setPerms(updated);
      setDirty((d) => { const n = { ...d }; delete n[key]; return n; });
    } catch (e: any) { alert(e.response?.data?.error || "Ошибка"); }
    setSaving(null);
  };

  const reset = async (key: string) => {
    if (!confirm("Сбросить к значениям по умолчанию?")) return;
    setSaving(key);
    try {
      const updated = await (api as any).resetPermission(key);
      setPerms(updated);
      setDirty((d) => { const n = { ...d }; delete n[key]; return n; });
    } catch (e: any) { alert(e.response?.data?.error || "Ошибка"); }
    setSaving(null);
  };

  const loadUserOverrides = async (userId: string) => {
    if (!userId) { setOverrides([]); setOverUser(null); return; }
    try {
      const d = await (api as any).getUserPermissionOverrides(userId);
      setOverrides(d.overrides);
      setOverUser(d.user);
    } catch {}
  };

  const setOverride = async (key: string, granted: boolean | null) => {
    if (!selUserId) return;
    setSavingOvr(key);
    try {
      if (granted === null) {
        await (api as any).deleteUserPermissionOverride(selUserId, key);
        setOverrides((prev) => prev.filter((o) => o.permission !== key));
      } else {
        await (api as any).setUserPermissionOverride(selUserId, key, granted);
        setOverrides((prev) => {
          const ex = prev.find((o) => o.permission === key);
          if (ex) return prev.map((o) => o.permission === key ? { ...o, granted } : o);
          return [...prev, { permission: key, granted }];
        });
      }
    } catch (e: any) { alert(e.response?.data?.error || "Ошибка"); }
    setSavingOvr(null);
  };

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-8">
      {/* ── Матрица прав по ролям ── */}
      <div className="bg-bg-surface border border-bg-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-bg-border flex items-center gap-2">
          <Lock size={15} className="text-amber-400" />
          <h2 className="text-sm font-semibold text-ink-primary">Права по ролям</h2>
          <span className="text-xs text-ink-tertiary ml-1">ADMIN всегда имеет полный доступ</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bg-border">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-ink-tertiary uppercase tracking-wide min-w-[210px]">Действие</th>
                {ALL_ROLES_ORDER.map((r) => (
                  <th key={r} className="px-2 py-2.5 text-center">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap ${ROLE_COLORS[r] || ""}`}>{ROLE_SHORT[r]}</span>
                  </th>
                ))}
                <th className="px-3 py-2.5 text-xs text-ink-tertiary min-w-[100px]"></th>
              </tr>
            </thead>
            <tbody>
              {perms.map((p) => {
                const current = dirty[p.key] ?? p.roles;
                const isDirtyRow = !!dirty[p.key];
                const isDefault = JSON.stringify([...current].sort()) === JSON.stringify([...p.defaultRoles].sort());
                return (
                  <tr key={p.key} className={`border-b border-bg-border/50 hover:bg-bg-raised/50 transition-colors ${isDirtyRow ? "bg-amber-500/5" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="text-xs font-medium text-ink-primary">{p.label}</div>
                      {!isDefault && <div className="text-[10px] text-amber-400 mt-0.5">изменено</div>}
                    </td>
                    {ALL_ROLES_ORDER.map((role) => {
                      const isAdminRole = role === "ADMIN";
                      const checked = isAdminRole || current.includes(role);
                      return (
                        <td key={role} className="px-2 py-3 text-center">
                          <button
                            onClick={() => !isAdminRole && toggleRole(p.key, role)}
                            disabled={isAdminRole || saving === p.key}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center mx-auto transition-all ${
                              isAdminRole
                                ? "border-green-500/40 bg-green-500/10 cursor-not-allowed"
                                : checked
                                ? "border-green-500 bg-green-500 hover:bg-green-400"
                                : "border-bg-border bg-bg-raised hover:border-green-500/40"
                            }`}
                          >
                            {checked && <Check size={11} className={isAdminRole ? "text-green-400" : "text-black"} strokeWidth={3} />}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        {isDirtyRow && (
                          <button onClick={() => save(p.key)} disabled={saving === p.key}
                            className="px-2.5 py-1 rounded-lg bg-green-500 text-black text-xs font-bold hover:bg-green-400 disabled:opacity-50 transition-colors">
                            {saving === p.key ? "..." : "Сохранить"}
                          </button>
                        )}
                        {!isDefault && !isDirtyRow && (
                          <button onClick={() => reset(p.key)} disabled={saving === p.key}
                            className="px-2 py-1 rounded-lg border border-bg-border text-xs text-ink-tertiary hover:text-ink-primary hover:border-bg-hover transition-colors">
                            Сброс
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Индивидуальные переопределения ── */}
      <div className="bg-bg-surface border border-bg-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Unlock size={15} className="text-blue-400" />
          <h2 className="text-sm font-semibold text-ink-primary">Индивидуальные права</h2>
          <span className="text-xs text-ink-tertiary ml-1">Переопределяют роль для конкретного пользователя</span>
        </div>
        <select
          value={selUserId}
          onChange={(e) => { setSelUserId(e.target.value); loadUserOverrides(e.target.value); }}
          className="w-full text-sm px-3 py-2 rounded-lg border border-bg-border bg-bg-raised text-ink-primary outline-none mb-4"
        >
          <option value="">— Выберите пользователя —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.displayName} ({ROLE_LABELS[u.role] || u.role})</option>
          ))}
        </select>

        {selUserId && overUser && perms.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-ink-tertiary mb-3">
              <span className="text-ink-primary font-medium">{overUser.displayName}</span> — {ROLE_LABELS[overUser.role] || overUser.role}
            </p>
            {perms.map((p) => {
              const override = overrides.find((o) => o.permission === p.key);
              const state = override ? (override.granted ? "grant" : "deny") : "default";
              return (
                <div key={p.key} className="flex items-center justify-between p-3 rounded-lg bg-bg-raised border border-bg-border">
                  <span className="text-xs text-ink-primary">{p.label}</span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {(["default", "grant", "deny"] as const).map((s) => (
                      <button key={s}
                        onClick={() => setOverride(p.key, s === "default" ? null : s === "grant")}
                        disabled={savingOvr === p.key}
                        className={`px-2 py-1 rounded text-[10px] font-medium transition-colors disabled:opacity-50 ${
                          state === s
                            ? s === "grant" ? "bg-green-500 text-black"
                              : s === "deny" ? "bg-red-500 text-white"
                              : "bg-bg-border text-ink-primary"
                            : "text-ink-tertiary hover:text-ink-primary border border-transparent hover:border-bg-border"
                        }`}
                      >
                        {s === "default" ? "По роли" : s === "grant" ? "✓ Разрешить" : "✗ Запретить"}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {!selUserId && <p className="text-sm text-ink-tertiary text-center py-4">Выберите пользователя для настройки</p>}
      </div>
    </div>
  );
}

// AI Settings moved to /ai page — see AiPage.tsx

// ==================== ФИНАНСОВЫЕ НАСТРОЙКИ ====================

const ALL_ROLES: string[] = ["ADMIN", "HEAD_MARKETER", "MARKETER", "HEAD_CREATOR", "HEAD_LEAD_CREATOR", "LEAD_CREATOR", "CREATOR"];

function FinanceSettingsTab() {
  const [pct, setPct] = useState<Record<string, number>>({});
  const [actionPerms, setActionPerms] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const PCT_FIELDS: { key: string; label: string }[] = [
    { key: "CREATOR",           label: "Креатор" },
    { key: "LEAD_CREATOR",      label: "Тим лид" },
    { key: "HEAD_LEAD_CREATOR", label: "Гл. тим лид" },
    { key: "HEAD_CREATOR",      label: "Гл. креатор" },
    { key: "MARKETER",          label: "Маркетолог" },
    { key: "HEAD_MARKETER",     label: "Гл. маркетолог" },
    { key: "checkboxStoryboard", label: "Вычет: Раскадровка" },
    { key: "checkboxAnimation",  label: "Вычет: Анимация" },
    { key: "checkboxEditing",    label: "Вычет: Монтаж" },
    { key: "checkboxScenario",   label: "Вычет: Сценарий" },
  ];

  const ACTION_PERM_FIELDS: { key: string; label: string; desc: string }[] = [
    { key: "set_order_price",    label: "Устанавливать стоимость заказа", desc: "Кто может вводить цену заказа" },
    { key: "set_order_tax",      label: "Устанавливать НДС",              desc: "Кто может ставить галочку НДС" },
    { key: "set_creator_results", label: "Выставлять галочки итогов",     desc: "Кто может ставить галочки по завершению заказа" },
  ];

  useEffect(() => {
    Promise.all([
      api.getPercentageSettings(),
      api.getActionPermissions(),
    ]).then(([p, a]) => {
      setPct(p);
      setActionPerms(a);
    }).finally(() => setLoading(false));
  }, []);

  const savePct = async () => {
    setSaving(true);
    try {
      await api.updatePercentageSettings(pct);
      setMsg("Проценты сохранены");
    } catch { setMsg("Ошибка сохранения"); }
    setSaving(false);
    setTimeout(() => setMsg(""), 2500);
  };

  const savePerms = async () => {
    setSaving(true);
    try {
      await api.updateActionPermissions(actionPerms);
      setMsg("Права сохранены");
    } catch { setMsg("Ошибка сохранения"); }
    setSaving(false);
    setTimeout(() => setMsg(""), 2500);
  };

  const toggleRole = (key: string, role: string) => {
    setActionPerms((prev) => {
      const current = prev[key] ?? [];
      return {
        ...prev,
        [key]: current.includes(role) ? current.filter((r) => r !== role) : [...current, role],
      };
    });
  };

  if (loading) return <div className="py-16 text-center text-ink-tertiary">Загрузка...</div>;

  return (
    <div className="space-y-8">
      {/* Процентовка */}
      <div className="rounded-2xl border border-bg-border bg-bg-surface p-6">
        <h2 className="mb-1 text-sm font-bold text-ink-primary">Процентовка за заказ</h2>
        <p className="mb-5 text-xs text-ink-tertiary">Сколько % от стоимости заказа получает каждый участник. Вычеты за галочки — сколько снимается с креатора если галочка не стоит.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {PCT_FIELDS.map(({ key, label }) => (
            <label key={key} className="flex items-center justify-between gap-3 rounded-xl border border-bg-border bg-bg-raised/50 px-4 py-3">
              <span className="text-sm text-ink-secondary">{label}</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={pct[key] ?? 0}
                  onChange={(e) => setPct((prev) => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
                  className="w-20 rounded-lg border border-bg-border bg-bg-base px-2 py-1 text-right text-sm text-ink-primary focus:outline-none focus:ring-1 focus:ring-green-500/40"
                />
                <span className="text-xs text-ink-tertiary">%</span>
              </div>
            </label>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={savePct}
            disabled={saving}
            className="rounded-xl bg-green-500 px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-green-400 disabled:opacity-40"
          >
            {saving ? "Сохранение..." : "Сохранить"}
          </button>
          {msg && <span className="text-xs text-green-400">{msg}</span>}
        </div>
      </div>

      {/* Права на действия */}
      <div className="rounded-2xl border border-bg-border bg-bg-surface p-6">
        <h2 className="mb-1 text-sm font-bold text-ink-primary">Права на финансовые действия</h2>
        <p className="mb-5 text-xs text-ink-tertiary">Кто из ролей может выполнять следующие действия. Отметьте нужные роли.</p>
        <div className="space-y-5">
          {ACTION_PERM_FIELDS.map(({ key, label, desc }) => (
            <div key={key} className="rounded-xl border border-bg-border bg-bg-raised/30 p-4">
              <div className="mb-1 font-medium text-sm text-ink-primary">{label}</div>
              <div className="mb-3 text-xs text-ink-tertiary">{desc}</div>
              <div className="flex flex-wrap gap-2">
                {ALL_ROLES.map((role) => {
                  const active = (actionPerms[key] ?? []).includes(role);
                  return (
                    <button
                      key={role}
                      onClick={() => toggleRole(key, role)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        active
                          ? "bg-green-500/20 text-green-400 ring-1 ring-green-500/30"
                          : "bg-bg-raised text-ink-tertiary hover:text-ink-secondary"
                      }`}
                    >
                      {ROLE_LABELS[role] ?? role}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={savePerms}
            disabled={saving}
            className="rounded-xl bg-green-500 px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-green-400 disabled:opacity-40"
          >
            {saving ? "Сохранение..." : "Сохранить права"}
          </button>
        </div>
      </div>
    </div>
  );
}
