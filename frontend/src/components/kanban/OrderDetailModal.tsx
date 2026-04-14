import { useEffect, useRef, useState } from "react";
import { X, Clock, Paperclip, Download, Trash2, UserPlus, Upload, Send, MessageSquare, FileText, Edit2, Check, Calendar } from "lucide-react";
import { Order, STAGE_LABELS, StageName, User, OrderComment, OrderFile } from "../../types";
import StageProgress from "../order/StageProgress";
import { useAuthStore } from "../../store/auth.store";
import { useOrdersStore } from "../../store/orders.store";
import UserProfileCard from "../UserProfileCard";
import * as api from "../../api/client";

const STAGE_ORDER: StageName[] = ["STORYBOARD", "ANIMATION", "EDITING", "REVIEW", "COMPLETED"];

const FILE_TYPE_LABELS: Record<string, string> = { tz: "ТЗ", contract: "Договор", storyboard: "Раскадровка", video: "Видео", other: "Другое" };
const FILE_TYPE_COLORS: Record<string, string> = { tz: "text-blue-400 bg-blue-400/10", contract: "text-purple-400 bg-purple-400/10", storyboard: "text-amber-400 bg-amber-400/10", video: "text-green-400 bg-green-400/10", other: "text-ink-tertiary bg-bg-raised" };

type Tab = "stages" | "files" | "reports" | "comments";

const inputCls = "w-full px-3.5 py-2.5 rounded-lg border border-bg-border bg-bg-raised text-sm text-ink-primary placeholder-ink-tertiary outline-none focus:border-green-500/50 transition-colors";

interface Props { order: Order | null; onClose: () => void; }

