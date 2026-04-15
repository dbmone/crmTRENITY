import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "../../store/auth.store";
import { LogOut, Bell, X, LayoutDashboard, Archive, Users, Menu, UserCircle } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { Notification } from "../../types";
import * as api from "../../api/client";

const ROLE_LABELS: Record<string, string> = {
  MARKETER: "Маркетолог", HEAD_MARKETER: "Гл. маркетолог",
  CREATOR: "Креатор",     HEAD_CREATOR: "Гл. креатор",
  LEAD_CREATOR: "Лид-креатор", ADMIN: "Админ",
};

const ROLE_COLORS: Record<string, string> = {
  MARKETER:     "text-blue-400 bg-blue-400/10",
  HEAD_MARKETER:"text-purple-400 bg-purple-400/10",
  CREATOR:      "text-green-400 bg-green-400/10",
  HEAD_CREATOR: "text-orange-400 bg-orange-400/10",
  LEAD_CREATOR: "text-amber-400 bg-amber-400/10",
  ADMIN:        "text-red-400 bg-red-400/10",
};

const NAV = [
  { path: "/",         label: "Доска",     icon: LayoutDashboard },
  { path: "/archive",  label: "Архив",     icon: Archive },
  { path: "/dashboard",label: "Аналитика", icon: LayoutDashboard },
  { path: "/admin",    label: "Команда",   icon: Users, adminOnly: true },
];

