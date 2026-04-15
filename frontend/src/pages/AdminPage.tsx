import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../store/auth.store";
import Header from "../components/layout/Header";
import { Check, X, Shield, RefreshCw, UserX, Crown, Users, ChevronRight, Trash2, UserPlus } from "lucide-react";
import * as api from "../api/client";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Админ", HEAD_MARKETER: "Гл. маркетолог",
  MARKETER: "Маркетолог", HEAD_CREATOR: "Гл. креатор",
  LEAD_CREATOR: "Лид-креатор", CREATOR: "Креатор",
};
const ROLE_COLORS: Record<string, string> = {
  ADMIN: "text-red-400 bg-red-400/10",       HEAD_MARKETER: "text-purple-400 bg-purple-400/10",
  MARKETER: "text-blue-400 bg-blue-400/10",  HEAD_CREATOR: "text-orange-400 bg-orange-400/10",
  LEAD_CREATOR: "text-amber-400 bg-amber-400/10", CREATOR: "text-green-400 bg-green-400/10",
};

interface UserRow {
  id: string; displayName: string; telegramUsername: string | null;
  role: string; status: string; createdAt: string;
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
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState<"users" | "pending" | "team" | "access">(
    searchParams.get("tab") === "pending" ? "pending" : "users"
  );
  const [working,  setWorking]  = useState<string | null>(null);
  const [cleaning, setCleaning] = useState(false);

  const isAdmin    = user?.role === "ADMIN";
  const isHeadMark = user?.role === "HEAD_MARKETER" || isAdmin;
  const isHeadCreator = user?.role === "HEAD_CREATOR" || isAdmin;
  const isLead     = user?.role === "LEAD_CREATOR"  || isAdmin;
  const canAccess  = isAdmin || isHeadMark || isHeadCreator || isLead;

  const load = async () => {
    setLoading(true);
    try {
      const u = await api.getUsers({ includeAll: true });
      const all = Array.isArray(u) ? u : (u.users ?? []);
      setUsers(all.filter((x: UserRow) => x.status === "APPROVED"));
      setPending(all.filter((x: UserRow) => x.status === "PENDING"));
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    if (!canAccess) { navigate("/"); return; }
    load();
  }, [canAccess]);

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

  if (!canAccess) return null;

  const TABS: { id: "users" | "pending" | "team" | "access"; label: string }[] = [
    { id: "users",   label: "Пользователи" },
    { id: "pending", label: pending.length > 0 ? `Заявки (${pending.length})` : "Заявки" },
    { id: "team",    label: "Иерархия" },
    { id: "access",  label: "Доступ" },
  ];

