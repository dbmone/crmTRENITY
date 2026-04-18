import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  TrendingUp,
  UserCircle,
  Users,
  X,
} from "lucide-react";
import * as api from "../../api/client";
import { TOUR_STEPS } from "../../data/tourSteps";
import { useAuthStore } from "../../store/auth.store";
import { useTourStore } from "../../store/tour.store";
import type { Notification } from "../../types";

const DESKTOP_NAV_BREAKPOINT = 1024;

const ROLE_LABELS: Record<string, string> = {
  MARKETER: "Маркетолог",
  HEAD_MARKETER: "Главный маркетолог",
  CREATOR: "Креатор",
  HEAD_CREATOR: "Главный креатор",
  LEAD_CREATOR: "Тимлид креаторов",
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

type NavItem = {
  path: string;
  label: string;
  icon: typeof LayoutDashboard;
  tour: string;
  showGuideDot?: boolean;
  adminOnly?: boolean;
  aiOnly?: boolean;
};

const NAV: NavItem[] = [
  { path: "/", label: "Доска", icon: LayoutDashboard, tour: "nav-board" },
  { path: "/tasks", label: "Задачи", icon: ListTodo, tour: "nav-tasks" },
  { path: "/guide", label: "Гайд", icon: BookOpen, tour: "nav-guide", showGuideDot: true },
  { path: "/archive", label: "Архив", icon: Archive, tour: "nav-archive" },
  { path: "/dashboard", label: "Аналитика", icon: LayoutDashboard, tour: "nav-dashboard" },
  { path: "/admin", label: "Команда", icon: Users, tour: "nav-admin", adminOnly: true },
  { path: "/ai", label: "AI", icon: Bot, tour: "nav-ai", aiOnly: true },
  { path: "/earnings", label: "Заработки", icon: TrendingUp, tour: "nav-earnings" },
];

export default function Header() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopIndicator, setDesktopIndicator] = useState({ left: 0, width: 0, opacity: 0 });

  const notifRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLDivElement>(null);

  const tourActive = useTourStore((s) => s.active);
  const tourStepIndex = useTourStore((s) => s.stepIndex);
  const tourRole = useTourStore((s) => s.role);

  const unread = notifications.filter((n) => !n.isRead).length;
  const guideNeedsAttention = !user?.guideSeenAt;

  const isAdmin = user?.role === "ADMIN";
  const isHeadMarketer = user?.role === "HEAD_MARKETER" || isAdmin;
  const isHeadCreator = user?.role === "HEAD_CREATOR" || isAdmin;
  const isLeadCreator = user?.role === "LEAD_CREATOR" || isAdmin;
  const canSeeAdmin = isAdmin || isHeadMarketer || isHeadCreator || isLeadCreator;
  const canSeeAi = isAdmin || isHeadCreator || isHeadMarketer;

  const navItems = NAV.filter((item) => {
    if (item.adminOnly) return canSeeAdmin;
    if (item.aiOnly) return canSeeAi;
    return true;
  });

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= DESKTOP_NAV_BREAKPOINT) {
        setMobileOpen(false);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const steps = tourRole ? TOUR_STEPS[tourRole] ?? [] : [];
    const step = tourActive ? steps[tourStepIndex] : null;
    const target = step?.target ?? "";
    if (!tourActive || window.innerWidth >= DESKTOP_NAV_BREAKPOINT) return;
    setMobileOpen(target.startsWith("nav-"));
  }, [tourActive, tourRole, tourStepIndex]);

  useEffect(() => {
    if (!user) return;

    const loadNotifications = async () => {
      try {
        const data = await api.getNotifications(1, 30);
        const list = Array.isArray(data) ? data : data.items ?? data.notifications ?? [];
        setNotifications(list);
      } catch {
        // noop
      }
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

    if (showNotifs) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showNotifs]);

  const updateDesktopIndicator = () => {
    if (!navRef.current || window.innerWidth < DESKTOP_NAV_BREAKPOINT) {
      setDesktopIndicator((prev) => ({ ...prev, opacity: 0 }));
      return;
    }

    const activeButton = navRef.current.querySelector<HTMLButtonElement>(`button[data-nav-path="${location.pathname}"]`);
    if (!activeButton) {
      setDesktopIndicator((prev) => ({ ...prev, opacity: 0 }));
      return;
    }

    setDesktopIndicator({
      left: activeButton.offsetLeft,
      width: activeButton.offsetWidth,
      opacity: 1,
    });
  };

  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(updateDesktopIndicator);
    const handleResize = () => updateDesktopIndicator();

    window.addEventListener("resize", handleResize);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleResize);
    };
  }, [location.pathname, navItems.length]);

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

  const renderNavButton = (item: NavItem, mobile = false) => {
    const active = location.pathname === item.path;
    const showDot = Boolean(item.showGuideDot && guideNeedsAttention);

    return (
      <button
        key={`${mobile ? "m" : "d"}-${item.path}`}
        type="button"
        onClick={() => navigate(item.path)}
        data-tour={item.tour}
        data-tour-padding={mobile ? 6 : 2}
        data-nav-path={item.path}
        className={mobile
          ? `flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors ${
              active
                ? "bg-green-500/10 text-green-400"
                : "text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
            }`
          : `relative z-10 flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 ${
              active
                ? "text-green-300"
                : "text-ink-secondary hover:text-ink-primary"
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
      <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-4 py-3 sm:px-6 md:px-8">
        <div className="flex min-w-0 justify-start">
          <button type="button" onClick={() => navigate("/")} className="relative z-10 flex flex-shrink-0 items-center">
            <span className="font-bold tracking-tight text-ink-primary">
              TRENITY <span className="text-green-500">CRM</span>
            </span>
          </button>
        </div>

        <div className="hidden min-w-0 justify-self-center lg:flex">
          <nav
            ref={navRef}
            className="pointer-events-auto relative flex items-center gap-1 rounded-xl border border-bg-border/80 bg-bg-surface/95 px-2 py-1 backdrop-blur-sm"
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute bottom-1 top-1 rounded-lg border border-green-500/20 bg-green-500/10 transition-[left,width,opacity] duration-300 ease-out"
              style={{
                left: desktopIndicator.left,
                width: desktopIndicator.width,
                opacity: desktopIndicator.opacity,
              }}
            />
            {navItems.map((item) => renderNavButton(item))}
          </nav>
        </div>

        <div className="flex min-w-0 justify-end">
          {user && (
            <div className="relative z-10 flex min-w-0 items-center justify-end gap-1 sm:gap-2">
              <span className={`rounded-full px-2 py-1 text-[10px] font-medium sm:text-xs ${ROLE_COLORS[user.role] || "bg-bg-hover text-ink-secondary"}`}>
                {ROLE_LABELS[user.role] || user.role}
              </span>

              <div className="relative" ref={notifRef}>
                <button
                  type="button"
                  onClick={() => setShowNotifs((prev) => !prev)}
                  className="relative rounded-lg p-1.5 text-ink-secondary transition-colors hover:bg-bg-hover hover:text-ink-primary sm:p-2"
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
                data-tour="profile-btn"
                data-tour-padding={3}
                onClick={() => navigate("/profile")}
                className="flex items-center gap-2 rounded-lg p-1.5 transition-colors hover:bg-bg-hover sm:px-2 sm:py-1.5"
              >
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-green-500/30 bg-green-500/20">
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-[10px] font-bold text-green-400">{initials}</span>
                  )}
                </div>
                <span className="hidden text-sm font-medium text-ink-primary lg:block">{user.displayName}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  logout();
                  navigate("/login");
                }}
                className="rounded-lg p-1.5 text-ink-tertiary transition-colors hover:bg-bg-hover hover:text-red-400 sm:p-2"
                title="Выйти"
              >
                <LogOut size={16} />
              </button>

              <button
                type="button"
                onClick={() => setMobileOpen((prev) => !prev)}
                className="rounded-lg p-1.5 text-ink-secondary transition-colors hover:bg-bg-hover lg:hidden sm:p-2"
                aria-label="Меню"
              >
                {mobileOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
            </div>
          )}
        </div>
      </div>

      {mobileOpen && user && (
        <div className="border-t border-bg-border bg-bg-surface lg:hidden">
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
