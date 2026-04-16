import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "./store/auth.store";
import LoginPage from "./pages/LoginPage";
import BoardPage from "./pages/BoardPage";
import ProfilePage from "./pages/ProfilePage";
import AdminPage from "./pages/AdminPage";
import ArchivePage from "./pages/ArchivePage";
import DashboardPage from "./pages/DashboardPage";
import TasksPage from "./pages/TasksPage";
import AiPage from "./pages/AiPage";
import GuidePage from "./pages/GuidePage";
import TourOverlay from "./components/tour/TourOverlay";
import { useTourStore } from "./store/tour.store";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const hasCheckedAuth = useAuthStore((s) => s.hasCheckedAuth);
  if (!hasCheckedAuth) return <AppBootScreen />;
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const hasCheckedAuth = useAuthStore((s) => s.hasCheckedAuth);
  if (!hasCheckedAuth) return <AppBootScreen />;
  if (token) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppBootScreen() {
  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="h-10 w-10 rounded-full border-2 border-green-500/25 border-t-green-500 animate-spin" />
        <div>
          <p className="text-sm font-semibold text-ink-primary">Загружаем рабочее пространство</p>
          <p className="mt-1 text-xs text-ink-tertiary">Подтягиваем профиль, права и начальные данные CRM</p>
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

function AppRoutes() {
  return (
    <>
      <GuideGate />
      <Routes>
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/" element={<ProtectedRoute><BoardPage /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
        <Route path="/archive" element={<ProtectedRoute><ArchivePage /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/tasks" element={<ProtectedRoute><TasksPage /></ProtectedRoute>} />
        <Route path="/ai" element={<ProtectedRoute><AiPage /></ProtectedRoute>} />
        <Route path="/guide" element={<ProtectedRoute><GuidePage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  const checkAuth = useAuthStore((s) => s.checkAuth);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <BrowserRouter>
      <AppRoutes />
      <TourOverlay />
    </BrowserRouter>
  );
}
