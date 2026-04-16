import { useEffect, useRef, useState } from "react";
import Header from "../components/layout/Header";
import * as api from "../api/client";
import { Task, TaskPriority, TaskSubtask, ParsedTask } from "../types";
import {
  Plus, Trash2, ChevronDown, ChevronRight, Check, X, Mic, Square,
  Loader2, Sparkles, Flag, Calendar, Edit2,
} from "lucide-react";

// ─── Константы ────────────────────────────────────────────────

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  LOW:    "text-ink-tertiary bg-bg-raised border-bg-border",
  MEDIUM: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  HIGH:   "text-red-400 bg-red-400/10 border-red-400/20",
};
const PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: "Низкий", MEDIUM: "Средний", HIGH: "Высокий",
};

const STATUS_GROUPS: { status: Task["status"]; label: string; color: string }[] = [
  { status: "TODO",        label: "К выполнению",  color: "text-ink-tertiary" },
  { status: "IN_PROGRESS", label: "В работе",       color: "text-amber-400" },
  { status: "DONE",        label: "Выполнено",      color: "text-green-400" },
];

const inputCls = "w-full px-3 py-2 rounded-lg border border-bg-border bg-bg-raised text-sm text-ink-primary placeholder-ink-tertiary outline-none focus:border-green-500/50 transition-colors";

// ─── Хук записи голоса ────────────────────────────────────────

function useVoiceRecorder(onResult: (blob: Blob, ext: string) => void) {
  const [recording, setRecording] = useState(false);
  const mrRef     = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mrRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType });
        const ext  = mr.mimeType.includes("webm") ? "webm" : mr.mimeType.includes("ogg") ? "ogg" : "mp4";
        onResult(blob, ext);
      };
      mr.start();
      setRecording(true);
    } catch {
      alert("Нет доступа к микрофону. Разрешите доступ в настройках браузера.");
    }
  };

  const stop = () => { mrRef.current?.stop(); setRecording(false); };

  return { recording, start, stop };
}

// ─── Модалка превью AI-парсинга ───────────────────────────────

interface PreviewModalProps {
  parsed: ParsedTask;
  onConfirm: (data: { title: string; description: string; priority: TaskPriority; subtasks: string[] }) => void;
  onClose: () => void;
}

