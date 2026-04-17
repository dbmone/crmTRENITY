import { useEffect } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import TourOverlay from "./components/tour/TourOverlay";
import Header from "./components/layout/Header";
import AdminPage from "./pages/AdminPage";
import AiPage from "./pages/AiPage";
import ArchivePage from "./pages/ArchivePage";
import BoardPage from "./pages/BoardPage";
import DashboardPage from "./pages/DashboardPage";
import GuidePage from "./pages/GuidePage";
import LoginPage from "./pages/LoginPage";
import ProfilePage from "./pages/ProfilePage";
import TasksPage from "./pages/TasksPage";
import { useAuthStore } from "./store/auth.store";
import { useTourStore } from "./store/tour.store";
import * as api from "./api/client";

function PublicRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const hasCheckedAuth = useAuthStore((s) => s.hasCheckedAuth);

  if (!hasCheckedAuth) return <AppBootScreen />;
  if (token) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function ProtectedShell() {
  const token = useAuthStore((s) => s.token);
  const hasCheckedAuth = useAuthStore((s) => s.hasCheckedAuth);

  if (!hasCheckedAuth) return <AppBootScreen />;
  if (!token) return <Navigate to="/login" replace />;
  return <AppShell />;
}

function AppBootScreen() {
  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="h-10 w-10 rounded-full border-2 border-green-500/25 border-t-green-500 animate-spin" />
        <div>
          <p className="text-sm font-semibold text-ink-primary">Загружаем рабочее пространство</p>
          <p className="mt-1 text-xs text-ink-tertiary">Подтягиваем профиль, права и стартовые данные CRM</p>
        </div>
      </div>
    </div>
  );
}

function GuideGate() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const tourActive = useTourStore((s) => s.active);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!token || !user) return;
    if (tourActive) return;
    if (!user.guideSeenAt && location.pathname !== "/guide") {
      navigate("/guide", { replace: true });
    }
  }, [location.pathname, navigate, token, tourActive, user]);

  return null;
}

function AppShell() {
  const location = useLocation();

  return (
    <>
      <GuideGate />
      <div className="min-h-screen flex flex-col bg-bg-base">
        <Header />
        <div key={location.pathname} className="min-h-0 flex-1 animate-page-in">
          <Outlet />
        </div>
      </div>
    </>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />

      <Route element={<ProtectedShell />}>
        <Route path="/" element={<BoardPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/archive" element={<ArchivePage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/ai" element={<AiPage />} />
        <Route path="/guide" element={<GuidePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  const checkAuth = useAuthStore((s) => s.checkAuth);

  useEffect(() => {
    // Telegram Mini App: auto-login via initData if not already logged in
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.initData && !localStorage.getItem("token")) {
      tg.ready?.();
      api.loginByTelegramWebApp(tg.initData)
        .then(() => checkAuth())
        .catch(() => checkAuth()); // on failure fall through to PIN login
      return;
    }
    checkAuth();
  }, [checkAuth]);

  return (
    <BrowserRouter>
      <AppRoutes />
      <TourOverlay />
    </BrowserRouter>
  );
}
