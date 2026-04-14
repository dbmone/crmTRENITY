import { useEffect, useState } from "react";
import { X, Clock, FileText, Paperclip, Download, Trash2, UserPlus } from "lucide-react";
import { Order, STAGE_LABELS, User } from "../../types";
import StageProgress from "../order/StageProgress";
import { useAuthStore } from "../../store/auth.store";
import { useOrdersStore } from "../../store/orders.store";
import * as api from "../../api/client";

interface Props {
  order: Order | null;
  onClose: () => void;
}

export default function OrderDetailModal({ order, onClose }: Props) {
  const user = useAuthStore((s) => s.user);
  const fetchOrders = useOrdersStore((s) => s.fetchOrders);
  const [fullOrder, setFullOrder] = useState<Order | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!order) return;
    loadOrder();
    loadUsers();
  }, [order?.id]);

  const loadOrder = async () => {
    if (!order) return;
    const data = await api.getOrder(order.id);
    setFullOrder(data);
  };

  const loadUsers = async () => {
    const data = await api.getUsers();
    setUsers(data);
  };

  if (!order) return null;
  const o = fullOrder || order;

  const isMarketer = user?.role === "MARKETER" || user?.role === "ADMIN";
  const canApprove = isMarketer || user?.role === "LEAD_CREATOR";

  const handleStageUpdate = async (stageId: string, status: string) => {
    setLoading(true);
    try {
      await api.updateStage(o.id, stageId, status);
      await loadOrder();
      await fetchOrders();
    } catch (err: any) {
      alert(err.response?.data?.error || "Ошибка");
    }
    setLoading(false);
  };

  const handleAddCreator = async (creatorId: string) => {
    try {
      await api.addCreator(o.id, creatorId);
      await loadOrder();
      await fetchOrders();
    } catch (err: any) {
      alert(err.response?.data?.error || "Ошибка");
    }
  };

  const handleRemoveCreator = async (creatorId: string) => {
    try {
      await api.removeCreator(o.id, creatorId);
      await loadOrder();
      await fetchOrders();
    } catch (err: any) {
      alert(err.response?.data?.error || "Ошибка");
    }
  };

  const handleDelete = async () => {
    if (!confirm("Удалить заказ?")) return;
    await useOrdersStore.getState().removeOrder(o.id);
    onClose();
  };

  const daysLeft = o.deadline
    ? Math.ceil((new Date(o.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  // Креаторы которых можно добавить
  const availableCreators = users.filter(
    (u) =>
      (u.role === "CREATOR" || u.role === "LEAD_CREATOR") &&
      !o.creators?.some((c) => c.creatorId === u.id)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 pb-6 overflow-y-auto">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex-1 pr-4">
            <h2 className="text-lg font-semibold text-ink-primary">{o.title}</h2>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-600 font-medium">
                @{o.marketer.telegramUsername || o.marketer.displayName}
              </span>
              {daysLeft !== null && (
                <span className={`flex items-center gap-1 text-xs font-medium ${
                  daysLeft < 0 ? "text-red-500" : daysLeft <= 2 ? "text-amber-600" : "text-ink-tertiary"
                }`}>
                  <Clock size={12} />
                  {daysLeft < 0 ? `Просрочено ${Math.abs(daysLeft)} дн.` :
                   daysLeft === 0 ? "Сегодня!" :
                   `${daysLeft} дн. до дедлайна`}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isMarketer && o.marketerId === user?.id && (
              <button onClick={handleDelete} className="p-1.5 rounded-lg hover:bg-red-50 text-ink-tertiary hover:text-red-500">
                <Trash2 size={16} />
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-secondary text-ink-tertiary">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Description */}
        {o.description && (
          <div className="mb-5 p-3.5 bg-surface-secondary rounded-xl">
            <p className="text-xs font-medium text-ink-tertiary mb-1">ТЗ</p>
            <p className="text-sm text-ink-primary whitespace-pre-wrap">{o.description}</p>
          </div>
        )}

        {/* Stages */}
        <div className="mb-5">
          <h3 className="text-sm font-medium text-ink-primary mb-3">Этапы</h3>
          {o.stages && <StageProgress stages={o.stages} />}

          <div className="mt-3 space-y-2">
            {o.stages?.sort((a, b) => a.sortOrder - b.sortOrder).map((stage) => (
              <div key={stage.id} className="flex items-center justify-between p-2.5 rounded-lg bg-surface-secondary">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    stage.status === "DONE" ? "bg-stage-done" :
                    stage.status === "IN_PROGRESS" ? "bg-stage-progress" : "bg-stage-pending"
                  }`} />
                  <span className="text-sm text-ink-primary">{STAGE_LABELS[stage.name]}</span>
                </div>
                <div className="flex gap-1.5">
                  {stage.status === "PENDING" && (
                    <button
                      onClick={() => handleStageUpdate(stage.id, "IN_PROGRESS")}
                      disabled={loading}
                      className="text-xs px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 font-medium"
                    >
                      Начать
                    </button>
                  )}
                  {stage.status === "IN_PROGRESS" && (
                    <button
                      onClick={() => handleStageUpdate(stage.id, "DONE")}
                      disabled={loading || (stage.name === "REVIEW" && !canApprove)}
                      className="text-xs px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium disabled:opacity-40"
                      title={stage.name === "REVIEW" && !canApprove ? "Только маркетолог или главный креатор может утвердить" : ""}
                    >
                      {stage.name === "REVIEW" ? "Утвердить" : "Готово"}
                    </button>
                  )}
                  {stage.status === "DONE" && (
                    <span className="text-xs px-2.5 py-1 text-emerald-600">✓</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Creators */}
        <div className="mb-5">
          <h3 className="text-sm font-medium text-ink-primary mb-3">Креаторы</h3>
          <div className="space-y-2">
            {o.creators?.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-2.5 rounded-lg bg-surface-secondary">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-[10px] font-semibold text-brand-600">
                    {c.creator.displayName.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                  </div>
                  <div>
                    <span className="text-sm text-ink-primary">{c.creator.displayName}</span>
                    {c.isLead && <span className="text-xs text-amber-600 ml-1.5">⭐ лид</span>}
                  </div>
                </div>
                {(isMarketer || c.addedById === user?.id) && (
                  <button
                    onClick={() => handleRemoveCreator(c.creatorId)}
                    className="text-xs text-ink-tertiary hover:text-red-500"
                  >
                    Убрать
                  </button>
                )}
              </div>
            ))}

            {/* Add creator */}
            {availableCreators.length > 0 && (
              <div className="flex items-center gap-2 pt-1">
                <UserPlus size={14} className="text-ink-tertiary" />
                <select
                  onChange={(e) => {
                    if (e.target.value) handleAddCreator(e.target.value);
                    e.target.value = "";
                  }}
                  className="text-sm text-ink-secondary bg-transparent border-none outline-none cursor-pointer"
                  defaultValue=""
                >
                  <option value="" disabled>Добавить креатора...</option>
                  {availableCreators.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName} (@{u.telegramUsername})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Files */}
        {o.files && o.files.length > 0 && (
          <div className="mb-5">
            <h3 className="text-sm font-medium text-ink-primary mb-3">Файлы</h3>
            <div className="space-y-1.5">
              {o.files.map((f) => (
                <div key={f.id} className="flex items-center justify-between p-2.5 rounded-lg bg-surface-secondary">
                  <div className="flex items-center gap-2">
                    <Paperclip size={13} className="text-ink-tertiary" />
                    <span className="text-sm text-ink-primary">{f.fileName}</span>
                    <span className="text-xs text-ink-tertiary">{f.fileType}</span>
                  </div>
                  <button
                    onClick={async () => {
                      const url = await api.getDownloadUrl(f.id);
                      window.open(url, "_blank");
                    }}
                    className="p-1 hover:bg-white rounded"
                  >
                    <Download size={14} className="text-ink-tertiary" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reports */}
        {o.reports && o.reports.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-ink-primary mb-3">Отчёты</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {o.reports.map((r) => (
                <div key={r.id} className="p-3 rounded-lg bg-surface-secondary">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-ink-secondary">{r.creator.displayName}</span>
                    <span className="text-xs text-ink-tertiary">
                      {new Date(r.reportDate).toLocaleDateString("ru-RU")}
                    </span>
                  </div>
                  <p className="text-sm text-ink-primary">{r.reportText}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
