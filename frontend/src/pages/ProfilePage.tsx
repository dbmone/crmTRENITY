import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save, ExternalLink } from "lucide-react";
import { useAuthStore } from "../store/auth.store";
import Header from "../components/layout/Header";
import * as api from "../api/client";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Администратор", HEAD_MARKETER: "Главный маркетолог",
  MARKETER: "Маркетолог",  HEAD_CREATOR: "Главный креатор",
  LEAD_CREATOR: "Лид-креатор", CREATOR: "Креатор",
};
const ROLE_COLORS: Record<string, string> = {
  ADMIN: "text-red-400 bg-red-400/10",       HEAD_MARKETER: "text-purple-400 bg-purple-400/10",
  MARKETER: "text-blue-400 bg-blue-400/10",  HEAD_CREATOR: "text-orange-400 bg-orange-400/10",
  LEAD_CREATOR: "text-amber-400 bg-amber-400/10", CREATOR: "text-green-400 bg-green-400/10",
};

const inputCls = "w-full px-3.5 py-2.5 rounded-lg border border-bg-border bg-bg-raised text-sm text-ink-primary placeholder-ink-tertiary outline-none focus:border-green-500/50 focus:bg-bg-hover transition-colors";

export default function ProfilePage() {
  const navigate  = useNavigate();
  const user      = useAuthStore((s) => s.user);

  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [avatarUrl,   setAvatarUrl]   = useState(user?.avatarUrl || "");
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(false);
  const [error,       setError]       = useState("");

  if (!user) return null;

  const initials = displayName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  const handleSave = async () => {
    if (!displayName.trim()) { setError("Имя не может быть пустым"); return; }
    setSaving(true); setError("");
    try {
      const updated = await api.updateProfile(user.id, {
        displayName: displayName.trim(),
        avatarUrl: avatarUrl.trim() || undefined,
      });
      const stored = { ...user, ...updated };
      localStorage.setItem("user", JSON.stringify(stored));
      useAuthStore.setState({ user: stored });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || "Ошибка сохранения");
    }
    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-bg-base animate-soft-in">
      <Header />

      <div className="max-w-lg mx-auto px-4 py-8">
        <button onClick={() => navigate("/")}
          className="flex items-center gap-2 text-sm text-ink-tertiary hover:text-ink-primary mb-6 transition-colors">
          <ArrowLeft size={16} /> К доске
        </button>

        <div className="bg-bg-surface border border-bg-border rounded-modal overflow-hidden">
          {/* Avatar hero */}
          <div className="px-6 pt-8 pb-6 text-center border-b border-bg-border bg-gradient-to-b from-green-500/5 to-transparent">
            <div className="relative inline-block">
              <div className="w-20 h-20 rounded-full bg-green-500/10 border-2 border-green-500/20 flex items-center justify-center overflow-hidden mx-auto">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="w-full h-full object-cover" onError={() => setAvatarUrl("")} />
                ) : (
                  <span className="text-2xl font-bold text-green-400">{initials || "?"}</span>
                )}
              </div>
            </div>
            <h2 className="mt-3 text-lg font-semibold text-ink-primary">{user.displayName}</h2>
            <span className={`inline-block mt-1 text-xs font-medium px-2.5 py-1 rounded-full ${ROLE_COLORS[user.role] || "text-ink-tertiary bg-bg-raised"}`}>
              {ROLE_LABELS[user.role] || user.role}
            </span>
          </div>

          {/* Form */}
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-ink-tertiary mb-1.5">Отображаемое имя</label>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Твоё имя" className={inputCls} />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-tertiary mb-1.5">Ссылка на аватар (URL)</label>
              <input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://example.com/avatar.jpg" className={inputCls} />
              <p className="text-xs text-ink-tertiary mt-1">Прямая ссылка на изображение.</p>
            </div>

            {/* Telegram */}
            <div>
              <label className="block text-xs font-medium text-ink-tertiary mb-1.5">Telegram</label>
              <div className="flex items-center gap-2">
                <div className="flex-1 text-sm px-3.5 py-2.5 rounded-lg border border-bg-border bg-bg-raised text-ink-tertiary">
                  {user.telegramUsername ? `@${user.telegramUsername}` : "Не привязан"}
                </div>
                {user.telegramUsername && (
                  <a href={`https://t.me/${user.telegramUsername}`} target="_blank" rel="noopener noreferrer"
                    className="p-2.5 rounded-lg bg-[#229ED9]/10 text-[#229ED9] hover:bg-[#229ED9]/20 border border-[#229ED9]/20 transition-colors">
                    <ExternalLink size={16} />
                  </a>
                )}
              </div>
              <p className="text-xs text-ink-tertiary mt-1">Telegram изменить нельзя. PIN можно получить через бота.</p>
            </div>

            {error && <p className="text-sm text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}

            <button onClick={handleSave} disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-green-500 text-black text-sm font-bold hover:bg-green-400 disabled:opacity-50 transition-colors">
              {saving ? (
                <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              ) : saved ? "✓ Сохранено!" : (
                <><Save size={15} /> Сохранить</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