  return (
    <div className="min-h-screen bg-bg-base">
      <Header />

      <div className="max-w-5xl mx-auto px-6 py-8">
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

        {/* Tabs */}
        <div className="flex gap-1 border-b border-bg-border mb-6">
          {TABS.map(({ id, label }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === id ? "border-green-500 text-green-400" : "border-transparent text-ink-tertiary hover:text-ink-primary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tab === "pending" ? (
          <PendingList rows={pending} onApprove={approve} onReject={reject} working={working} isAdmin={isAdmin} isHeadMark={isHeadMark} />
        ) : tab === "team" ? (
          <TeamHierarchy
            users={users}
            isAdmin={isAdmin}
            isHeadCreator={isHeadCreator}
            isHeadMark={isHeadMark}
            working={working}
            onAssignTeamLead={assignTeamLead}
          />
        ) : tab === "access" ? (
          <PreApproveTab isAdmin={isAdmin} isHeadMark={isHeadMark} isHeadCreator={isHeadCreator} />
        ) : (
          <UsersList rows={users} onChangeRole={changeRole} onDeactivate={deactivate} working={working} currentUser={user} isAdmin={isAdmin} />
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
      className="ml-auto text-xs px-2 py-1 rounded-lg bg-bg-raised border border-bg-border text-ink-tertiary outline-none hover:border-green-500/40 transition-colors cursor-pointer"
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
    <div className="flex items-center gap-2 py-1.5" style={{ paddingLeft: indent * 20 }}>
      {indent > 0 && <ChevronRight size={12} className="text-ink-tertiary flex-shrink-0 -ml-2" />}
      <div className="w-7 h-7 rounded-full bg-bg-raised border border-bg-border flex items-center justify-center flex-shrink-0">
        <span className="text-[10px] font-bold text-ink-tertiary">{initials}</span>
      </div>
      <span className="text-sm text-ink-primary">{user.displayName}</span>
      {user.telegramUsername && (
        <a href={`https://t.me/${user.telegramUsername}`} target="_blank" rel="noreferrer"
          className="text-xs text-ink-tertiary hover:text-green-400 transition-colors">
          @{user.telegramUsername}
        </a>
      )}
      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${ROLE_COLORS[user.role] || ""}`}>
        {badge || ROLE_LABELS[user.role] || user.role}
      </span>
      {assign}
    </div>
  );
}

function TeamHierarchy({ users, isAdmin, isHeadCreator, isHeadMark, working, onAssignTeamLead }: {
  users: UserRow[];
  isAdmin: boolean;
  isHeadCreator: boolean;
  isHeadMark: boolean;
  working: string | null;
  onAssignTeamLead: (userId: string, teamLeadId: string | null) => void;
}) {
  const byRole = (role: string) => users.filter((u) => u.role === role);
  const childrenOf = (parentId: string) => users.filter((u) => u.teamLeadId === parentId);

  const headCreators  = byRole("HEAD_CREATOR");
  const headMarketers = byRole("HEAD_MARKETER");
  const leadCreators  = byRole("LEAD_CREATOR");
  const marketers     = byRole("MARKETER");
  const creators      = byRole("CREATOR");

  const canMgCreators  = isAdmin || isHeadCreator;
  const canMgMarketers = isAdmin || isHeadMark;

  // Creators not assigned to any lead
  const orphanCreators = creators.filter((c) => !c.teamLeadId || !leadCreators.some((l) => l.id === c.teamLeadId));
  // Lead creators not assigned to any head
  const orphanLeads    = leadCreators.filter((l) => !l.teamLeadId || !headCreators.some((h) => h.id === l.teamLeadId));
  // Marketers not assigned to any head
  const orphanMkts     = marketers.filter((m) => !m.teamLeadId || !headMarketers.some((h) => h.id === m.teamLeadId));

  return (
    <div className="space-y-5">

      {/* ── CREATOR TREE ── */}
      <div className="bg-bg-surface border border-bg-border rounded-card p-5">
        <h3 className="text-sm font-semibold text-ink-primary flex items-center gap-2 mb-3">
          <Users size={14} className="text-orange-400" /> Команда креаторов
        </h3>

        {headCreators.length === 0 && leadCreators.length === 0 && creators.length === 0 && (
          <p className="text-xs text-ink-tertiary py-3">Нет пользователей</p>
        )}

        {/* Each HEAD_CREATOR → their LEAD_CREATORs → their CREATORs */}
        {headCreators.map((hc) => {
          const myLeads = childrenOf(hc.id).filter((u) => u.role === "LEAD_CREATOR");
          return (
            <div key={hc.id} className="mb-3 last:mb-0">
              <UserRow2 user={hc} />
              {myLeads.map((lc) => {
                const myCreators = childrenOf(lc.id).filter((u) => u.role === "CREATOR");
                return (
                  <div key={lc.id}>
                    <UserRow2
                      user={lc}
                      indent={1}
                      assign={canMgCreators ? (
                        <AssignSelect
                          value={lc.teamLeadId || ""}
                          options={headCreators}
                          disabled={working === lc.id}
                          placeholder="Без гл. креатора"
                          onChange={(v) => onAssignTeamLead(lc.id, v)}
                        />
                      ) : undefined}
                    />
                    {myCreators.map((cr) => (
                      <UserRow2
                        key={cr.id}
                        user={cr}
                        indent={2}
                        assign={canMgCreators ? (
                          <AssignSelect
                            value={cr.teamLeadId || ""}
                            options={leadCreators}
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
          );
        })}

        {/* Orphan lead creators (no HEAD_CREATOR assigned) */}
        {orphanLeads.length > 0 && (
          <div className="mt-3 pt-3 border-t border-bg-border/60">
            <p className="text-[10px] text-ink-tertiary uppercase tracking-wide mb-2">Тимлиды без главного</p>
            {orphanLeads.map((lc) => {
              const myCreators = childrenOf(lc.id).filter((u) => u.role === "CREATOR");
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
                      assign={canMgCreators ? (
                        <AssignSelect
                          value={cr.teamLeadId || ""}
                          options={leadCreators}
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

        {/* Orphan creators (no lead assigned) */}
        {orphanCreators.length > 0 && (
          <div className="mt-3 pt-3 border-t border-bg-border/60">
            <p className="text-[10px] text-ink-tertiary uppercase tracking-wide mb-2">Креаторы без тимлида</p>
            {orphanCreators.map((cr) => (
              <UserRow2
                key={cr.id}
                user={cr}
                indent={1}
                assign={canMgCreators && leadCreators.length > 0 ? (
                  <AssignSelect
                    value={cr.teamLeadId || ""}
                    options={leadCreators}
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

      {/* ── MARKETER TREE ── */}
      <div className="bg-bg-surface border border-bg-border rounded-card p-5">
        <h3 className="text-sm font-semibold text-ink-primary flex items-center gap-2 mb-3">
          <Users size={14} className="text-blue-400" /> Команда маркетологов
        </h3>

        {headMarketers.length === 0 && marketers.length === 0 && (
          <p className="text-xs text-ink-tertiary py-3">Нет пользователей</p>
        )}

        {headMarketers.map((hm) => {
          const myMkts = childrenOf(hm.id).filter((u) => u.role === "MARKETER");
          return (
            <div key={hm.id} className="mb-3 last:mb-0">
              <UserRow2 user={hm} />
              {myMkts.map((m) => (
                <UserRow2
                  key={m.id}
                  user={m}
                  indent={1}
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
    <div className="space-y-2">
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

function UsersList({ rows, onChangeRole, onDeactivate, working, currentUser, isAdmin }: any) {
  const [editRole, setEditRole] = useState<string | null>(null);

  const assignable = isAdmin
    ? ["CREATOR","LEAD_CREATOR","HEAD_CREATOR","MARKETER","HEAD_MARKETER","ADMIN"]
    : currentUser?.role === "HEAD_MARKETER"
    ? ["MARKETER","CREATOR","LEAD_CREATOR"]
    : currentUser?.role === "HEAD_CREATOR"
    ? ["CREATOR","LEAD_CREATOR"]
    : ["CREATOR"];

  return (
    <div className="space-y-2">
      {rows.map((u: UserRow) => (
        <div key={u.id} className="bg-bg-surface border border-bg-border rounded-card p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-green-400">
                {u.displayName.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0,2)}
              </span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-ink-primary truncate">{u.displayName}</span>
                {u.telegramUsername && (
                  <a href={`https://t.me/${u.telegramUsername}`} target="_blank" rel="noreferrer"
                    className="text-xs text-ink-tertiary hover:text-green-400 transition-colors">
                    @{u.telegramUsername}
                  </a>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[u.role] || ""}`}>
                  {ROLE_LABELS[u.role] || u.role}
                </span>
                {u.teamLead && (
                  <span className="text-xs text-ink-tertiary">тимлид: {u.teamLead.displayName}</span>
                )}
                {u._count && (
                  <span className="text-xs text-ink-tertiary">{u._count.assignments} заказов</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {editRole === u.id ? (
              <div className="flex items-center gap-2">
                <select
                  defaultValue={u.role}
                  onChange={(e) => { onChangeRole(u.id, e.target.value); setEditRole(null); }}
                  className="text-sm bg-bg-raised border border-bg-border rounded-lg px-2 py-1.5 text-ink-primary outline-none"
                  autoFocus
                >
                  {assignable.map((r: string) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
                <button onClick={() => setEditRole(null)} className="text-ink-tertiary hover:text-ink-primary">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <>
                {u.id !== currentUser?.id && (
                  <button
                    onClick={() => setEditRole(u.id)}
                    disabled={working === u.id}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-bg-border text-ink-tertiary hover:text-ink-primary hover:border-bg-hover text-xs transition-colors disabled:opacity-40"
                  >
                    <Crown size={12} /> Роль
                  </button>
                )}
                {isAdmin && u.id !== currentUser?.id && (
                  <button
                    onClick={() => onDeactivate(u.id)}
                    disabled={working === u.id}
                    className="p-1.5 rounded-lg hover:bg-red-500/10 text-ink-tertiary hover:text-red-400 transition-colors disabled:opacity-40"
                  >
                    <UserX size={15} />
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      ))}
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
