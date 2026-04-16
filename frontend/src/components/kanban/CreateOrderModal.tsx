import { useRef, useState } from "react";
import { X, Plus, Paperclip, Trash2 } from "lucide-react";
import { useOrdersStore } from "../../store/orders.store";
import * as api from "../../api/client";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type UploadState = "uploading" | "done" | "error" | "canceled";

type UploadItem = {
  key: string;
  name: string;
  size: number;
  progress: number;
  state: UploadState;
};

const inputCls =
  "w-full px-3.5 py-2.5 rounded-lg border border-bg-border bg-bg-raised text-sm text-ink-primary placeholder-ink-tertiary outline-none focus:border-green-500/50 focus:bg-bg-hover transition-colors";

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} МБ`;
  return `${Math.max(1, Math.round(size / 1024))} КБ`;
}

function makeUploadKey(file: File, index: number) {
  return `${file.name}-${file.size}-${file.lastModified}-${index}`;
}

export default function CreateOrderModal({ isOpen, onClose }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [reminderDays, setReminderDays] = useState(2);
  const [tzFiles, setTzFiles] = useState<File[]>([]);
  const [draggingTz, setDraggingTz] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);

  const createOrder = useOrdersStore((s) => s.createOrder);

  if (!isOpen) return null;

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setDeadline("");
    setReminderDays(2);
    setTzFiles([]);
    setUploadItems([]);
    setError("");
  };

  const appendTzFiles = (files: File[]) => {
    if (!files.length) return;
    setTzFiles((prev) => [...prev, ...files]);
  };

  const updateUploadItem = (key: string, patch: Partial<UploadItem>) => {
    setUploadItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  };

  const startUploadSession = (files: File[]) => {
    const nextItems = files.map((file, index) => ({
      key: makeUploadKey(file, index),
      name: file.name,
      size: file.size,
      progress: 0,
      state: "uploading" as UploadState,
    }));
    setUploadItems(nextItems);
    return nextItems;
  };

  const uploadTzFiles = async (orderId: string, files: File[], signal?: AbortSignal) => {
    if (!files.length) {
      setUploadItems([]);
      return 0;
    }

    const items = startUploadSession(files);
    let failedUploads = 0;

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const item = items[index];

      try {
        await api.uploadFile(orderId, file, "TZ", {
          signal,
          onProgress: (percent) => {
            updateUploadItem(item.key, { progress: percent, state: "uploading" });
          },
        });
        updateUploadItem(item.key, { progress: 100, state: "done" });
      } catch (err) {
        if (api.isRequestCanceled(err)) {
          updateUploadItem(item.key, { state: "canceled" });
          throw err;
        }
        failedUploads += 1;
        updateUploadItem(item.key, { state: "error" });
      }
    }

    return failedUploads;
  };

  const handlePickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    appendTzFiles(Array.from(e.target.files || []));
    e.target.value = "";
  };

  const handleRemoveFile = (index: number) => {
    setTzFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError("Введите название заказа");
      return;
    }

    setLoading(true);
    setError("");

    let orderCreated = false;

    try {
      const controller = new AbortController();
      uploadAbortRef.current = controller;

      const order = await createOrder({
        title: title.trim(),
        description: description.trim() || undefined,
        deadline: deadline || undefined,
        reminderDays,
      });
      orderCreated = true;

      const failedUploads = await uploadTzFiles(order.id, tzFiles, controller.signal);

      resetForm();
      onClose();

      if (failedUploads > 0) {
        alert(`Заказ создан, но ${failedUploads} файл(ов) ТЗ не загрузились`);
      }
    } catch (err: any) {
      if (api.isRequestCanceled(err)) {
        if (orderCreated) {
          alert("Загрузка файлов остановлена. Сам заказ уже создан.");
        }
        resetForm();
        onClose();
      } else {
        setError(err.response?.data?.error || "Ошибка при создании заказа");
      }
    } finally {
      uploadAbortRef.current = null;
      setLoading(false);
    }
  };

  const handleCancelUpload = () => {
    uploadAbortRef.current?.abort();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        data-tour="create-modal"
        className="relative w-full max-w-lg mx-4 rounded-modal border border-bg-border bg-bg-surface p-6 shadow-modal animate-modal"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-bold text-ink-primary">
            <Plus size={16} className="text-green-400" />
            Новый заказ
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-tertiary transition-colors hover:bg-bg-raised hover:text-ink-primary"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-tertiary">Название *</label>
            <input
              type="text"
              data-tour="create-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например: Рилс для Ozon - весенняя коллекция"
              className={inputCls}
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-tertiary">ТЗ / описание</label>
            <textarea
              data-tour="create-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Стиль, хронометраж, референсы, пожелания..."
              rows={4}
              className={`${inputCls} resize-none`}
            />
          </div>

          <div data-tour="create-tz-files">
            <div className="mb-1.5 flex items-center justify-between">
              <label className="block text-xs font-medium text-ink-tertiary">Файлы к ТЗ</label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-bg-border px-2.5 py-1.5 text-xs text-ink-secondary transition-colors hover:bg-bg-raised"
              >
                <Paperclip size={12} />
                Прикрепить
              </button>
            </div>

            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handlePickFiles} />

            <div
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDraggingTz(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDraggingTz(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDraggingTz(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDraggingTz(false);
                appendTzFiles(Array.from(e.dataTransfer.files || []));
              }}
              className={`rounded-xl border border-dashed p-3 transition-colors ${
                draggingTz ? "border-green-500 bg-green-500/10" : "border-bg-border bg-bg-raised/30"
              }`}
            >
              <div className="mb-3 rounded-lg bg-bg-base/50 px-3 py-2 text-xs text-ink-tertiary">
                Перетащи файлы сюда или нажми «Прикрепить». Всё, что загрузишь в эту область, останется во вкладке
                «ТЗ», а не в обычных файлах заказа.
              </div>

              {tzFiles.length > 0 ? (
                <div className="space-y-2">
                  {tzFiles.map((file, index) => (
                    <div
                      key={`${file.name}-${file.size}-${index}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-bg-border bg-bg-raised px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-ink-primary">{file.name}</p>
                        <p className="text-[10px] text-ink-tertiary">{formatFileSize(file.size)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveFile(index)}
                        className="rounded-lg p-1.5 text-ink-tertiary transition-colors hover:bg-red-500/10 hover:text-red-400"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-bg-border px-3 py-6 text-center text-xs text-ink-tertiary">
                  Отпусти файлы здесь, чтобы прикрепить их к ТЗ
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-tertiary">Дедлайн</label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                className={inputCls}
                style={{ colorScheme: "dark" }}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-tertiary">Напоминание</label>
              <select
                value={reminderDays}
                onChange={(e) => setReminderDays(Number(e.target.value))}
                className={inputCls}
              >
                <option value={1}>Каждый день</option>
                <option value={2}>Каждые 2 дня</option>
                <option value={3}>Каждые 3 дня</option>
              </select>
            </div>
          </div>

          {error && <p className="rounded-lg bg-red-400/10 px-3 py-2 text-sm text-red-400">{error}</p>}

          {uploadItems.length > 0 && (
            <div className="rounded-xl border border-bg-border bg-bg-raised/70 p-3">
              <div className="mb-2 flex items-center justify-between gap-3 text-xs text-ink-secondary">
                <span>Загрузка файлов в ТЗ</span>
                {loading && (
                  <button
                    type="button"
                    onClick={handleCancelUpload}
                    className="rounded-md border border-red-500/20 px-2.5 py-1 text-[11px] text-red-400 transition-colors hover:bg-red-500/10"
                  >
                    Отменить загрузку
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {uploadItems.map((item) => (
                  <div key={item.key} className="rounded-lg border border-bg-border bg-bg-surface px-3 py-2">
                    <div className="mb-1 flex items-center justify-between gap-3 text-[11px]">
                      <span className="truncate text-ink-primary">{item.name}</span>
                      <span
                        className={
                          item.state === "error"
                            ? "text-red-400"
                            : item.state === "done"
                              ? "text-green-400"
                              : item.state === "canceled"
                                ? "text-amber-400"
                                : "text-ink-secondary"
                        }
                      >
                        {item.state === "error"
                          ? "Ошибка"
                          : item.state === "done"
                            ? "Готово"
                            : item.state === "canceled"
                              ? "Остановлено"
                              : `${item.progress}%`}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-bg-base">
                      <div
                        className={`h-full rounded-full transition-[width] duration-150 ${
                          item.state === "error"
                            ? "bg-red-400"
                            : item.state === "done"
                              ? "bg-green-500"
                              : item.state === "canceled"
                                ? "bg-amber-400"
                                : "bg-green-500"
                        }`}
                        style={{ width: `${item.state === "error" ? 100 : item.progress}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[10px] text-ink-tertiary">{formatFileSize(item.size)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 rounded-lg border border-bg-border px-4 py-2.5 text-sm font-medium text-ink-secondary transition-colors hover:bg-bg-raised"
            >
              Отмена
            </button>
            <button
              data-tour="create-submit"
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 rounded-lg bg-green-500 px-4 py-2.5 text-sm font-bold text-black transition-colors hover:bg-green-400 disabled:opacity-50"
            >
              {loading ? "Создаю..." : "Создать заказ"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