export default function Header() {
  const user    = useAuthStore((s) => s.user);
  const logout  = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifs,    setShowNotifs]    = useState(false);
  const [mobileOpen,    setMobileOpen]    = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const unread = notifications.filter((n) => !n.isRead).length;

  const isAdmin       = user?.role === "ADMIN";
  const isHeadMark    = user?.role === "HEAD_MARKETER" || isAdmin;
  const isHeadCreator = user?.role === "HEAD_CREATOR"  || isAdmin;
  const isLeadCreate  = user?.role === "LEAD_CREATOR"  || isAdmin;
  const canSeeAdmin   = isAdmin || isHeadMark || isHeadCreator || isLeadCreate;

  // Close mobile menu on route change
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const loadNotifs = async () => {
    try {
      const data = await api.getNotifications(1, 30);
      const list  = Array.isArray(data) ? data : (data.items ?? data.notifications ?? []);
      setNotifications(list);
    } catch {}
  };

  useEffect(() => {
    if (!user) return;
    loadNotifs();
    const iv = setInterval(loadNotifs, 30_000);
    return () => clearInterval(iv);
  }, [user]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node))
        setShowNotifs(false);
    };
    if (showNotifs) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showNotifs]);

  const markAll = async () => {
    await api.markAllNotificationsRead();
    setNotifications((p) => p.map((n) => ({ ...n, isRead: true })));
  };

  const markOne = async (id: string, type?: string) => {
    await api.markNotificationRead(id);
    setNotifications((p) => p.map((n) => n.id === id ? { ...n, isRead: true } : n));
    setShowNotifs(false);
    if (type === "REGISTRATION_REQUEST") navigate("/admin?tab=pending");
  };

  const initials = user?.displayName
    ?.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  const navItems = NAV.filter((n) => !n.adminOnly || canSeeAdmin);

  return (
    <header className="sticky top-0 z-50 bg-bg-surface border-b border-bg-border">
      {/* ── Top bar ── */}
      <div className="flex items-center gap-3 px-4 sm:px-6 py-3">
        {/* Logo */}
        <button onClick={() => navigate("/")} className="flex items-center flex-shrink-0">
          <span className="font-bold text-ink-primary tracking-tight">
            TRENITY <span className="text-green-500">CRM</span>
          </span>
        </button>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1 ml-2">
          {navItems.map((item) => {
            const active = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-green-500/10 text-green-400"
                    : "text-ink-secondary hover:text-ink-primary hover:bg-bg-hover"
                }`}
              >
                <item.icon size={14} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Right side */}
        {user && (
          <div className="flex items-center gap-1.5 sm:gap-2 ml-auto flex-shrink-0">
            {/* Role badge — desktop only */}
            <span className={`hidden sm:inline text-xs px-2 py-1 rounded-full font-medium ${ROLE_COLORS[user.role] || "text-ink-secondary bg-bg-hover"}`}>
              {ROLE_LABELS[user.role] || user.role}
            </span>

            {/* Bell */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setShowNotifs(!showNotifs)}
                className="relative p-2 rounded-lg hover:bg-bg-hover transition-colors text-ink-secondary hover:text-ink-primary"
              >
                <Bell size={16} />
                {unread > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-green-500 text-black text-[9px] font-black rounded-full flex items-center justify-center">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </button>

              {showNotifs && (
                <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-1rem)] bg-bg-surface border border-bg-border rounded-modal shadow-modal overflow-hidden animate-modal">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-bg-border">
                    <span className="text-sm font-semibold text-ink-primary">Уведомления</span>
                    <div className="flex items-center gap-2">
                      {unread > 0 && (
                        <button onClick={markAll} className="text-xs text-green-400 hover:text-green-300">
                          Прочитать все
                        </button>
                      )}
                      <button onClick={() => setShowNotifs(false)} className="p-1 rounded text-ink-tertiary hover:text-ink-primary">
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="text-center py-8 text-ink-tertiary">
                        <Bell size={24} className="mx-auto mb-2 opacity-30" />
                        <p className="text-sm">Нет уведомлений</p>
                      </div>
                    ) : notifications.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => markOne(n.id, n.type)}
                        className={`w-full text-left px-4 py-3 border-b border-bg-border last:border-0 hover:bg-bg-raised transition-colors ${!n.isRead ? "bg-green-500/5" : ""}`}
                      >
                        <div className="flex items-start gap-2.5">
                          {!n.isRead && <div className="w-1.5 h-1.5 bg-green-500 rounded-full mt-2 flex-shrink-0" />}
                          <div className={!n.isRead ? "" : "pl-4"}>
                            <p className="text-sm text-ink-primary leading-snug">{n.message}</p>
                            {n.order && <p className="text-xs text-ink-tertiary mt-0.5">{n.order.title}</p>}
                            <p className="text-[10px] text-ink-tertiary mt-1">
                              {new Date(n.createdAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Profile — desktop only */}
            <button
              onClick={() => navigate("/profile")}
              className="hidden md:flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-bg-hover transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center overflow-hidden flex-shrink-0">
                {user.avatarUrl
                  ? <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
                  : <span className="text-[10px] font-bold text-green-400">{initials}</span>
                }
              </div>
              <span className="text-sm font-medium text-ink-primary">{user.displayName}</span>
            </button>

            {/* Logout — desktop only */}
            <button
              onClick={() => { logout(); navigate("/login"); }}
              className="hidden md:block p-2 rounded-lg hover:bg-bg-hover transition-colors text-ink-tertiary hover:text-red-400"
              title="Выйти"
            >
              <LogOut size={16} />
            </button>

            {/* Hamburger — mobile only */}
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="md:hidden p-2 rounded-lg hover:bg-bg-hover transition-colors text-ink-secondary"
              aria-label="Меню"
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        )}
      </div>

      {/* ── Mobile menu ── */}
      {mobileOpen && user && (
        <div className="md:hidden bg-bg-surface border-t border-bg-border">
          {/* User info row */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-bg-border">
            <div className="w-10 h-10 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center overflow-hidden flex-shrink-0">
              {user.avatarUrl
                ? <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
                : <span className="text-sm font-bold text-green-400">{initials}</span>
              }
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink-primary truncate">{user.displayName}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[user.role] || "text-ink-secondary bg-bg-hover"}`}>
                {ROLE_LABELS[user.role] || user.role}
              </span>
            </div>
          </div>

          {/* Nav items */}
          <nav className="px-3 py-2 space-y-0.5">
            {navItems.map((item) => {
              const active = location.pathname === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`flex items-center gap-3 w-full px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? "bg-green-500/10 text-green-400"
                      : "text-ink-secondary hover:text-ink-primary hover:bg-bg-hover"
                  }`}
                >
                  <item.icon size={17} />
                  {item.label}
                </button>
              );
            })}

            <button
              onClick={() => navigate("/profile")}
              className={`flex items-center gap-3 w-full px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                location.pathname === "/profile"
                  ? "bg-green-500/10 text-green-400"
                  : "text-ink-secondary hover:text-ink-primary hover:bg-bg-hover"
              }`}
            >
              <UserCircle size={17} />
              Профиль
            </button>
          </nav>

          {/* Logout */}
          <div className="px-3 pb-3">
            <button
              onClick={() => { logout(); navigate("/login"); }}
              className="flex items-center gap-3 w-full px-3 py-3 rounded-lg text-sm font-medium text-red-400 hover:bg-red-400/10 transition-colors"
            >
              <LogOut size={17} />
              Выйти
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