function VoicePreviewModal({ parsed, onConfirm, onClose }: PreviewModalProps) {
  const [title,    setTitle]    = useState(parsed.title);
  const [desc,     setDesc]     = useState(parsed.description || "");
  const [priority, setPriority] = useState<TaskPriority>(parsed.priority);
  const [subtasks, setSubtasks] = useState<string[]>(parsed.subtasks);
  const [newSub,   setNewSub]   = useState("");

  const addSub = () => {
    if (!newSub.trim()) return;
    setSubtasks((p) => [...p, newSub.trim()]);
    setNewSub("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-bg-surface border border-bg-border rounded-modal shadow-modal w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-amber-400" />
              <span className="text-sm font-semibold text-ink-primary">AI-расшифровка</span>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-raised text-ink-tertiary">
              <X size={16} />
            </button>
          </div>

          {/* Raw text */}
          <div className="mb-4 p-3 bg-bg-raised border border-bg-border rounded-lg">
            <p className="text-[10px] font-semibold text-ink-tertiary uppercase tracking-wide mb-1">Распознанный текст</p>
            <p className="text-xs text-ink-secondary italic leading-relaxed">{parsed.rawText}</p>
          </div>

          {/* Title */}
          <div className="mb-3">
            <label className="block text-[11px] font-semibold text-ink-tertiary uppercase tracking-wide mb-1.5">Название задачи</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
          </div>

          {/* Description */}
          <div className="mb-3">
            <label className="block text-[11px] font-semibold text-ink-tertiary uppercase tracking-wide mb-1.5">Описание</label>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2}
              className={`${inputCls} resize-none`} placeholder="Необязательно..." />
          </div>

          {/* Priority */}
          <div className="mb-4">
            <label className="block text-[11px] font-semibold text-ink-tertiary uppercase tracking-wide mb-1.5">Приоритет</label>
            <div className="flex gap-2">
              {(["LOW", "MEDIUM", "HIGH"] as TaskPriority[]).map((p) => (
                <button key={p} onClick={() => setPriority(p)}
                  className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    priority === p ? PRIORITY_COLORS[p] + " ring-1 ring-current/30" : "border-bg-border text-ink-tertiary hover:border-bg-hover"
                  }`}>
                  {PRIORITY_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          {/* Subtasks */}
          <div className="mb-5">
            <label className="block text-[11px] font-semibold text-ink-tertiary uppercase tracking-wide mb-1.5">
              Подзадачи ({subtasks.length})
            </label>
            <div className="space-y-1.5 mb-2">
              {subtasks.map((s, i) => (
                <div key={i} className="flex items-center gap-2 p-2 bg-bg-raised border border-bg-border rounded-lg">
                  <span className="w-4 h-4 rounded border border-bg-border flex-shrink-0" />
                  <span className="flex-1 text-sm text-ink-primary">{s}</span>
                  <button onClick={() => setSubtasks((p) => p.filter((_, j) => j !== i))}
                    className="text-ink-tertiary hover:text-red-400 transition-colors">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={newSub} onChange={(e) => setNewSub(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addSub()}
                placeholder="Добавить подзадачу..." className={`${inputCls} flex-1`} />
              <button onClick={addSub} disabled={!newSub.trim()}
                className="px-3 py-2 rounded-lg bg-bg-raised border border-bg-border text-ink-secondary hover:text-ink-primary disabled:opacity-30 transition-colors">
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-2">
            <button onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-bg-border text-sm text-ink-secondary hover:bg-bg-raised transition-colors">
              Отмена
            </button>
            <button
              onClick={() => onConfirm({ title: title.trim(), description: desc.trim(), priority, subtasks })}
              disabled={!title.trim()}
              className="flex-1 py-2 rounded-lg bg-green-500 text-black text-sm font-bold hover:bg-green-400 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
              <Plus size={14} /> Создать задачу
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Строка задачи ────────────────────────────────────────────

interface TaskRowProps {
  task: Task;
  onUpdate: (id: string, data: Partial<Task>) => void;
  onDelete: (id: string) => void;
  onSubtaskToggle: (taskId: string, subId: string, done: boolean) => void;
  onSubtaskAdd: (taskId: string, title: string) => void;
  onSubtaskDelete: (taskId: string, subId: string) => void;
}

function TaskRow({ task, onUpdate, onDelete, onSubtaskToggle, onSubtaskAdd, onSubtaskDelete }: TaskRowProps) {
  const [expanded,  setExpanded]  = useState(false);
  const [editing,   setEditing]   = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [newSubTxt, setNewSubTxt] = useState("");

  const doneSubs  = task.subtasks.filter((s) => s.done).length;
  const totalSubs = task.subtasks.length;
  const isDone    = task.status === "DONE";

  const nextStatus = () => {
    const cycle: Record<Task["status"], Task["status"]> = {
      TODO: "IN_PROGRESS", IN_PROGRESS: "DONE", DONE: "TODO",
    };
    onUpdate(task.id, { status: cycle[task.status] });
  };

  const saveTitle = () => {
    if (editTitle.trim() && editTitle !== task.title) onUpdate(task.id, { title: editTitle.trim() });
    setEditing(false);
  };

  const addSub = () => {
    if (!newSubTxt.trim()) return;
    onSubtaskAdd(task.id, newSubTxt.trim());
    setNewSubTxt("");
  };

  return (
    <div className={`group bg-bg-raised border rounded-xl transition-all ${
      isDone ? "border-bg-border opacity-60" : "border-bg-border hover:border-bg-hover"
    }`}>
      {/* Main row */}
      <div className="flex items-start gap-3 p-3">
        {/* Status toggle */}
        <button
          onClick={nextStatus}
          title={isDone ? "Снять выполнение" : task.status === "IN_PROGRESS" ? "Завершить" : "Начать"}
          className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 transition-all flex items-center justify-center ${
            isDone
              ? "bg-green-500 border-green-500"
              : task.status === "IN_PROGRESS"
              ? "border-amber-400 bg-amber-400/10"
              : "border-bg-border hover:border-green-500/50"
          }`}
        >
          {isDone && <Check size={11} strokeWidth={3} className="text-black" />}
          {task.status === "IN_PROGRESS" && <div className="w-2 h-2 rounded-full bg-amber-400" />}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") { setEditing(false); setEditTitle(task.title); } }}
              autoFocus
              className="w-full bg-transparent text-sm text-ink-primary outline-none border-b border-green-500/50"
            />
          ) : (
            <p
              className={`text-sm font-medium leading-snug cursor-pointer ${isDone ? "line-through text-ink-tertiary" : "text-ink-primary"}`}
              onClick={() => setExpanded((v) => !v)}
            >
              {task.title}
              {task.aiGenerated && <span className="ml-1.5 text-[9px] text-amber-400 opacity-70">✨ AI</span>}
            </p>
          )}

          {/* Meta */}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${PRIORITY_COLORS[task.priority]}`}>
              {PRIORITY_LABELS[task.priority]}
            </span>
            {task.dueDate && (
              <span className="flex items-center gap-0.5 text-[10px] text-ink-tertiary">
                <Calendar size={9} />
                {new Date(task.dueDate).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
              </span>
            )}
            {totalSubs > 0 && (
              <button onClick={() => setExpanded((v) => !v)}
                className="flex items-center gap-0.5 text-[10px] text-ink-tertiary hover:text-ink-primary transition-colors">
                {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                {doneSubs}/{totalSubs} подзадач
              </button>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button onClick={() => { setEditing(true); setExpanded(true); }}
            className="p-1.5 rounded-lg hover:bg-bg-hover text-ink-tertiary hover:text-ink-primary transition-colors">
            <Edit2 size={12} />
          </button>
          <button onClick={() => onDelete(task.id)}
            className="p-1.5 rounded-lg hover:bg-red-400/10 text-ink-tertiary hover:text-red-400 transition-colors">
            <Trash2 size={12} />
          </button>
          <button onClick={() => setExpanded((v) => !v)}
            className="p-1.5 rounded-lg hover:bg-bg-hover text-ink-tertiary hover:text-ink-primary transition-colors">
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        </div>
      </div>

      {/* Subtasks */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-bg-border pt-2.5 mt-0 space-y-1.5">
          {task.subtasks.map((sub) => (
            <div key={sub.id} className="flex items-center gap-2 group/sub">
              <button
                onClick={() => onSubtaskToggle(task.id, sub.id, !sub.done)}
                className={`flex-shrink-0 w-4 h-4 rounded border transition-all flex items-center justify-center ${
                  sub.done ? "bg-green-500 border-green-500" : "border-bg-border hover:border-green-500/50"
                }`}
              >
                {sub.done && <Check size={9} strokeWidth={3} className="text-black" />}
              </button>
              <span className={`flex-1 text-sm ${sub.done ? "line-through text-ink-tertiary" : "text-ink-secondary"}`}>
                {sub.title}
              </span>
              <button onClick={() => onSubtaskDelete(task.id, sub.id)}
                className="opacity-0 group-hover/sub:opacity-100 p-0.5 text-ink-tertiary hover:text-red-400 transition-all">
                <X size={11} />
              </button>
            </div>
          ))}

          {/* Add subtask */}
          <div className="flex gap-2 mt-2">
            <input
              value={newSubTxt}
              onChange={(e) => setNewSubTxt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addSub()}
              placeholder="Добавить подзадачу..."
              className="flex-1 text-xs bg-transparent border-b border-bg-border text-ink-secondary placeholder-ink-muted outline-none focus:border-green-500/40 py-1 transition-colors"
            />
            <button onClick={addSub} disabled={!newSubTxt.trim()}
              className="text-xs text-green-400 hover:text-green-300 disabled:opacity-30 transition-colors">
              +
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Главная страница ─────────────────────────────────────────

export default function TasksPage() {
  const [tasks,       setTasks]       = useState<Task[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [parsed,      setParsed]      = useState<ParsedTask | null>(null);
  const [parsing,     setParsing]     = useState(false);
  const [showAdd,     setShowAdd]     = useState(false);
  const [newTitle,    setNewTitle]    = useState("");
  const [newPriority, setNewPriority] = useState<TaskPriority>("MEDIUM");

  const voice = useVoiceRecorder(async (blob, ext) => {
    setParsing(true);
    try {
      const result = await api.parseVoiceTask(blob, ext);
      setParsed(result);
    } catch (e: any) {
      alert(e.response?.data?.message || e.response?.data?.error || "Ошибка расшифровки. Проверьте GROQ_API_KEY.");
    } finally {
      setParsing(false);
    }
  });

  const load = async () => {
    try { setTasks(await api.getTasks()); }
    catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // ── Handlers ──

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    try {
      const t = await api.createTask({ title: newTitle.trim(), priority: newPriority });
      setTasks((p) => [t, ...p]);
      setNewTitle(""); setShowAdd(false);
    } catch {}
  };

  const handleVoiceConfirm = async (data: { title: string; description: string; priority: TaskPriority; subtasks: string[] }) => {
    try {
      const t = await api.createTask({ ...data, aiGenerated: true });
      setTasks((p) => [t, ...p]);
      setParsed(null);
    } catch {}
  };

  const handleUpdate = async (id: string, data: Partial<Task>) => {
    try {
      const t = await api.updateTask(id, data as any);
      setTasks((p) => p.map((x) => x.id === id ? t : x));
    } catch {}
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Удалить задачу?")) return;
    try {
      await api.deleteTask(id);
      setTasks((p) => p.filter((x) => x.id !== id));
    } catch {}
  };

  const handleSubtaskToggle = async (taskId: string, subId: string, done: boolean) => {
    try {
      const sub = await api.toggleSubtask(taskId, subId, done);
      setTasks((p) => p.map((t) => t.id === taskId
        ? { ...t, subtasks: t.subtasks.map((s) => s.id === subId ? sub : s) }
        : t
      ));
    } catch {}
  };

  const handleSubtaskAdd = async (taskId: string, title: string) => {
    try {
      const sub = await api.addSubtask(taskId, title);
      setTasks((p) => p.map((t) => t.id === taskId
        ? { ...t, subtasks: [...t.subtasks, sub] }
        : t
      ));
    } catch {}
  };

  const handleSubtaskDelete = async (taskId: string, subId: string) => {
    try {
      await api.deleteSubtask(taskId, subId);
      setTasks((p) => p.map((t) => t.id === taskId
        ? { ...t, subtasks: t.subtasks.filter((s) => s.id !== subId) }
        : t
      ));
    } catch {}
  };

  const grouped = STATUS_GROUPS.map((g) => ({
    ...g,
    items: tasks.filter((t) => t.status === g.status),
  }));

  const totalDone = tasks.filter((t) => t.status === "DONE").length;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-bg-base">
      <Header />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6" data-tour="tasks-page">

          {/* Page header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-bold text-ink-primary">Мои задачи</h1>
              {tasks.length > 0 && (
                <p className="text-sm text-ink-tertiary mt-0.5">
                  {totalDone} из {tasks.length} выполнено
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Voice button */}
              {parsing ? (
                <button disabled className="flex items-center gap-2 px-3 py-2 rounded-xl border border-bg-border text-ink-tertiary text-sm opacity-70">
                  <Loader2 size={14} className="animate-spin" />
                  Анализирую...
                </button>
              ) : voice.recording ? (
                <button onClick={voice.stop}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border border-red-500/40 text-red-400 bg-red-500/10 text-sm animate-pulse">
                  <Square size={12} fill="currentColor" />
                  Стоп
                </button>
              ) : (
                <button data-tour="tasks-voice" onClick={voice.start}
                  title="Надиктовать задачу — AI разберёт на подзадачи"
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border border-bg-border text-ink-secondary text-sm hover:border-amber-400/30 hover:text-amber-400 transition-colors">
                  <Mic size={14} />
                  Голос
                  <Sparkles size={11} className="text-amber-400 opacity-70" />
                </button>
              )}

              {/* Add button */}
              <button data-tour="tasks-add" onClick={() => setShowAdd((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-500 text-black text-sm font-bold hover:bg-green-400 transition-colors">
                <Plus size={14} />
                Задача
              </button>
            </div>
          </div>

          {/* Quick add */}
          {showAdd && (
            <div className="mb-5 p-4 bg-bg-surface border border-bg-border rounded-xl animate-modal">
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setShowAdd(false); }}
                placeholder="Название задачи..."
                autoFocus
                className={inputCls + " mb-3"}
              />
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5 flex-1">
                  {(["LOW", "MEDIUM", "HIGH"] as TaskPriority[]).map((p) => (
                    <button key={p} onClick={() => setNewPriority(p)}
                      className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
                        newPriority === p ? PRIORITY_COLORS[p] : "border-bg-border text-ink-tertiary hover:border-bg-hover"
                      }`}>
                      {PRIORITY_LABELS[p]}
                    </button>
                  ))}
                </div>
                <button onClick={() => setShowAdd(false)}
                  className="p-1.5 rounded-lg text-ink-tertiary hover:text-ink-primary transition-colors">
                  <X size={14} />
                </button>
                <button onClick={handleCreate} disabled={!newTitle.trim()}
                  className="px-3 py-1.5 rounded-lg bg-green-500 text-black text-sm font-bold hover:bg-green-400 disabled:opacity-50 transition-colors">
                  Добавить
                </button>
              </div>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="text-center py-12 text-ink-tertiary">
              <Loader2 size={24} className="mx-auto animate-spin mb-2" />
            </div>
          )}

          {/* Empty */}
          {!loading && tasks.length === 0 && (
            <div className="text-center py-16 text-ink-tertiary">
              <Flag size={32} className="mx-auto mb-3 opacity-20" />
              <p className="text-base font-medium mb-1">Задач нет</p>
              <p className="text-sm">Добавьте задачу вручную или надиктуйте голосом</p>
              <p className="text-xs mt-2 text-amber-400 opacity-70">✨ AI разберёт голосовое на подзадачи</p>
            </div>
          )}

          {/* Groups */}
          {!loading && tasks.length > 0 && grouped.map((g) => {
            if (g.items.length === 0) return null;
            return (
              <div key={g.status} className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-xs font-semibold uppercase tracking-wider ${g.color}`}>{g.label}</span>
                  <span className="text-xs text-ink-tertiary">({g.items.length})</span>
                </div>
                <div className="space-y-2">
                  {g.items.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      onUpdate={handleUpdate}
                      onDelete={handleDelete}
                      onSubtaskToggle={handleSubtaskToggle}
                      onSubtaskAdd={handleSubtaskAdd}
                      onSubtaskDelete={handleSubtaskDelete}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* AI preview modal */}
      {parsed && (
        <VoicePreviewModal
          parsed={parsed}
          onConfirm={handleVoiceConfirm}
          onClose={() => setParsed(null)}
        />
      )}
    </div>
  );
}
