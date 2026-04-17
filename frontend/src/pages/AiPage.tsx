import { useEffect, useState } from "react";
import { Bot, RotateCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import * as api from "../api/client";
import { useAuthStore } from "../store/auth.store";

function PromptEditor({
  settingKey,
  title,
  description,
  jsonOutput,
  tourTarget,
}: {
  settingKey: string;
  title: string;
  description: React.ReactNode;
  jsonOutput?: boolean;
  tourTarget?: string;
}) {
  const [prompt, setPrompt] = useState("");
  const [original, setOriginal] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const settings = await api.getSettings();
        const value = settings[settingKey] ?? "";
        setPrompt(value);
        setOriginal(value);
      } catch {
        // noop
      }
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
    } catch (e: any) {
      alert(e.response?.data?.error || "Ошибка");
    }
    setSaving(false);
  };

  const reset = async () => {
    if (!confirm("Сбросить к значению по умолчанию?")) return;
    setResetting(true);
    try {
      const result = await api.resetSetting(settingKey);
      setPrompt(result.value);
      setOriginal(result.value);
    } catch (e: any) {
      alert(e.response?.data?.error || "Ошибка");
    }
    setResetting(false);
  };

  const isDirty = prompt !== original;

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <div className="h-6 w-6 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div data-tour={tourTarget} className="rounded-xl border border-bg-border bg-bg-surface p-5 animate-fade-in">
      <div className="mb-1 flex items-start justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-primary">
          <Bot size={14} className="text-purple-400" />
          {title}
        </h3>
        <button
          onClick={reset}
          disabled={resetting}
          title="Сбросить к умолчанию"
          className="flex items-center gap-1 text-xs text-ink-tertiary transition-colors hover:text-ink-primary disabled:opacity-40"
        >
          <RotateCw size={12} className={resetting ? "animate-spin" : ""} />
          Сбросить
        </button>
      </div>
      <p className="mb-3 text-xs text-ink-tertiary">{description}</p>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={14}
        className="w-full resize-y rounded-lg border border-bg-border bg-bg-raised px-3.5 py-2.5 font-mono text-sm text-ink-primary outline-none transition-colors placeholder-ink-tertiary focus:border-purple-500/50"
      />

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xs">
          {prompt.includes("{{TEXT}}") ? (
            <span className="text-green-400">✓ Содержит {"{{TEXT}}"}</span>
          ) : (
            <span className="text-amber-400">⚠ Нет {"{{TEXT}}"} — голос не подставится</span>
          )}
          {jsonOutput && !prompt.toLowerCase().includes("json") && (
            <span className="ml-2 text-amber-400">⚠ Напомни LLM вернуть JSON</span>
          )}
        </span>

        <div className="flex items-center gap-2">
          {saved && <span className="text-xs text-green-400">Сохранено</span>}
          <button
            onClick={save}
            disabled={saving || !isDirty || !prompt.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-purple-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-purple-400 disabled:opacity-50"
          >
            {saving && <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />}
            {saving ? "Сохраняю..." : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AiPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  const canAccess = user?.role === "ADMIN" || user?.role === "HEAD_CREATOR" || user?.role === "HEAD_MARKETER";

  useEffect(() => {
    if (!canAccess) navigate("/");
  }, [canAccess, navigate]);

  if (!canAccess) return null;

  return (
    <div className="min-h-full bg-bg-base">
      <div className="mx-auto max-w-3xl px-6 py-8 content-ready" data-tour="ai-page">
        <div className="mb-6">
          <h1 className="flex items-center gap-2 text-xl font-bold text-ink-primary">
            <Bot size={20} className="text-purple-400" />
            AI-настройки
          </h1>
          <p className="mt-1 text-sm text-ink-tertiary">
            Промпты для структурирования голосовых записей через LLM
          </p>
        </div>

        <div className="space-y-6">
          <PromptEditor
            settingKey="task_parse_prompt"
            tourTarget="ai-task-prompt"
            title="Голос -> Личная задача"
            description={
              <>
                Используется на странице <span className="text-ink-secondary">Задачи</span> при записи голоса.
                Подставь <code className="rounded bg-bg-raised px-1 text-purple-300">{"{{TEXT}}"}</code> — туда попадёт расшифровка.
                LLM должна вернуть JSON:{" "}
                <code className="rounded bg-bg-raised px-1 text-ink-secondary">title, description, priority, subtasks[]</code>.
              </>
            }
            jsonOutput
          />

          <PromptEditor
            settingKey="tz_structure_prompt"
            tourTarget="ai-tz-prompt"
            title="Голос -> Структурированное ТЗ"
            description={
              <>
                Используется в кнопке <span className="text-ink-secondary">Голос -&gt; ТЗ</span> внутри заказа.
                Подставь <code className="rounded bg-bg-raised px-1 text-purple-300">{"{{TEXT}}"}</code> — туда попадёт расшифровка.
                LLM должна вернуть форматированный текст, а не JSON.
              </>
            }
          />

          <div className="rounded-xl border border-bg-border bg-bg-surface p-5 animate-fade-in">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-primary">
              <Bot size={14} className="text-ink-tertiary" />
              Провайдер LLM (переменные окружения)
            </h3>

            <div className="space-y-2 text-xs text-ink-tertiary">
              <div className="flex items-start gap-2">
                <code className="flex-shrink-0 rounded bg-bg-raised px-1.5 py-0.5 text-ink-secondary">G4F_API_URL</code>
                <span>
                  URL gpt4free Docker-сервиса, например{" "}
                  <code className="rounded bg-bg-raised px-1">http://g4f:1337</code>. Если задан — используется в первую очередь, бесплатно и без ключа.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <code className="flex-shrink-0 rounded bg-bg-raised px-1.5 py-0.5 text-ink-secondary">G4F_MODEL</code>
                <span>
                  Модель g4f, по умолчанию <code className="rounded bg-bg-raised px-1">gpt-4o-mini</code>.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <code className="flex-shrink-0 rounded bg-bg-raised px-1.5 py-0.5 text-ink-secondary">GROQ_API_KEY</code>
                <span>Ключ Groq для LLaMA 3.3 70B. Используется, если G4F недоступен. Расшифровка голоса всегда идёт через Groq Whisper.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