export default function OrderDetailModal({ order, onClose }: Props) {
  const user        = useAuthStore((s) => s.user);
  const fetchOrders = useOrdersStore((s) => s.fetchOrders);

  const [fullOrder, setFullOrder] = useState<Order | null>(null);
  const [users,     setUsers]     = useState<User[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [tab,       setTab]       = useState<Tab>("stages");

  // Edit mode
  const [editing,   setEditing]   = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc,  setEditDesc]  = useState("");
  const [editDL,    setEditDL]    = useState("");
  const [saving,    setSaving]    = useState(false);

  // Comments
  const [comments,      setComments]      = useState<OrderComment[]>([]);
  const [commentText,   setCommentText]   = useState("");
  const [sendingComment,setSendingComment]= useState(false);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  // Files
  const [uploadingFile,    setUploadingFile]    = useState(false);
  const [selectedFileType, setSelectedFileType] = useState("other");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reports
  const [reportText,   setReportText]   = useState("");
  const [sendingReport,setSendingReport]= useState(false);

  useEffect(() => {
    if (!order) return;
    loadOrder(); loadUsers(); loadComments();
    setTab("stages"); setEditing(false);
  }, [order?.id]);

  useEffect(() => {
    if (tab === "comments") commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments, tab]);

  const loadOrder  = async () => { if (!order) return; const d = await api.getOrder(order.id); setFullOrder(d); };
  const loadUsers  = async () => { const d = await api.getUsers(); setUsers(Array.isArray(d) ? d : (d.users ?? [])); };
  const loadComments = async () => { if (!order) return; try { const d = await api.getComments(order.id); setComments(d); } catch {} };

  if (!order) return null;
  const o = fullOrder || order;

  const isMarketer    = ["MARKETER","HEAD_MARKETER","ADMIN"].includes(user?.role ?? "");
  const isLeadCreator = user?.role === "LEAD_CREATOR";
  const canApprove    = isMarketer || isLeadCreator;
  const isParticipant = isMarketer || o.creators?.some((c) => c.creatorId === user?.id);
  const canEdit       = isMarketer && o.marketerId === user?.id;

  const daysLeft = o.deadline ? Math.ceil((new Date(o.deadline).getTime() - Date.now()) / 86400000) : null;
  const availableCreators = users.filter((u) => (u.role === "CREATOR" || u.role === "LEAD_CREATOR") && !o.creators?.some((c) => c.creatorId === u.id));

  // ── handlers ──
  const handleStageUpdate = async (stageId: string, status: string) => {
    setLoading(true);
    try { await api.updateStage(o.id, stageId, status); await loadOrder(); await fetchOrders(); }
    catch (err: any) { alert(err.response?.data?.error || "Ошибка"); }
    setLoading(false);
  };

  const handleAddCreator = async (creatorId: string) => {
    try { await api.addCreator(o.id, creatorId); await loadOrder(); await fetchOrders(); }
    catch (err: any) { alert(err.response?.data?.error || "Ошибка"); }
  };

  const handleRemoveCreator = async (creatorId: string) => {
    try { await api.removeCreator(o.id, creatorId); await loadOrder(); await fetchOrders(); }
    catch (err: any) { alert(err.response?.data?.error || "Ошибка"); }
  };

  const handleDelete = async () => {
    if (!confirm("Удалить заказ?")) return;
    await useOrdersStore.getState().removeOrder(o.id); onClose();
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      await api.updateOrder(o.id, { title: editTitle, description: editDesc || undefined, deadline: editDL || undefined });
      await loadOrder(); await fetchOrders(); setEditing(false);
    } catch (err: any) { alert(err.response?.data?.error || "Ошибка"); }
    setSaving(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingFile(true);
    try { await api.uploadFile(o.id, file, selectedFileType); await loadOrder(); }
    catch (err: any) { alert(err.response?.data?.error || "Ошибка загрузки"); }
    setUploadingFile(false); e.target.value = "";
  };

  const handleSendComment = async () => {
    if (!commentText.trim()) return;
    setSendingComment(true);
    try { const c = await api.postComment(o.id, commentText.trim()); setComments((p) => [...p, c]); setCommentText(""); }
    catch (err: any) { alert(err.response?.data?.error || "Ошибка"); }
    setSendingComment(false);
  };

  const handleSendReport = async () => {
    if (!reportText.trim()) return;
    setSendingReport(true);
    try { await api.submitReport(o.id, reportText.trim()); setReportText(""); await loadOrder(); }
    catch (err: any) { alert(err.response?.data?.error || "Ошибка"); }
    setSendingReport(false);
  };

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "stages",   label: "Этапы" },
    { id: "files",    label: "Файлы",   count: o.files?.length },
    { id: "reports",  label: "Отчёты",  count: o.reports?.length || o._count?.reports },
    { id: "comments", label: "Чат",     count: comments.length || undefined },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 pb-6 overflow-y-auto">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-bg-surface border border-bg-border rounded-modal shadow-modal w-full max-w-2xl mx-4 overflow-hidden animate-modal">

        {/* ── Header ── */}
        <div className="p-5 pb-0">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 pr-4 min-w-0">
              {editing ? (
                <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                  className={`${inputCls} text-base font-bold mb-2`} autoFocus />
              ) : (
                <h2 className="text-base font-bold text-ink-primary leading-tight mb-2">{o.title}</h2>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <UserProfileCard userId={o.marketerId} trigger={
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-400/10 text-blue-400 font-medium cursor-pointer hover:bg-blue-400/20 transition-colors">
                    @{o.marketer.telegramUsername || o.marketer.displayName}
                  </span>
                } />
                {daysLeft !== null && (
                  <span className={`flex items-center gap-1 text-xs font-medium ${daysLeft < 0 ? "text-red-400" : daysLeft <= 2 ? "text-amber-400" : "text-ink-tertiary"}`}>
                    <Clock size={11} />
                    {daysLeft < 0 ? `—${Math.abs(daysLeft)} дн.` : daysLeft === 0 ? "Сегодня!" : `${daysLeft} дн.`}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              {canEdit && !editing && (
                <button onClick={() => { setEditing(true); setEditTitle(o.title); setEditDesc(o.description ?? ""); setEditDL(o.deadline ? o.deadline.split("T")[0] : ""); }}
                  className="p-1.5 rounded-lg hover:bg-bg-raised text-ink-tertiary hover:text-ink-primary transition-colors">
                  <Edit2 size={15} />
                </button>
              )}
              {canEdit && o.marketerId === user?.id && !editing && (
                <button onClick={handleDelete} className="p-1.5 rounded-lg hover:bg-red-400/10 text-ink-tertiary hover:text-red-400 transition-colors">
                  <Trash2 size={15} />
                </button>
              )}
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-raised text-ink-tertiary transition-colors">
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Edit form */}
          {editing && (
            <div className="space-y-2 mb-3">
              <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)}
                placeholder="ТЗ / описание..." rows={3} className={`${inputCls} resize-none`} />
              <div className="flex items-center gap-2">
                <input type="date" value={editDL} onChange={(e) => setEditDL(e.target.value)}
                  className={`${inputCls} flex-1`} style={{ colorScheme: "dark" }} />
                <button onClick={handleSaveEdit} disabled={saving}
                  className="px-4 py-2 rounded-lg bg-green-500 text-black text-sm font-bold hover:bg-green-400 disabled:opacity-50 transition-colors flex items-center gap-1.5">
                  <Check size={14} /> {saving ? "Сохраняю..." : "Сохранить"}
                </button>
                <button onClick={() => setEditing(false)} className="px-3 py-2 rounded-lg border border-bg-border text-sm text-ink-secondary hover:bg-bg-raised transition-colors">
                  Отмена
                </button>
              </div>
            </div>
          )}

          {/* Description */}
          {!editing && o.description && (
            <div className="mb-3 p-3 bg-bg-raised border border-bg-border rounded-lg">
              <p className="text-[10px] font-semibold text-ink-tertiary uppercase tracking-wide mb-1">ТЗ</p>
              <p className="text-sm text-ink-primary whitespace-pre-wrap leading-relaxed">{o.description}</p>
            </div>
          )}

          {/* Creators row */}
          <div className="flex flex-wrap items-center gap-1.5 mb-4">
            {o.creators?.map((c) => (
              <UserProfileCard key={c.id} userId={c.creatorId} trigger={
                <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-bg-raised border border-bg-border hover:border-green-500/30 text-ink-secondary cursor-pointer transition-colors">
                  <div className="w-4 h-4 rounded-full bg-green-500/20 flex items-center justify-center overflow-hidden">
                    {c.creator.avatarUrl
                      ? <img src={c.creator.avatarUrl} alt="" className="w-full h-full object-cover" />
                      : <span className="text-[8px] font-bold text-green-400">{c.creator.displayName[0]}</span>
                    }
                  </div>
                  {c.creator.displayName}
                  {c.isLead && <span className="text-amber-400 text-[10px]">⭐</span>}
                </span>
              } />
            ))}

            {(isMarketer || isLeadCreator) && availableCreators.length > 0 && (
              <select onChange={(e) => { if (e.target.value) handleAddCreator(e.target.value); e.target.value = ""; }} defaultValue=""
                className="text-xs px-2.5 py-1 rounded-full border border-dashed border-bg-border text-ink-tertiary bg-transparent hover:border-green-500/30 cursor-pointer outline-none">
                <option value="" disabled>+ Добавить</option>
                {availableCreators.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
              </select>
            )}
          </div>

          {/* Stage progress bar */}
          {o.stages && <StageProgress stages={o.stages} />}

          {/* Tabs */}
          <div className="flex gap-1 mt-4 border-b border-bg-border -mx-5 px-5">
            {tabs.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.id ? "border-green-500 text-green-400" : "border-transparent text-ink-tertiary hover:text-ink-primary"
                }`}>
                {t.label}
                {t.count !== undefined && t.count > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-bg-raised text-ink-tertiary">{t.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Tab content ── */}
        <div className="p-5 pt-4">

          {/* STAGES */}
          {tab === "stages" && (
            <div className="space-y-2">
              {STAGE_ORDER.map((name) => {
                const stage = o.stages?.find((s) => s.name === name);
                if (!stage) return null;
                return (
                  <div key={stage.id} className="flex items-center justify-between p-3 rounded-lg bg-bg-raised border border-bg-border">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                        stage.status === "DONE" ? "bg-green-500" : stage.status === "IN_PROGRESS" ? "bg-amber-400 pulse-green" : "bg-bg-border"
                      }`} />
                      <div className="min-w-0">
                        <span className="text-sm text-ink-primary">{STAGE_LABELS[stage.name]}</span>
                        {/* Stage dates */}
                        <div className="flex items-center gap-2 mt-0.5">
                          {stage.startedAt && (
                            <span className="flex items-center gap-1 text-[10px] text-ink-tertiary">
                              <Calendar size={9} /> Нач.: {new Date(stage.startedAt).toLocaleDateString("ru-RU", { day:"numeric", month:"short" })}
                            </span>
                          )}
                          {stage.completedAt && (
                            <span className="flex items-center gap-1 text-[10px] text-green-400">
                              <Check size={9} /> {new Date(stage.completedAt).toLocaleDateString("ru-RU", { day:"numeric", month:"short" })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-1.5 flex-shrink-0">
                      {stage.status === "PENDING" && (
                        <button onClick={() => handleStageUpdate(stage.id, "IN_PROGRESS")} disabled={loading}
                          className="text-xs px-3 py-1.5 rounded-lg bg-amber-400/10 text-amber-400 border border-amber-400/20 hover:bg-amber-400/20 font-medium transition-colors disabled:opacity-40">
                          Начать
                        </button>
                      )}
                      {stage.status === "IN_PROGRESS" && (
                        <button onClick={() => handleStageUpdate(stage.id, "DONE")}
                          disabled={loading || (stage.name === "REVIEW" && !canApprove)}
                          title={stage.name === "REVIEW" && !canApprove ? "Только маркетолог или лид-креатор" : undefined}
                          className="text-xs px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 font-medium transition-colors disabled:opacity-40">
                          {stage.name === "REVIEW" ? "Утвердить" : "Готово"}
                        </button>
                      )}
                      {stage.status === "DONE" && (
                        <span className="text-xs text-green-400 font-medium px-2">✓</span>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Remove creators */}
              {o.creators && o.creators.filter((c) => isMarketer || c.addedById === user?.id).length > 0 && (
                <div className="mt-4 pt-4 border-t border-bg-border">
                  <p className="text-[10px] text-ink-tertiary uppercase tracking-wide mb-2">Управление командой</p>
                  {o.creators.filter((c) => isMarketer || c.addedById === user?.id).map((c) => (
                    <div key={c.id} className="flex items-center justify-between py-1.5">
                      <span className="text-sm text-ink-secondary">{c.creator.displayName}</span>
                      <button onClick={() => handleRemoveCreator(c.creatorId)} className="text-xs text-ink-tertiary hover:text-red-400 transition-colors">Убрать</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* FILES */}
          {tab === "files" && (
            <div>
              {isParticipant && (
                <div className="flex items-center gap-2 mb-4">
                  <select value={selectedFileType} onChange={(e) => setSelectedFileType(e.target.value)}
                    className="text-sm px-3 py-2 rounded-lg border border-bg-border bg-bg-raised text-ink-primary outline-none">
                    {Object.entries(FILE_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <button onClick={() => fileInputRef.current?.click()} disabled={uploadingFile}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500 text-black text-sm font-bold hover:bg-green-400 disabled:opacity-50 transition-colors">
                    {uploadingFile ? <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : <Upload size={14} />}
                    {uploadingFile ? "Загружаю..." : "Загрузить"}
                  </button>
                  <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
                </div>
              )}

              {!o.files || o.files.length === 0 ? (
                <div className="text-center py-10 text-ink-tertiary">
                  <Paperclip size={28} className="mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Файлов нет</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {o.files.map((f) => <FileRow key={f.id} file={f} />)}
                </div>
              )}
            </div>
          )}

          {/* REPORTS */}
          {tab === "reports" && (
            <div>
              {!isMarketer && isParticipant && (
                <div className="mb-4 p-3.5 bg-bg-raised border border-bg-border rounded-lg">
                  <p className="text-[10px] font-semibold text-ink-tertiary uppercase tracking-wide mb-2">Отправить отчёт</p>
                  <textarea value={reportText} onChange={(e) => setReportText(e.target.value)}
                    placeholder="Что сделано сегодня..." rows={3}
                    className="w-full text-sm bg-bg-surface border border-bg-border rounded-lg p-2.5 text-ink-primary placeholder-ink-tertiary outline-none focus:border-green-500/50 resize-none transition-colors" />
                  <div className="flex justify-end mt-2">
                    <button onClick={handleSendReport} disabled={!reportText.trim() || sendingReport}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500 text-black text-sm font-bold hover:bg-green-400 disabled:opacity-50 transition-colors">
                      {sendingReport ? <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : <Send size={13} />}
                      Отправить
                    </button>
                  </div>
                </div>
              )}

              {!o.reports || o.reports.length === 0 ? (
                <div className="text-center py-10 text-ink-tertiary">
                  <FileText size={28} className="mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Отчётов нет</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {o.reports.map((r) => (
                    <div key={r.id} className="p-3 rounded-lg bg-bg-raised border border-bg-border">
                      <div className="flex items-center justify-between mb-1.5">
                        <UserProfileCard userId={r.creator.id} trigger={
                          <span className="text-xs font-medium text-ink-secondary cursor-pointer hover:text-ink-primary transition-colors">{r.creator.displayName}</span>
                        } />
                        <span className="text-[10px] text-ink-tertiary">{new Date(r.reportDate).toLocaleDateString("ru-RU")}</span>
                      </div>
                      <p className="text-sm text-ink-primary">{r.reportText}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* COMMENTS */}
          {tab === "comments" && (
            <div>
              <div className="max-h-72 overflow-y-auto space-y-2 mb-3">
                {comments.length === 0 ? (
                  <div className="text-center py-10 text-ink-tertiary">
                    <MessageSquare size={28} className="mx-auto mb-2 opacity-20" />
                    <p className="text-sm">Чат пустой</p>
                  </div>
                ) : comments.map((c) => {
                  const isOwn = c.author.id === user?.id;
                  return (
                    <div key={c.id} className={`flex gap-2 ${isOwn ? "flex-row-reverse" : ""}`}>
                      <UserProfileCard userId={c.author.id} trigger={
                        <div className="w-7 h-7 rounded-full bg-bg-raised border border-bg-border flex items-center justify-center flex-shrink-0 cursor-pointer hover:border-green-500/30 transition-colors overflow-hidden">
                          {c.author.avatarUrl
                            ? <img src={c.author.avatarUrl} alt="" className="w-full h-full object-cover" />
                            : <span className="text-[10px] font-bold text-ink-tertiary">{c.author.displayName[0].toUpperCase()}</span>
                          }
                        </div>
                      } />
                      <div className={`max-w-[75%] flex flex-col ${isOwn ? "items-end" : "items-start"}`}>
                        {!isOwn && <span className="text-[10px] text-ink-tertiary mb-0.5 ml-1">{c.author.displayName}</span>}
                        <div className={`px-3 py-2 rounded-2xl text-sm ${isOwn ? "bg-green-500 text-black rounded-tr-sm" : "bg-bg-raised border border-bg-border text-ink-primary rounded-tl-sm"}`}>
                          {c.text}
                        </div>
                        <span className="text-[10px] text-ink-tertiary mt-0.5 mx-1">
                          {new Date(c.createdAt).toLocaleTimeString("ru-RU", { hour:"2-digit", minute:"2-digit" })}
                        </span>
                      </div>
                    </div>
                  );
                })}
                <div ref={commentsEndRef} />
              </div>

              <div className="flex gap-2 pt-2 border-t border-bg-border">
                <input value={commentText} onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendComment(); } }}
                  placeholder="Написать сообщение..."
                  className="flex-1 text-sm px-3 py-2.5 rounded-lg bg-bg-raised border border-bg-border text-ink-primary placeholder-ink-tertiary outline-none focus:border-green-500/50 transition-colors" />
                <button onClick={handleSendComment} disabled={!commentText.trim() || sendingComment}
                  className="p-2.5 rounded-lg bg-green-500 text-black hover:bg-green-400 disabled:opacity-50 transition-colors">
                  {sendingComment ? <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : <Send size={16} />}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FileRow({ file }: { file: OrderFile }) {
  const [dl, setDl] = useState(false);
  const handleDl = async () => { setDl(true); try { const url = await api.getDownloadUrl(file.id); window.open(url,"_blank"); } catch {} setDl(false); };
  const size = file.fileSize > 1048576 ? `${(file.fileSize/1048576).toFixed(1)} МБ` : `${Math.round(file.fileSize/1024)} КБ`;
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-bg-raised border border-bg-border hover:border-bg-hover transition-colors">
      <div className="flex items-center gap-2.5 min-w-0">
        <Paperclip size={13} className="text-ink-tertiary flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-sm text-ink-primary truncate">{file.fileName}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${FILE_TYPE_COLORS[file.fileType] || FILE_TYPE_COLORS.other}`}>
              {FILE_TYPE_LABELS[file.fileType] || file.fileType}
            </span>
            <span className="text-[10px] text-ink-tertiary">{size}</span>
          </div>
        </div>
      </div>
      <button onClick={handleDl} disabled={dl} className="p-1.5 rounded-lg hover:bg-bg-hover text-ink-tertiary hover:text-ink-primary transition-colors disabled:opacity-40 flex-shrink-0">
        <Download size={14} />
      </button>
    </div>
  );
}
