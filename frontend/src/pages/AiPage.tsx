import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth.store";
import Header from "../components/layout/Header";
import { Bot, RotateCw } from "lucide-react";
import * as api from "../api/client";

function PromptEditor({ settingKey, title, description, jsonOutput, tourTarget }: {
  settingKey: string;
  title: string;
  description: React.ReactNode;
  jsonOutput?: boolean;
  tourTarget?: string;
}) {
  const [prompt,    setPrompt]    = useState("");
  const [original,  setOriginal]  = useState("");
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [resetting, setResetting] = useState(false);
  const [saved,     setSaved]     = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const s = await api.getSettings();
        const val = s[settingKey] ?? "";
        setPrompt(val);
        setOriginal(val);
      } catch {}
      setLoading(false);
    })();
  }, [settingKey]);

  const save = async () => {
    if (!prompt.trim()) return;
    setSaving(true);
    try {
      await api.updateSetting(settingKey, prompt);
      setOriginal(prompt);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) { alert(e.response?.data?.error || "Ошибка"); }
    setSaving(false);
  };

  const reset = async () => {
    if (!confirm("Сбросить к значению по умолчанию?")) return;
    setResetting(true);
    try {
      const res = await api.resetSetting(settingKey);
      setPrompt(res.value);
      setOriginal(res.value);
    } catch (e: any) { alert(e.response?.data?.error || "Ошибка"); }
    setResetting(false);
  };

  const isDirty = prompt !== original;

  if (loading) return (
    <div className="flex justify-center py-10">
      <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div data-tour={tourTarget} className="bg-bg-surface border border-bg-border rounded-xl p-5">
      <div className="flex items-start justify-between mb-1">
        <h3 className="text-sm font-semibold text-ink-primary flex items-center gap-2">
          <Bot size={14} className="text-purple-400" />
          {title}
        </h3>
        <button onClick={reset} disabled={resetting} title="Сбросить к умолчанию"
          className="flex items-center gap-1 text-xs text-ink-tertiary hover:text-ink-primary transition-colors disabled:opacity-40">
          <RotateCw size={12} className={resetting ? "animate-spin" : ""} />
          Сбросить
        </button>
      </div>
      <p className="text-xs text-ink-tertiary mb-3">{description}</p>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={14}
        className="w-full px-3.5 py-2.5 rounded-lg border border-bg-border bg-bg-raised text-sm text-ink-primary placeholder-ink-tertiary outline-none focus:border-purple-500/50 transition-colors resize-y font-mono"
      />

      <div className="flex items-center justify-between mt-3">
        <span className="text-xs">
          {prompt.includes("{{TEXT}}") ? (
            <span className="text-green-400">✓ Содержит {"{{TEXT}}"}</span>
          ) : (
            <span className="text-amber-400">⚠ Нет {"{{TEXT}}"} — голос не подставится</span>
          )}
          {jsonOutput && !prompt.toLowerCase().includes("json") && (
            <span className="text-amber-400 ml-2">⚠ Напомни LLM вернуть JSON</span>
          )}
        </span>
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs text-green-400">Сохранено</span>}
          <button
            onClick={save}
            disabled={saving || !isDirty || !prompt.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-500 text-white text-sm font-bold hover:bg-purple-400 disabled:opacity-50 transition-colors"
          >
            {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {saving ? "Сохраняю..." : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AiPage() {
  const user     = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  const canAccess = user?.role === "ADMIN" || user?.role === "HEAD_CREATOR" || user?.role === "HEAD_MARKETER";

  useEffect(() => {
    if (!canAccess) navigate("/");
  }, [canAccess]);

  if (!canAccess) return null;

  return (
    <div className="min-h-screen bg-bg-base">
      <Header />
      <div className="max-w-3xl mx-auto px-6 py-8" data-tour="ai-page">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-ink-primary flex items-center gap-2">
            <Bot size={20} className="text-purple-400" />
            AI-настройки
          </h1>
          <p className="text-sm text-ink-tertiary mt-1">
            Промпты для структурирования голосовых записей через LLM
          </p>
        </div>

        <div className="space-y-6">
          <PromptEditor
            settingKey="task_parse_prompt"
            tourTarget="ai-task-prompt"
            title="Голос → Личная задача"
            description={<>
              Используется на странице{" "}
              <span className="text-ink-secondary">Задачи</span> при записи голоса.
              Подставь <code className="bg-bg-raised px-1 rounded text-purple-300">{"{{TEXT}}"}</code> — туда попадёт расшифровка.
              LLM должна вернуть JSON:{" "}
              <code className="bg-bg-raised px-1 rounded text-ink-secondary">title, description, priority, subtasks[]</code>.
            </>}
            jsonOutput
          />

          <PromptEditor
            settingKey="tz_structure_prompt"
            tourTarget="ai-tz-prompt"
            title="Голос → Структурированное ТЗ"
            description={<>
              Используется в кнопке <span className="text-ink-secondary">🪄 Голос → ТЗ</span> внутри заказа.
              Подставь <code className="bg-bg-raised px-1 rounded text-purple-300">{"{{TEXT}}"}</code> — туда попадёт расшифровка.
              LLM должна вернуть форматированный текст (не JSON).
            </>}
          />

          <div className="bg-bg-surface border border-bg-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-ink-primary mb-3 flex items-center gap-2">
              <Bot size={14} className="text-ink-tertiary" />
              Провайдер LLM (переменные окружения)
            </h3>
            <div className="space-y-2 text-xs text-ink-tertiary">
              <div className="flex items-start gap-2">
                <code className="text-ink-secondary bg-bg-raised px-1.5 py-0.5 rounded flex-shrink-0">G4F_API_URL</code>
                <span>URL gpt4free Docker-сервиса (напр. <code className="bg-bg-raised px-1 rounded">http://g4f:1337</code>). Если задан — используется в первую очередь, бесплатно, без ключа.</span>
              </div>
              <div className="flex items-start gap-2">
                <code className="text-ink-secondary bg-bg-raised px-1.5 py-0.5 rounded flex-shrink-0">G4F_MODEL</code>
                <span>Модель g4f (по умолчанию <code className="bg-bg-raised px-1 rounded">gpt-4o-mini</code>).</span>
              </div>
              <div className="flex items-start gap-2">
                <code className="text-ink-secondary bg-bg-raised px-1.5 py-0.5 rounded flex-shrink-0">GROQ_API_KEY</code>
                <span>Ключ Groq (LLaMA 3.3 70B). Используется если G4F недоступен. STT (расшифровка голоса) <span className="text-ink-secondary">всегда</span> через Groq Whisper.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
