import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Archive,
  Bell,
  BookOpen,
  Bot,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Menu,
  UserCircle,
  Users,
  X,
} from "lucide-react";
import { useAuthStore } from "../../store/auth.store";
import type { Notification } from "../../types";
import * as api from "../../api/client";

const ROLE_LABELS: Record<string, string> = {
  MARKETER: "Маркетолог",
  HEAD_MARKETER: "Главный маркетолог",
  CREATOR: "Креатор",
  HEAD_CREATOR: "Главный креатор",
  LEAD_CREATOR: "Лид креаторов",
  ADMIN: "Администратор",
};

const ROLE_COLORS: Record<string, string> = {
  MARKETER: "text-blue-400 bg-blue-400/10",
  HEAD_MARKETER: "text-purple-400 bg-purple-400/10",
  CREATOR: "text-green-400 bg-green-400/10",
  HEAD_CREATOR: "text-orange-400 bg-orange-400/10",
  LEAD_CREATOR: "text-amber-400 bg-amber-400/10",
  ADMIN: "text-red-400 bg-red-400/10",
};

const NAV = [
  { path: "/", label: "Доска", icon: LayoutDashboard, tour: "nav-board" },
  { path: "/tasks", label: "Задачи", icon: ListTodo, tour: "nav-tasks" },
  { path: "/guide", label: "Гайд", icon: BookOpen, tour: "nav-guide", showGuideDot: true },
  { path: "/archive", label: "Архив", icon: Archive, tour: "nav-archive" },
  { path: "/dashboard", label: "Аналитика", icon: LayoutDashboard, tour: "nav-dashboard" },
  { path: "/admin", label: "Команда", icon: Users, tour: "nav-admin", adminOnly: true },
  { path: "/ai", label: "AI", icon: Bot, tour: "nav-ai", aiOnly: true },
];

