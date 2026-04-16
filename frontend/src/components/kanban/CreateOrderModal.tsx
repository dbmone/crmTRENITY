import { useRef, useState } from "react";
import { X, Plus, Paperclip, Trash2 } from "lucide-react";
import { useOrdersStore } from "../../store/orders.store";
import * as api from "../../api/client";

interface Props { isOpen: boolean; onClose: () => void; }

const inputCls = "w-full px-3.5 py-2.5 rounded-lg border border-bg-border bg-bg-raised text-sm text-ink-primary placeholder-ink-tertiary outline-none focus:border-green-500/50 focus:bg-bg-hover transition-colors";

export default function CreateOrderModal({ isOpen, onClose }: Props) {
  const [title,       setTitle]       = useState("");
  const [description, setDescription] = useState("");
  const [deadline,    setDeadline]    = useState("");
  const [reminderDays,setReminderDays]= useState(2);
  const [tzFiles,      setTzFiles]      = useState<File[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createOrder = useOrdersStore((s) => s.createOrder);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!title.trim()) { setError("Введите название заказа"); return; }
    setLoading(true); setError("");
    try {
      const order = await createOrder({
        title: title.trim(),
        description: description.trim() || undefined,
        deadline: deadline || undefined,
        reminderDays
      });

      let failedUploads = 0;
      for (const file of tzFiles) {
        try {
          await api.uploadFile(order.id, file, "TZ");
        } catch {
          failedUploads += 1;
        }
      }

      setTitle(""); setDescription(""); setDeadline(""); setReminderDays(2); setTzFiles([]);
      onClose();
      if (failedUploads > 0) {
        alert(`Заказ создан, но ${failedUploads} файл(ов) ТЗ не загрузились`);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || "Ошибка при создании");
    } finally { setLoading(false); }
  };

  const handlePickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setTzFiles((prev) => [...prev, ...files]);
    e.target.value = "";
  };

  const handleRemoveFile = (index: number) => {
    setTzFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-bg-surface border border-bg-border rounded-modal shadow-modal w-full max-w-lg mx-4 p-6 animate-modal">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-ink-primary flex items-center gap-2">
            <Plus size={16} className="text-green-400" /> Новый заказ
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-raised text-ink-tertiary hover:text-ink-primary transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-ink-tertiary mb-1.5 block">Название *</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="Например: Рилс для Ozon — весенняя коллекция"
              className={inputCls} autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-ink-tertiary mb-1.5 block">ТЗ / Описание</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Стиль, хронометраж, референсы, пожелания..."
              rows={4} className={`${inputCls} resize-none`}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-ink-tertiary block">Файлы к ТЗ</label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-bg-border text-ink-secondary hover:bg-bg-raised transition-colors"
              >
                <Paperclip size={12} />
                Прикрепить
              </button>
            </div>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handlePickFiles} />

            {tzFiles.length > 0 ? (
              <div className="space-y-2">
                {tzFiles.map((file, index) => (
                  <div key={`${file.name}-${file.size}-${index}`} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-bg-raised border border-bg-border">
                    <div className="min-w-0">
                      <p className="text-sm text-ink-primary truncate">{file.name}</p>
                      <p className="text-[10px] text-ink-tertiary">
                        {file.size > 1048576 ? `${(file.size / 1048576).toFixed(1)} МБ` : `${Math.max(1, Math.round(file.size / 1024))} КБ`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveFile(index)}
                      className="p-1.5 rounded-lg text-ink-tertiary hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-3 py-2.5 rounded-lg border border-dashed border-bg-border text-xs text-ink-tertiary">
                Эти файлы сразу попадут во вкладку ТЗ
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-ink-tertiary mb-1.5 block">Дедлайн</label>
              <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)}
                min={new Date().toISOString().split("T")[0]} className={inputCls}
                style={{ colorScheme: "dark" }}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-tertiary mb-1.5 block">Напоминание</label>
              <select value={reminderDays} onChange={(e) => setReminderDays(Number(e.target.value))} className={inputCls}>
                <option value={1}>Каждый день</option>
                <option value={2}>Каждые 2 дня</option>
                <option value={3}>Каждые 3 дня</option>
              </select>
            </div>
          </div>

          {error && <p className="text-sm text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-lg border border-bg-border text-sm font-medium text-ink-secondary hover:bg-bg-raised transition-colors">
              Отмена
            </button>
            <button onClick={handleSubmit} disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-lg bg-green-500 text-black text-sm font-bold hover:bg-green-400 transition-colors disabled:opacity-50">
              {loading ? "Создаю..." : "Создать заказ"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
