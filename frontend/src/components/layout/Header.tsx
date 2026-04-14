import { useAuthStore } from "../../store/auth.store";
import { LogOut, LayoutGrid } from "lucide-react";
import { useNavigate } from "react-router-dom";

const ROLE_LABELS: Record<string, string> = {
  MARKETER: "Маркетолог",
  CREATOR: "Креатор",
  LEAD_CREATOR: "Главный креатор",
  ADMIN: "Администратор",
};

const ROLE_COLORS: Record<string, string> = {
  MARKETER: "bg-brand-50 text-brand-800",
  CREATOR: "bg-emerald-50 text-emerald-700",
  LEAD_CREATOR: "bg-amber-50 text-amber-700",
  ADMIN: "bg-red-50 text-red-700",
};

export default function Header() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const initials = user?.displayName
    ?.split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-between sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-brand-50 rounded-lg flex items-center justify-center">
          <LayoutGrid size={16} className="text-brand-600" />
        </div>
        <h1 className="text-base font-semibold text-ink-primary">CRM Creators</h1>
      </div>

      <div className="flex items-center gap-4">
        {user && (
          <div className="flex items-center gap-3">
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${ROLE_COLORS[user.role] || ""}`}>
              {ROLE_LABELS[user.role] || user.role}
            </span>

            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-xs font-semibold text-brand-600">
                {initials}
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-medium text-ink-primary leading-tight">{user.displayName}</p>
                {user.telegramUsername && (
                  <p className="text-xs text-ink-tertiary leading-tight">@{user.telegramUsername}</p>
                )}
              </div>
            </div>

            <button
              onClick={() => {
                logout();
                navigate("/login");
              }}
              className="p-2 rounded-lg hover:bg-surface-secondary transition-colors text-ink-tertiary hover:text-ink-primary"
              title="Выйти"
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
