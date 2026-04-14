import { useState } from "react";
import { X } from "lucide-react";
import { useOrdersStore } from "../../store/orders.store";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function CreateOrderModal({ isOpen, onClose }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [reminderDays, setReminderDays] = useState(2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const createOrder = useOrdersStore((s) => s.createOrder);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError("Введите название заказа");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await createOrder({
        title: title.trim(),
        description: description.trim() || undefined,
        deadline: deadline || undefined,
        reminderDays,
      });
      setTitle("");
      setDescription("");
      setDeadline("");
      setReminderDays(2);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || "Ошибка при создании");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-ink-primary">Новый заказ</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-secondary text-ink-tertiary">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Title */}
          <div>
            <label className="text-sm text-ink-secondary mb-1 block">Название *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например: Рилс для Ozon"
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-50"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-sm text-ink-secondary mb-1 block">ТЗ / Описание</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Опишите задачу, стиль, хронометраж..."
              rows={4}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-50 resize-none"
            />
          </div>

          {/* Deadline + Reminder */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-ink-secondary mb-1 block">Дедлайн</label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-50"
              />
            </div>
            <div>
              <label className="text-sm text-ink-secondary mb-1 block">Напоминание (дни)</label>
              <select
                value={reminderDays}
                onChange={(e) => setReminderDays(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-50"
              >
                <option value={1}>Каждый день</option>
                <option value={2}>Каждые 2 дня</option>
                <option value={3}>Каждые 3 дня</option>
              </select>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-ink-secondary hover:bg-surface-secondary transition-colors"
            >
              Отмена
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-800 transition-colors disabled:opacity-50"
            >
              {loading ? "Создаю..." : "Создать заказ"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