export default function Header() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const unread = notifications.filter((n) => !n.isRead).length;
  const guideNeedsAttention = !user?.guideSeenAt;

  const isAdmin = user?.role === "ADMIN";
  const isHeadMarketer = user?.role === "HEAD_MARKETER" || isAdmin;
  const isHeadCreator = user?.role === "HEAD_CREATOR" || isAdmin;
  const isLeadCreator = user?.role === "LEAD_CREATOR" || isAdmin;
  const canSeeAdmin = isAdmin || isHeadMarketer || isHeadCreator || isLeadCreator;
  const canSeeAi = isAdmin || isHeadCreator;

  const navItems = NAV.filter((item) => {
    if ((item as any).adminOnly) return canSeeAdmin;
    if ((item as any).aiOnly) return canSeeAi;
    return true;
  });

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!user) return;

    const loadNotifications = async () => {
      try {
        const data = await api.getNotifications(1, 30);
        const list = Array.isArray(data) ? data : data.items ?? data.notifications ?? [];
        setNotifications(list);
      } catch {}
    };

    void loadNotifications();
    const interval = window.setInterval(loadNotifications, 30_000);
    return () => window.clearInterval(interval);
  }, [user]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifs(false);
      }
    };

    if (showNotifs) {
      document.addEventListener("mousedown", handler);
    }
    return () => document.removeEventListener("mousedown", handler);
  }, [showNotifs]);

  const initials = user?.displayName
    ?.split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const markAllNotificationsRead = async () => {
    await api.markAllNotificationsRead();
    setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
  };

  const openNotification = async (notification: Notification) => {
    await api.markNotificationRead(notification.id);
    setNotifications((prev) => prev.map((item) => (
      item.id === notification.id ? { ...item, isRead: true } : item
    )));
    setShowNotifs(false);

    if (notification.type === "REGISTRATION_REQUEST") {
      navigate("/admin?tab=pending");
    }
  };

  const renderNavButton = (item: (typeof NAV)[number], mobile = false) => {
    const active = location.pathname === item.path;
    const showDot = Boolean((item as any).showGuideDot && guideNeedsAttention);

    return (
      <button
        key={`${mobile ? "m" : "d"}-${item.path}`}
        type="button"
        onClick={() => navigate(item.path)}
        data-tour={(item as any).tour}
        className={mobile
          ? `flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors ${
              active
                ? "bg-green-500/10 text-green-400"
                : "text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
            }`
          : `flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-green-500/10 text-green-400"
                : "text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
            }`}
      >
        <item.icon size={mobile ? 17 : 14} />
        <span>{item.label}</span>
        {showDot && (
          <span className={mobile ? "ml-auto text-xs text-green-400" : "text-xs text-green-400"}>
            ●
          </span>
        )}
      </button>
    );
  };

  return (
    <header className="sticky top-0 z-50 border-b border-bg-border bg-bg-surface">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
        <button type="button" onClick={() => navigate("/")} className="flex flex-shrink-0 items-center">
          <span className="font-bold tracking-tight text-ink-primary">
            TRENITY <span className="text-green-500">CRM</span>
          </span>
        </button>

        <nav className="ml-2 hidden items-center gap-1 md:flex">
          {navItems.map((item) => renderNavButton(item))}
        </nav>

        {user && (
          <div className="ml-auto flex flex-shrink-0 items-center gap-1.5 sm:gap-2">
            <span className={`hidden rounded-full px-2 py-1 text-xs font-medium sm:inline ${ROLE_COLORS[user.role] || "bg-bg-hover text-ink-secondary"}`}>
              {ROLE_LABELS[user.role] || user.role}
            </span>

            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => setShowNotifs((prev) => !prev)}
                className="relative rounded-lg p-2 text-ink-secondary transition-colors hover:bg-bg-hover hover:text-ink-primary"
              >
                <Bell size={16} />
                {unread > 0 && (
                  <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-[9px] font-black text-black">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </button>

              {showNotifs && (
                <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-1rem)] overflow-hidden rounded-modal border border-bg-border bg-bg-surface shadow-modal">
                  <div className="flex items-center justify-between border-b border-bg-border px-4 py-3">
                    <span className="text-sm font-semibold text-ink-primary">Уведомления</span>
                    <div className="flex items-center gap-2">
                      {unread > 0 && (
                        <button type="button" onClick={markAllNotificationsRead} className="text-xs text-green-400 hover:text-green-300">
                          Прочитать все
                        </button>
                      )}
                      <button type="button" onClick={() => setShowNotifs(false)} className="rounded p-1 text-ink-tertiary hover:text-ink-primary">
                        <X size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="py-8 text-center text-ink-tertiary">
                        <Bell size={24} className="mx-auto mb-2 opacity-30" />
                        <p className="text-sm">Пока уведомлений нет</p>
                      </div>
                    ) : (
                      notifications.map((notification) => (
                        <button
                          key={notification.id}
                          type="button"
                          onClick={() => void openNotification(notification)}
                          className={`w-full border-b border-bg-border px-4 py-3 text-left transition-colors last:border-0 hover:bg-bg-raised ${
                            !notification.isRead ? "bg-green-500/5" : ""
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            {!notification.isRead && <div className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-green-500" />}
                            <div className={!notification.isRead ? "" : "pl-4"}>
                              <p className="text-sm leading-snug text-ink-primary">{notification.message}</p>
                              {notification.order && <p className="mt-0.5 text-xs text-ink-tertiary">{notification.order.title}</p>}
                              <p className="mt-1 text-[10px] text-ink-tertiary">
                                {new Date(notification.createdAt).toLocaleString("ru-RU", {
                                  day: "numeric",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </p>
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => navigate("/profile")}
              className="hidden items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-bg-hover md:flex"
            >
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-green-500/30 bg-green-500/20">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[10px] font-bold text-green-400">{initials}</span>
                )}
              </div>
              <span className="text-sm font-medium text-ink-primary">{user.displayName}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                logout();
                navigate("/login");
              }}
              className="hidden rounded-lg p-2 text-ink-tertiary transition-colors hover:bg-bg-hover hover:text-red-400 md:block"
              title="Выйти"
            >
              <LogOut size={16} />
            </button>

            <button
              type="button"
              onClick={() => setMobileOpen((prev) => !prev)}
              className="rounded-lg p-2 text-ink-secondary transition-colors hover:bg-bg-hover md:hidden"
              aria-label="Меню"
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        )}
      </div>

      {mobileOpen && user && (
        <div className="border-t border-bg-border bg-bg-surface md:hidden">
          <div className="flex items-center gap-3 border-b border-bg-border px-5 py-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-green-500/30 bg-green-500/20">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-sm font-bold text-green-400">{initials}</span>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink-primary">{user.displayName}</p>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[user.role] || "bg-bg-hover text-ink-secondary"}`}>
                {ROLE_LABELS[user.role] || user.role}
              </span>
            </div>
          </div>

          <nav className="space-y-0.5 px-3 py-2">
            {navItems.map((item) => renderNavButton(item, true))}

            <button
              type="button"
              onClick={() => navigate("/profile")}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors ${
                location.pathname === "/profile"
                  ? "bg-green-500/10 text-green-400"
                  : "text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
              }`}
            >
              <UserCircle size={17} />
              <span>Профиль</span>
            </button>
          </nav>

          <div className="px-3 pb-3">
            <button
              type="button"
              onClick={() => {
                logout();
                navigate("/login");
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-red-400 transition-colors hover:bg-red-400/10"
            >
              <LogOut size={17} />
              <span>Выйти</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
