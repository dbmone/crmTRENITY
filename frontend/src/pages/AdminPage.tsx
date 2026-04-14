import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../store/auth.store";
import Header from "../components/layout/Header";
import { Check, X, Shield, RefreshCw, UserX, Crown } from "lucide-react";
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
  teamLead?: { displayName: string } | null;
  _count?: { assignments: number };
}

export default function AdminPage() {
  const user     = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [users,    setUsers]    = useState<UserRow[]>([]);
  const [pending,  setPending]  = useState<UserRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState<"users" | "pending">(
    searchParams.get("tab") === "pending" ? "pending" : "users"
  );
  const [working,  setWorking]  = useState<string | null>(null);

  const isAdmin    = user?.role === "ADMIN";
  const isHeadMark = user?.role === "HEAD_MARKETER" || isAdmin;
  const isLead     = user?.role === "LEAD_CREATOR"  || isAdmin;
  const canAccess  = isAdmin || isHeadMark || isLead;

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

  if (!canAccess) return null;

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
          <button onClick={load} className="p-2 rounded-lg border border-bg-border hover:bg-bg-raised text-ink-tertiary hover:text-ink-primary transition-colors">
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-bg-border mb-6">
          {([["users", "Пользователи"], ["pending", `Заявки ${pending.length > 0 ? `(${pending.length})` : ""}`]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id as any)}
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
        ) : (
          <UsersList rows={users} onChangeRole={changeRole} onDeactivate={deactivate} working={working} currentUser={user} isAdmin={isAdmin} />
        )}
      </div>
    </div>
  );
}

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
            {/* Approve as creator (lead can do it) */}
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
