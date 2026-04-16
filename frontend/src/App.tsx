import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./store/auth.store";
import { useEffect } from "react";
import LoginPage    from "./pages/LoginPage";
import BoardPage    from "./pages/BoardPage";
import ProfilePage  from "./pages/ProfilePage";
import AdminPage    from "./pages/AdminPage";
import ArchivePage  from "./pages/ArchivePage";
import DashboardPage from "./pages/DashboardPage";
import TasksPage    from "./pages/TasksPage";
import AiPage       from "./pages/AiPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (token) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const checkAuth = useAuthStore((s) => s.checkAuth);
  useEffect(() => { checkAuth(); }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/"         element={<ProtectedRoute><BoardPage /></ProtectedRoute>} />
        <Route path="/profile"  element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
        <Route path="/admin"    element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
        <Route path="/archive"  element={<ProtectedRoute><ArchivePage /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/tasks"    element={<ProtectedRoute><TasksPage /></ProtectedRoute>} />
        <Route path="/ai"       element={<ProtectedRoute><AiPage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
