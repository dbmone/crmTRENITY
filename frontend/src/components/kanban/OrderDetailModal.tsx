import { useEffect, useRef, useState } from "react";
import { X, Clock, Paperclip, Download, Trash2, Upload, Send, MessageSquare, FileText, Edit2, Check, Calendar, ArchiveRestore, RotateCcw, Plus, ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { Order, STAGE_LABELS, StageName, User, OrderComment, OrderFile, OrderStage } from "../../types";
import StageProgress from "../order/StageProgress";
import { useAuthStore } from "../../store/auth.store";
import { useOrdersStore } from "../../store/orders.store";
import UserProfileCard from "../UserProfileCard";
import * as api from "../../api/client";
import { createTourDemoComments, createTourDemoUsers, isTourDemoOrder } from "../../data/tourDemoData";
import OrderFileRow from "./OrderFileRow";

const STAGE_ORDER: StageName[] = ["STORYBOARD", "ANIMATION", "EDITING", "REVIEW", "COMPLETED"];

type FileBucket = "tz" | "contract" | "storyboard" | "video" | "other";
type UploadFileType = "TZ" | "CONTRACT" | "STORYBOARD" | "VIDEO_FINAL" | "OTHER";
type UploadState = "uploading" | "done" | "error" | "canceled";
type UploadItem = {
  key: string;
  name: string;
  size: number;
  progress: number;
  state: UploadState;
  errorMsg?: string;
};

const FILE_BUCKET_LABELS: Record<FileBucket, string> = {
  tz: "ТЗ",
  contract: "Договор",
  storyboard: "Раскадровка",
  video: "Видео",
  other: "Другое",
};

const FILE_BUCKET_COLORS: Record<FileBucket, string> = {
  tz: "text-blue-400 bg-blue-400/10",
  contract: "text-purple-400 bg-purple-400/10",
  storyboard: "text-amber-400 bg-amber-400/10",
  video: "text-green-400 bg-green-400/10",
  other: "text-ink-tertiary bg-bg-raised",
};

const NON_TZ_FILTER_OPTIONS: Array<{ value: Exclude<FileBucket, "tz">; label: string }> = [
  { value: "contract", label: "Договор" },
  { value: "storyboard", label: "Раскадровка" },
  { value: "video", label: "Видео" },
  { value: "other", label: "Другое" },
];

const NON_TZ_UPLOAD_OPTIONS: Array<{ value: Exclude<UploadFileType, "TZ">; label: string }> = [
  { value: "CONTRACT", label: "Договор" },
  { value: "STORYBOARD", label: "Раскадровка" },
  { value: "VIDEO_FINAL", label: "Видео" },
  { value: "OTHER", label: "Другое" },
];

function getFileBucket(file: Pick<OrderFile, "fileType" | "mimeType">): FileBucket {
  const ft = file.fileType?.toUpperCase();
  if (ft === "TZ" || file.mimeType === "text/plain") return "tz";
  if (ft === "CONTRACT") return "contract";
  if (ft === "STORYBOARD") return "storyboard";
  if (ft === "VIDEO_DRAFT" || ft === "VIDEO_FINAL") return "video";
  return "other";
}

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} МБ`;
  return `${Math.max(1, Math.round(size / 1024))} КБ`;
}

function makeUploadKey(file: File, index: number) {
  return `${file.name}-${file.size}-${file.lastModified}-${index}`;
}

function buildUploadLimitMessage(files: File[]) {
  if (!files.length) return "";
  const names = files.slice(0, 3).map((file) => file.name).join(", ");
  const suffix = files.length > 3 ? ` и ещё ${files.length - 3}` : "";
  return `На сайте сейчас можно загружать в Telegram-хранилище только файлы до 50 МБ. Не загружены: ${names}${suffix}.`;
}

type Tab = "stages" | "tz" | "files" | "reports" | "comments";

const inputCls = "w-full px-3.5 py-2.5 rounded-lg border border-bg-border bg-bg-raised text-sm text-ink-primary placeholder-ink-tertiary outline-none focus:border-green-500/50 transition-colors";

function UploadProgressList({
  items,
  title,
  cancelLabel,
  onCancel,
  showCancel,
}: {
  items: UploadItem[];
  title: string;
  cancelLabel: string;
  onCancel: () => void;
  showCancel: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg border border-bg-border bg-bg-raised p-2.5 animate-soft-in-fast">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-secondary">
        <span>{title}</span>
        {showCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-red-500/20 px-2.5 py-1 text-[11px] text-red-400 transition-colors hover:bg-red-500/10"
          >
            {cancelLabel}
          </button>
        )}
      </div>
      <div className="space-y-2">
        {items.map((item) => (
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
                  ? (item.errorMsg || "Ошибка")
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
  );
}

interface Props {
  order: Order | null;
  onClose: () => void;
  forcedTab?: Tab | null;
  onOrderChanged?: (nextOrder: Order | null, action: "updated" | "archived" | "unarchived" | "deleted") => void;
}

export default function OrderDetailModal({ order, onClose, forcedTab = null, onOrderChanged }: Props) {
  const user        = useAuthStore((s) => s.user);
  const fetchOrders = useOrdersStore((s) => s.fetchOrders);
  const isDemoOrder = isTourDemoOrder(order);

  const [fullOrder, setFullOrder] = useState<Order | null>(null);
  const [detailsReady, setDetailsReady] = useState(false);
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
  const [fileUploadProgress, setFileUploadProgress] = useState<number | null>(null);
  const [fileUploadItems, setFileUploadItems] = useState<UploadItem[]>([]);
  const [selectedFileType, setSelectedFileType] = useState<"all" | Exclude<FileBucket, "tz">>("all");
  const [uploadFileType,   setUploadFileType]   = useState<Exclude<UploadFileType, "TZ">>("OTHER");
  const [draggingFiles,    setDraggingFiles]    = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reports
  const [reportText,   setReportText]   = useState("");
  const [sendingReport,setSendingReport]= useState(false);

  // Edit file attach
  const [editUploadingFile,    setEditUploadingFile]    = useState(false);
  const [editUploadProgress,   setEditUploadProgress]   = useState<number | null>(null);
  const [editUploadItems, setEditUploadItems] = useState<UploadItem[]>([]);
  const [editSelectedFileType, setEditSelectedFileType] = useState<UploadFileType>("TZ");
  const editFileInputRef = useRef<HTMLInputElement>(null);

  // TZ tab
  const [tzText,          setTzText]          = useState("");
  const [primaryTzNoteId, setPrimaryTzNoteId] = useState<string | null>(null);
  const [addingTzNote,    setAddingTzNote]    = useState(false);
  const [tzExtraTexts,    setTzExtraTexts]    = useState<string[]>([]);
  const [savingTzExtra,   setSavingTzExtra]   = useState<boolean[]>([]);
  const [uploadingTzFile, setUploadingTzFile] = useState(false);
  const [tzUploadProgress, setTzUploadProgress] = useState<number | null>(null);
  const [tzUploadItems, setTzUploadItems] = useState<UploadItem[]>([]);
  const [draggingTz,      setDraggingTz]      = useState(false);
  const [recording,       setRecording]       = useState(false);
  const [transcribing,    setTranscribing]    = useState(false);
  const [voicePreview,    setVoicePreview]    = useState<string | null>(null);
  const [savingVoiceNote, setSavingVoiceNote] = useState(false);
  const [sendingTzToTg,   setSendingTzToTg]   = useState(false);
  const [tzTextStructuring, setTzTextStructuring] = useState(false);
  // Voice → TZ structuring preview
  const [tzAiRecording,   setTzAiRecording]   = useState(false);
  const [tzAiStructuring, setTzAiStructuring] = useState(false);
  const [tzAiPreview,     setTzAiPreview]     = useState<{ text: string; rawText: string } | null>(null);
  const tzAiRecorderRef  = useRef<MediaRecorder | null>(null);
  const tzAiChunksRef    = useRef<BlobPart[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef   = useRef<BlobPart[]>([]);
  const tzFileInputRef   = useRef<HTMLInputElement>(null);
  const fileUploadAbortRef = useRef<AbortController | null>(null);
  const editUploadAbortRef = useRef<AbortController | null>(null);
  const tzUploadAbortRef   = useRef<AbortController | null>(null);

  const handleEditFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setEditUploadingFile(true);
    setEditUploadProgress(0);
    try {
      const failed = await uploadFilesWithProgress(o.id, files, editSelectedFileType, setEditUploadProgress, setEditUploadItems);
      await loadOrder();
      if (failed > 0) alert(`Не удалось загрузить ${failed} файл(ов)`);
    }
    catch (err: any) { alert(err.response?.data?.error || "Ошибка загрузки"); }
    setEditUploadingFile(false); setEditUploadProgress(null); e.target.value = "";
  };

  useEffect(() => {
    if (!order) return;
    setFullOrder(null);
    setDetailsReady(false);
    setPrimaryTzNoteId(null);
    setTzText("");
    setComments([]);
    if (isDemoOrder) {
      setFullOrder(order);
      setUsers(createTourDemoUsers(user));
      setComments(createTourDemoComments(user));
      setDetailsReady(true);
    } else {
      void loadOrder();
      void loadUsers();
      void loadComments();
    }
    setTab("stages"); setEditing(false);
  }, [isDemoOrder, order, user]);

  useEffect(() => {
    if (!order || !forcedTab) return;
    setTab(forcedTab);
  }, [forcedTab, order?.id]);

  useEffect(() => {
    if (tab === "comments") commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments, tab]);

  const loadOrder  = async () => {
    if (!order) return;
    if (isDemoOrder) {
      setFullOrder(order);
      setDetailsReady(true);
      return;
    }
    setDetailsReady(false);
    try {
      const d = await api.getOrder(order.id);
      setFullOrder(d);
    } finally {
      setDetailsReady(true);
    }
  };
  const loadUsers  = async () => {
    if (isDemoOrder) {
      setUsers(createTourDemoUsers(user));
      return;
    }
    const d = await api.getUsers();
    setUsers(Array.isArray(d) ? d : (d.users ?? []));
  };
  const loadComments = async () => {
    if (!order) return;
    if (isDemoOrder) {
      setComments(createTourDemoComments(user));
      return;
    }
    try {
      const d = await api.getComments(order.id);
      setComments(d);
    } catch {}
  };

  const startUploadItems = (
    files: File[],
    setItems: React.Dispatch<React.SetStateAction<UploadItem[]>>
  ) => {
    const items = files.map((file, index) => ({
      key: makeUploadKey(file, index),
      name: file.name,
      size: file.size,
      progress: 0,
      state: "uploading" as UploadState,
    }));
    setItems(items);
    return items;
  };

  const updateUploadItem = (
    key: string,
    setItems: React.Dispatch<React.SetStateAction<UploadItem[]>>,
    patch: Partial<UploadItem>
  ) => {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  };

  const uploadFilesWithProgress = async (
    orderId: string,
    files: File[],
    fileType: UploadFileType,
    setProgress: (value: number | null) => void,
    setItems: React.Dispatch<React.SetStateAction<UploadItem[]>>,
    signal?: AbortSignal
  ) => {
    if (!files.length) {
      setProgress(null);
      setItems([]);
      return 0;
    }

    let failed = 0;
    const items = startUploadItems(files, setItems);

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const item = items[index];

      try {
        await api.uploadFile(orderId, file, fileType, {
          signal,
          onProgress: (percent) => {
            setProgress(percent);
            updateUploadItem(item.key, setItems, { progress: percent, state: "uploading" });
          },
        });
        setProgress(100);
        updateUploadItem(item.key, setItems, { progress: 100, state: "done" });
      } catch (err) {
        if (api.isRequestCanceled(err)) {
          updateUploadItem(item.key, setItems, { state: "canceled" });
          throw err;
        }
        failed += 1;
        updateUploadItem(item.key, setItems, { state: "error" });
      }
    }

    return failed;
  };

  if (!order) return null;
  const o = fullOrder || order;

  const isMarketer    = user?.permissions?.create_order ?? ["MARKETER","HEAD_MARKETER","ADMIN","HEAD_CREATOR"].includes(user?.role ?? "");
  const isLeadCreator = user?.role === "LEAD_CREATOR";
  const canApprove    = user?.permissions?.approve_review ?? (isMarketer || isLeadCreator);
  const canSubmitReport = user?.permissions?.submit_report ?? ["CREATOR","LEAD_CREATOR","HEAD_CREATOR","ADMIN"].includes(user?.role ?? "");
  const isParticipant = isMarketer || o.creators?.some((c) => c.creatorId === user?.id);
  const canEdit       = isMarketer && o.marketerId === user?.id;
  const canHardDelete = user?.role === "ADMIN";

  const daysLeft = o.deadline ? Math.ceil((new Date(o.deadline).getTime() - Date.now()) / 86400000) : null;
  const availableCreators = users.filter((u) => ["CREATOR", "LEAD_CREATOR", "HEAD_CREATOR"].includes(u.role) && !o.creators?.some((c) => c.creatorId === u.id));

  const handleManagedUpload = async (
    files: File[],
    fileType: UploadFileType,
    setUploading: (value: boolean) => void,
    setProgress: (value: number | null) => void,
    setItems: React.Dispatch<React.SetStateAction<UploadItem[]>>,
    abortRef: { current: AbortController | null },
  ) => {
    if (!files.length) return false;

    const { accepted, rejected } = api.splitTelegramUploadFiles(files);
    if (rejected.length) {
      alert(buildUploadLimitMessage(rejected));
    }
    if (!accepted.length) return false;

    setUploading(true);
    setProgress(0);
    setItems([]);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const failed = await uploadFilesWithProgress(o.id, accepted, fileType, setProgress, setItems, controller.signal);
      await loadOrder();
      if (failed > 0) {
        alert(`Не удалось загрузить ${failed} файл(ов)`);
      }
      return true;
    } catch (err: any) {
      if (!api.isRequestCanceled(err)) {
        alert(err.response?.data?.error || "Ошибка загрузки");
      }
      return false;
    } finally {
      abortRef.current = null;
      setUploading(false);
      setProgress(null);
      setTimeout(() => setItems([]), 1200);
    }
  };

  const handleEditFilesUpload = async (files: File[]) => {
    await handleManagedUpload(files, editSelectedFileType, setEditUploadingFile, setEditUploadProgress, setEditUploadItems, editUploadAbortRef);
  };

  const handleTzFilesUpload = async (files: File[]) => {
    await handleManagedUpload(files, "TZ", setUploadingTzFile, setTzUploadProgress, setTzUploadItems, tzUploadAbortRef);
  };

  const handleRegularFilesUpload = async (files: File[]) => {
    await handleManagedUpload(files, uploadFileType, setUploadingFile, setFileUploadProgress, setFileUploadItems, fileUploadAbortRef);
  };

  const cancelEditUpload = () => editUploadAbortRef.current?.abort();
  const cancelTzUpload = () => tzUploadAbortRef.current?.abort();
  const cancelFilesUpload = () => fileUploadAbortRef.current?.abort();

  const handleStructureTzText = async () => {
    if (!tzText.trim() || tzTextStructuring) return;
    setTzTextStructuring(true);
    try {
      const { text } = await api.textStructureToTz(o.id, tzText.trim());
      setTzText(text);
    } catch (e: any) {
      alert(e.response?.data?.error || "Ошибка AI-структурирования");
    } finally {
      setTzTextStructuring(false);
    }
  };

  const handleSavePrimaryTz = async () => {
    if (!tzText.trim()) return;
    setAddingTzNote(true);
    try {
      if (primaryTzNoteId) {
        await api.updateTzNote(primaryTzNoteId, tzText.trim());
      } else {
        const created = await api.addTzNote(o.id, tzText.trim());
        if (created?.id) setPrimaryTzNoteId(created.id);
      }
      await loadOrder();
    } catch (e: any) {
      alert(e.response?.data?.error || "Ошибка");
    } finally {
      setAddingTzNote(false);
    }
  };

  // ── handlers ──
  const handleStageUpdate = async (stageId: string, status: string) => {
    if (isDemoOrder) return;
    setLoading(true);
    try { await api.updateStage(o.id, stageId, status); await loadOrder(); await fetchOrders(); }
    catch (err: any) { alert(err.response?.data?.error || "Ошибка"); }
    setLoading(false);
  };

  const handleAddCreator = async (creatorId: string) => {
    if (isDemoOrder) return;
    try { await api.addCreator(o.id, creatorId); await loadOrder(); await fetchOrders(); }
    catch (err: any) { alert(err.response?.data?.error || "Ошибка"); }
  };

  const handleRemoveCreator = async (creatorId: string) => {
    if (isDemoOrder) return;
    try { await api.removeCreator(o.id, creatorId); await loadOrder(); await fetchOrders(); }
    catch (err: any) { alert(err.response?.data?.error || "Ошибка"); }
  };

  const handleDelete = async () => {
    if (isDemoOrder) return;
    if (!confirm("Переместить заказ в архив?")) return;
    try {
      await api.updateOrderStatus(o.id, "ARCHIVED");
      await fetchOrders();
      onOrderChanged?.({ ...o, status: "ARCHIVED" }, "archived");
      onClose();
    } catch (err: any) { alert(err.response?.data?.error || "Ошибка"); }
  };

  const handleHardDelete = async () => {
    if (isDemoOrder) return;
    if (!confirm("Удалить заказ навсегда? Это сотрёт этапы, файлы, комментарии и отчёты без возможности восстановления.")) return;
    try {
      await api.deleteOrder(o.id);
      await fetchOrders();
      onOrderChanged?.(null, "deleted");
      onClose();
    } catch (err: any) {
      alert(err.response?.data?.error || "Не удалось удалить заказ");
    }
  };

  const handleUnarchive = async () => {
    if (isDemoOrder) return;
    try {
      await api.updateOrderStatus(o.id, "DONE");
      await fetchOrders();
      onOrderChanged?.({ ...o, status: "DONE" }, "unarchived");
      onClose();
    } catch (err: any) { alert(err.response?.data?.error || "Ошибка"); }
  };

  const handleSaveEdit = async () => {
    if (isDemoOrder) return;
    setSaving(true);
    try {
      await api.updateOrder(o.id, { title: editTitle, description: editDesc || undefined, deadline: editDL || undefined });
      await loadOrder();
      await fetchOrders();
      onOrderChanged?.({
        ...o,
        title: editTitle,
        description: editDesc || null,
        deadline: editDL || null,
      }, "updated");
      setEditing(false);
    } catch (err: any) { alert(err.response?.data?.error || "Ошибка"); }
    setSaving(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploadingFile(true);
    setFileUploadProgress(0);
    try {
      const failed = await uploadFilesWithProgress(o.id, files, uploadFileType, setFileUploadProgress, setFileUploadItems);
      await loadOrder();
      if (failed > 0) alert(`Не удалось загрузить ${failed} файл(ов)`);
    }
    catch (err: any) { alert(err.response?.data?.error || "Ошибка загрузки"); }
    setUploadingFile(false); setFileUploadProgress(null); e.target.value = "";
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

  const startTzAiRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMime = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
      const mr = new MediaRecorder(stream, preferredMime ? { mimeType: preferredMime } : {});
      tzAiRecorderRef.current = mr;
      tzAiChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) tzAiChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const mimeType = mr.mimeType || preferredMime || "audio/webm";
        const blob = new Blob(tzAiChunksRef.current, { type: mimeType });
        setTzAiStructuring(true);
        try {
          const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : "webm";
          const result = await api.voiceStructureToTz(o.id, blob, ext);
          setTzAiPreview(result);
        } catch (e: any) {
          alert(e.response?.data?.error || "Ошибка структурирования. Проверьте GROQ_API_KEY.");
        } finally {
          setTzAiStructuring(false);
        }
      };
      mr.start();
      setTzAiRecording(true);
    } catch {
      alert("Нет доступа к микрофону.");
    }
  };

  const stopTzAiRecording = () => {
    tzAiRecorderRef.current?.stop();
    setTzAiRecording(false);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMime = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
      const mr = new MediaRecorder(stream, preferredMime ? { mimeType: preferredMime } : {});
      mediaRecorderRef.current = mr;
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const mimeType = mr.mimeType || preferredMime || "audio/webm";
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        setTranscribing(true);
        try {
          const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : "webm";
          const { text } = await api.transcribeVoice(o.id, blob, ext);
          setVoicePreview(text);
        } catch (e: any) {
          alert(e.response?.data?.message || e.response?.data?.error || "Ошибка расшифровки. Проверьте GROQ_API_KEY.");
        } finally {
          setTranscribing(false);
        }
      };
      mr.start();
      setRecording(true);
    } catch {
      alert("Нет доступа к микрофону. Разрешите доступ в настройках браузера.");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const tzItems    = o.files?.filter((f) => getFileBucket(f) === "tz") ?? [];
  const nonTzFiles = o.files?.filter((f) => getFileBucket(f) !== "tz") ?? [];
  const visibleComments = comments.filter((comment) => !(comment.source === "TELEGRAM" && comment.author.id === user?.id));
  const filteredFiles = selectedFileType === "all"
    ? nonTzFiles
    : nonTzFiles.filter((f) => getFileBucket(f) === selectedFileType);

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "stages",   label: "Этапы" },
    { id: "tz",       label: "ТЗ",      count: tzItems.length || undefined },
    { id: "files",    label: "Файлы",   count: nonTzFiles.length || undefined },
    { id: "reports",  label: "Отчёты",  count: o.reports?.length || o._count?.reports },
    { id: "comments", label: "Чат",     count: comments.length || undefined },
  ];

  const commentsTab = tabs.find((item) => item.id === "comments");
  if (commentsTab) commentsTab.count = visibleComments.length || undefined;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-end sm:justify-center sm:pt-10 sm:pb-6 sm:overflow-y-auto">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div data-tour="order-modal" className="relative bg-bg-surface border border-t border-bg-border rounded-t-2xl sm:rounded-modal shadow-modal w-full sm:max-w-[44rem] lg:max-w-[46rem] sm:mx-4 max-h-[90vh] overflow-y-auto animate-modal animate-soft-in">

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
              {o.status === "ARCHIVED" && isMarketer && (
                <button onClick={handleUnarchive} title="Восстановить из архива"
                  className="p-1.5 rounded-lg hover:bg-green-500/10 text-ink-tertiary hover:text-green-400 transition-colors">
                  <ArchiveRestore size={15} />
                </button>
              )}
              {canEdit && o.status !== "ARCHIVED" && !editing && (
                <button onClick={() => { setEditing(true); setEditTitle(o.title); setEditDesc(o.description ?? ""); setEditDL(o.deadline ? o.deadline.split("T")[0] : ""); }}
                  className="p-1.5 rounded-lg hover:bg-bg-raised text-ink-tertiary hover:text-ink-primary transition-colors">
                  <Edit2 size={15} />
                </button>
              )}
              {canEdit && o.marketerId === user?.id && o.status !== "ARCHIVED" && !editing && (
                <button onClick={handleDelete} title="В архив" className="p-1.5 rounded-lg hover:bg-red-400/10 text-ink-tertiary hover:text-red-400 transition-colors">
                  <Trash2 size={15} />
                </button>
              )}
              {canHardDelete && !editing && (
                <button
                  onClick={handleHardDelete}
                  title="Удалить навсегда"
                  className="p-1.5 rounded-lg hover:bg-red-500/10 text-ink-tertiary hover:text-red-500 transition-colors"
                >
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
              {/* File attach in edit mode */}
              <div className="flex flex-wrap items-center gap-2">
                <select value={editSelectedFileType} onChange={(e) => setEditSelectedFileType(e.target.value as UploadFileType)}
                  className="min-w-[150px] flex-1 sm:flex-none text-xs px-2.5 py-1.5 rounded-lg border border-bg-border bg-bg-raised text-ink-secondary outline-none">
                  <option value="TZ">ТЗ</option>
                  <option value="CONTRACT">Договор</option>
                  <option value="STORYBOARD">Раскадровка</option>
                  <option value="OTHER">Другое</option>
                </select>
                <button onClick={() => editFileInputRef.current?.click()} disabled={editUploadingFile}
                  className="w-full justify-center sm:w-auto sm:justify-start flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-dashed border-bg-border text-ink-tertiary hover:border-green-500/40 hover:text-green-400 disabled:opacity-50 transition-colors">
                  {editUploadingFile
                    ? <div className="w-3 h-3 border-2 border-green-500/30 border-t-green-500 rounded-full animate-spin" />
                    : <Paperclip size={12} />}
                  {editUploadingFile ? "Загружаю..." : "Прикрепить файл"}
                </button>
                <input
                  ref={editFileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={async (e) => {
                    const files = Array.from(e.target.files || []);
                    await handleEditFilesUpload(files);
                    e.target.value = "";
                  }}
                />
              </div>
              <UploadProgressList
                items={editUploadItems}
                title="Загрузка файла"
                cancelLabel="Отменить загрузку"
                onCancel={cancelEditUpload}
                showCancel={editUploadingFile}
              />
              <div className="flex flex-wrap items-center gap-2">
                <input type="date" value={editDL} onChange={(e) => setEditDL(e.target.value)}
                  className={`${inputCls} min-w-[180px] flex-1`} style={{ colorScheme: "dark" }} />
                <button onClick={handleSaveEdit} disabled={saving}
                  className="w-full justify-center sm:w-auto sm:justify-start px-4 py-2 rounded-lg bg-green-500 text-black text-sm font-bold hover:bg-green-400 disabled:opacity-50 transition-colors flex items-center gap-1.5">
                  <Check size={14} /> {saving ? "Сохраняю..." : "Сохранить"}
                </button>
                <button onClick={() => setEditing(false)} className="w-full sm:w-auto px-3 py-2 rounded-lg border border-bg-border text-sm text-ink-secondary hover:bg-bg-raised transition-colors">
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
          <div data-tour="order-creators" className="flex flex-wrap items-center gap-1.5 mb-4">
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
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                data-tour={
                  t.id === "stages" ? "tab-stages"
                  : t.id === "tz" ? "tab-tz"
                  : t.id === "files" ? "tab-files"
                  : t.id === "reports" ? "tab-reports"
                  : t.id === "comments" ? "tab-comments"
                  : undefined
                }
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
          {!detailsReady && !fullOrder ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-24 rounded-xl bg-bg-raised" />
              <div className="h-20 rounded-xl bg-bg-raised" />
              <div className="h-16 rounded-xl bg-bg-raised" />
            </div>
          ) : (
            <>

          {/* STAGES */}
          {tab === "stages" && (
            <StagesTab
              order={o}
              user={user}
              loading={loading}
              canApprove={canApprove}
              canSubmitReport={canSubmitReport}
              isParticipant={isParticipant}
              isMarketer={isMarketer}
              onStageUpdate={handleStageUpdate}
              onRemoveCreator={handleRemoveCreator}
              onSwitchToReports={() => setTab("reports")}
              onReload={loadOrder}
            />
          )}

          {/* ТЗ */}
          {tab === "tz" && (
            <div className="space-y-4">
              {/* Описание заказа (основное ТЗ) */}
              {o.description && (
                <div className="p-3.5 rounded-lg bg-bg-raised border border-bg-border">
                  <p className="text-[10px] font-semibold text-ink-tertiary uppercase tracking-wide mb-1.5">Описание заказа</p>
                  <p className="text-sm text-ink-primary whitespace-pre-wrap">{o.description}</p>
                </div>
              )}

              {/* Добавить текстовую заметку */}
              {isParticipant && (
                <div
                  data-tour="tz-upload-zone"
                  className={`p-3.5 border rounded-lg transition-colors ${draggingTz ? "bg-green-500/10 border-green-500" : "bg-bg-raised border-bg-border"}`}
                  onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDraggingTz(true); }}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDraggingTz(true); }}
                  onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDraggingTz(false); }}
                  onDrop={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDraggingTz(false);
                    const files = Array.from(e.dataTransfer.files || []);
                    await handleTzFilesUpload(files);
                  }}
                >
                  <p className="text-[10px] font-semibold text-ink-tertiary uppercase tracking-wide mb-2">Добавить к ТЗ</p>
                  <p className="mb-2 text-xs text-ink-tertiary">
                    Перетащи файлы прямо в эту область или загрузи их кнопкой. Всё, что попадёт сюда, останется во вкладке ТЗ.
                  </p>
                  <textarea
                    value={tzText}
                    onChange={(e) => setTzText(e.target.value)}
                    placeholder="Текст дополнения к ТЗ..."
                    rows={3}
                    className="w-full text-sm bg-bg-surface border border-bg-border rounded-lg p-2.5 text-ink-primary placeholder-ink-tertiary outline-none focus:border-green-500/50 resize-none transition-colors"
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-2.5 [&>button]:min-h-[40px]">
                    <button
                      onClick={() => void handleSavePrimaryTz()}
                      disabled={!tzText.trim() || addingTzNote}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-green-500/20 bg-green-500/10 text-green-400 text-sm font-medium hover:bg-green-500/20 disabled:opacity-50 transition-colors">
                      {addingTzNote ? <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" /> : <FileText size={13} />}
                      Сохранить текст
                    </button>
                    <button
                      onClick={() => { setTzExtraTexts((p) => [...p, ""]); setSavingTzExtra((p) => [...p, false]); }}
                      title="Добавить ещё одно текстовое поле для доп. заметки к ТЗ"
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-bg-border text-ink-secondary text-sm hover:bg-bg-hover transition-colors">
                      <Plus size={13} /> Ещё заметка
                    </button>
                    <button
                      onClick={() => tzFileInputRef.current?.click()}
                      disabled={uploadingTzFile}
                      title="Прикрепить файл к ТЗ"
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-bg-border text-ink-secondary text-sm hover:bg-bg-hover disabled:opacity-50 transition-colors">
                      {uploadingTzFile ? <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" /> : <Paperclip size={13} />}
                      Файл
                    </button>
                    {recording ? (
                      <button
                        onClick={stopRecording}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/40 text-red-400 text-sm bg-red-500/10 animate-pulse">
                        ⏹ Стоп
                      </button>
                    ) : transcribing ? (
                      <button disabled className="flex items-center gap-2 px-3 py-2 rounded-lg border border-bg-border text-ink-tertiary text-sm opacity-70">
                        <div className="w-3 h-3 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                        Расшифровка...
                      </button>
                    ) : (
                      <button
                        onClick={startRecording}
                        data-tour="tz-voice"
                        title="Записать голосовое — текст появится в поле выше"
                        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-bg-border text-ink-secondary text-sm hover:border-red-500/30 hover:text-red-400 transition-colors">
                        🎙 Голос
                      </button>
                    )}
                    {/* Текст → Структурированное ТЗ через LLM */}
                    {tzTextStructuring ? (
                      <button disabled className="flex items-center gap-2 px-3 py-2 rounded-lg border border-green-500/20 text-green-400 text-sm opacity-70">
                        <div className="w-3 h-3 border-2 border-green-400/30 border-t-green-400 rounded-full animate-spin" />
                        AI думает...
                      </button>
                    ) : (
                      <button
                        onClick={() => void handleStructureTzText()}
                        disabled={!tzText.trim()}
                        title="Структурировать введённый текст как ТЗ через AI"
                        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-green-500/30 text-green-400 text-sm hover:bg-green-500/10 disabled:opacity-40 transition-colors">
                        <Sparkles size={13} /> Текст→ТЗ
                      </button>
                    )}
                    {/* Голос → Структурированное ТЗ через LLM */}
                    {tzAiRecording ? (
                      <button
                        onClick={stopTzAiRecording}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-purple-500/40 text-purple-400 text-sm bg-purple-500/10 animate-pulse">
                        ⏹ Стоп
                      </button>
                    ) : tzAiStructuring ? (
                      <button disabled className="flex items-center gap-2 px-3 py-2 rounded-lg border border-purple-500/20 text-purple-400 text-sm opacity-70">
                        <div className="w-3 h-3 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin" />
                        AI думает...
                      </button>
                    ) : (
                      <button
                        onClick={startTzAiRecording}
                        data-tour="tz-voice-ai"
                        title="Записать голос — AI структурирует в готовое ТЗ"
                        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-purple-500/30 text-purple-400 text-sm hover:bg-purple-500/10 transition-colors">
                        🪄 Голос → ТЗ
                      </button>
                    )}
                    <input
                      ref={tzFileInputRef} type="file" multiple className="hidden"
                      onChange={async (e) => {
                        const files = Array.from(e.target.files || []);
                        await handleTzFilesUpload(files);
                        e.target.value = "";
                      }}
                    />
                  </div>
                  {/* Голосовой черновик — выбор действия */}
                  {voicePreview !== null && (
                    <div className="mt-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
                      <p className="text-[10px] text-amber-400 font-medium uppercase tracking-wide mb-2">Расшифровка голоса</p>
                      <p className="text-sm text-ink-primary whitespace-pre-wrap break-words mb-3">{voicePreview}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => {
                            setTzText((prev) => prev ? `${prev}\n${voicePreview}` : voicePreview!);
                            setVoicePreview(null);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm hover:bg-green-500/20 transition-colors">
                          <Plus size={12} /> В основное поле
                        </button>
                        <button
                          onClick={async () => {
                            if (!voicePreview) return;
                            setSavingVoiceNote(true);
                            try {
                              await api.addTzNote(o.id, voicePreview);
                              setVoicePreview(null);
                              await loadOrder();
                            } catch (e: any) { alert(e.response?.data?.error || "Ошибка"); }
                            setSavingVoiceNote(false);
                          }}
                          disabled={savingVoiceNote}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm hover:bg-blue-500/20 disabled:opacity-50 transition-colors">
                          {savingVoiceNote ? <div className="w-3.5 h-3.5 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" /> : <Plus size={12} />}
                          Доп. заметка
                        </button>
                        <button
                          onClick={() => setVoicePreview(null)}
                          className="px-3 py-1.5 rounded-lg border border-bg-border text-ink-tertiary text-sm hover:text-red-400 hover:border-red-500/20 transition-colors">
                          Отмена
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Дополнительные текстовые поля */}
                  {tzExtraTexts.map((text, i) => (
                    <div key={i} className="mt-3 p-3 rounded-lg border border-bg-border bg-bg-surface/50">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] text-ink-tertiary font-medium uppercase tracking-wide">Доп. заметка {i + 1}</span>
                        <button
                          onClick={() => {
                            setTzExtraTexts((p) => p.filter((_, j) => j !== i));
                            setSavingTzExtra((p) => p.filter((_, j) => j !== i));
                          }}
                          className="text-ink-tertiary hover:text-red-400 transition-colors p-0.5"
                          title="Убрать поле"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                        </button>
                      </div>
                      <textarea
                        value={text}
                        onChange={(e) => setTzExtraTexts((p) => p.map((v, j) => j === i ? e.target.value : v))}
                        placeholder="Текст доп. заметки..."
                        rows={3}
                        className="w-full text-sm bg-bg-surface border border-bg-border rounded-lg p-2.5 text-ink-primary placeholder-ink-tertiary outline-none focus:border-blue-500/50 resize-none transition-colors"
                      />
                      <button
                        onClick={async () => {
                          if (!text.trim()) return;
                          setSavingTzExtra((p) => p.map((v, j) => j === i ? true : v));
                          try {
                            await api.addTzNote(o.id, text.trim());
                            setTzExtraTexts((p) => p.filter((_, j) => j !== i));
                            setSavingTzExtra((p) => p.filter((_, j) => j !== i));
                            await loadOrder();
                          } catch (e: any) { alert(e.response?.data?.error || "Ошибка"); }
                          setSavingTzExtra((p) => p.map((v, j) => j === i ? false : v));
                        }}
                        disabled={!text.trim() || savingTzExtra[i]}
                        className="flex items-center gap-2 mt-2 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm hover:bg-blue-500/20 disabled:opacity-50 transition-colors">
                        {savingTzExtra[i] ? <div className="w-3.5 h-3.5 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" /> : <Plus size={12} />}
                        Сохранить в ТЗ
                      </button>
                    </div>
                  ))}

                  <UploadProgressList
                    items={tzUploadItems}
                    title="Загрузка файлов в ТЗ"
                    cancelLabel="Отменить загрузку"
                    onCancel={cancelTzUpload}
                    showCancel={uploadingTzFile}
                  />
                </div>
              )}

              {/* Список элементов ТЗ */}
              {tzItems.length === 0 && !o.description ? (
                <div className="text-center py-10 text-ink-tertiary">
                  <FileText size={28} className="mx-auto mb-2 opacity-20" />
                  <p className="text-sm">ТЗ пока не добавлено</p>
                  <p className="text-xs mt-1">Добавьте через поле выше или пришлите в Telegram-бот</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {tzItems.map((f) => (
                    <OrderFileRow
                      key={f.id}
                      file={f}
                      demoMode={isDemoOrder}
                      canDelete={isMarketer || (f.uploadedBy?.id === user?.id)}
                      onDeleted={(id) => setFullOrder((prev) => prev ? { ...prev, files: prev.files.filter((x) => x.id !== id) } : prev)}
                    />
                  ))}
                </div>
              )}

              {/* Кнопка — получить всё ТЗ в Telegram одной пачкой */}
              {(tzItems.length > 0 || o.description) && (
                  <button
                    data-tour="tz-send-telegram"
                    onClick={async () => {
                      setSendingTzToTg(true);
                    try {
                      const res = await api.sendTzBundleToTg(o.id);
                      alert(`ТЗ отправлено в Telegram (${res.sent} эл.)`);
                    } catch (e: any) {
                      alert(e.response?.data?.error || e.response?.data?.message || "Ошибка отправки");
                    }
                    setSendingTzToTg(false);
                  }}
                  disabled={sendingTzToTg}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-[#229ED9]/30 text-[#229ED9] text-sm hover:bg-[#229ED9]/10 disabled:opacity-40 transition-colors">
                  {sendingTzToTg
                    ? <div className="w-4 h-4 border-2 border-[#229ED9]/30 border-t-[#229ED9] rounded-full animate-spin" />
                    : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg>
                  }
                  Получить всё ТЗ в Telegram
                </button>
              )}
            </div>
          )}

          {/* FILES */}
          {tab === "files" && (
            <div
              data-tour="files-upload-zone"
              className={`rounded-xl border p-3 transition-colors ${draggingFiles ? "border-green-500 bg-green-500/10" : "border-transparent"}`}
              onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDraggingFiles(true); }}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDraggingFiles(true); }}
              onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDraggingFiles(false); }}
              onDrop={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                setDraggingFiles(false);
                const files = Array.from(e.dataTransfer.files || []);
                await handleRegularFilesUpload(files);
              }}
            >
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                {/* Фильтр по типу */}
                <select value={selectedFileType} onChange={(e) => setSelectedFileType(e.target.value as "all" | Exclude<FileBucket, "tz">)}
                  className="text-sm px-3 py-2 rounded-lg border border-bg-border bg-bg-raised text-ink-primary outline-none flex-1 min-w-0">
                  <option value="all">Все типы</option>
                  {NON_TZ_FILTER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                {isParticipant && (
                  <>
                    {/* Тип для загрузки */}
                    <select value={uploadFileType} onChange={(e) => setUploadFileType(e.target.value as Exclude<UploadFileType, "TZ">)}
                      className="text-sm px-3 py-2 rounded-lg border border-bg-border bg-bg-raised text-ink-primary outline-none">
                      {NON_TZ_UPLOAD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <button onClick={() => fileInputRef.current?.click()} disabled={uploadingFile}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500 text-black text-sm font-bold hover:bg-green-400 disabled:opacity-50 transition-colors">
                      {uploadingFile ? <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : <Upload size={14} />}
                      {uploadingFile ? "Загружаю..." : "Загрузить"}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={async (e) => {
                        const files = Array.from(e.target.files || []);
                        await handleRegularFilesUpload(files);
                        e.target.value = "";
                      }}
                    />
                  </>
                )}
              </div>

              <div className="mb-4 rounded-lg bg-bg-raised px-3 py-2 text-xs text-ink-tertiary">
                Можно перетащить файлы прямо в эту область. Они загрузятся в выбранный тип без дополнительных окон.
              </div>

              <UploadProgressList
                items={fileUploadItems}
                title="Загрузка файлов"
                cancelLabel="Отменить загрузку"
                onCancel={cancelFilesUpload}
                showCancel={uploadingFile}
              />

              {filteredFiles.length === 0 ? (
                <div className="text-center py-10 text-ink-tertiary">
                  <Paperclip size={28} className="mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Файлов нет</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredFiles.map((f) => (
                    <OrderFileRow
                      key={f.id}
                      file={f}
                      demoMode={isDemoOrder}
                      canDelete={isMarketer || (f.uploadedBy?.id === user?.id)}
                      onDeleted={(id) => {
                        setFullOrder((prev) => prev
                          ? { ...prev, files: prev.files.filter((x) => x.id !== id) }
                          : prev
                        );
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* REPORTS */}
          {tab === "reports" && (
            <div>
              {canSubmitReport && isParticipant && (
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
                {visibleComments.length === 0 ? (
                  <div className="text-center py-10 text-ink-tertiary">
                    <MessageSquare size={28} className="mx-auto mb-2 opacity-20" />
                    <p className="text-sm">Чат пустой</p>
                  </div>
                ) : visibleComments.map((c) => {
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
            </>
          )}
        </div>
      </div>

      {/* ── TZ AI Preview Modal ── */}
      {tzAiPreview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80" onClick={() => setTzAiPreview(null)} />
          <div className="relative bg-bg-surface border border-purple-500/30 rounded-2xl shadow-modal w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-bg-border flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-ink-primary flex items-center gap-2">
                  🪄 Структурированное ТЗ
                </h3>
                <p className="text-[10px] text-ink-tertiary mt-0.5">Отредактируй если нужно и сохрани</p>
              </div>
              <button onClick={() => setTzAiPreview(null)} className="p-1.5 rounded-lg hover:bg-bg-raised text-ink-tertiary">
                <X size={16} />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto">
              <textarea
                value={tzAiPreview.text}
                onChange={(e) => setTzAiPreview({ ...tzAiPreview, text: e.target.value })}
                rows={14}
                className="w-full px-3 py-2.5 rounded-lg border border-bg-border bg-bg-raised text-sm text-ink-primary outline-none focus:border-purple-500/50 resize-none transition-colors"
              />
              {tzAiPreview.rawText !== tzAiPreview.text && (
                <details className="mt-2">
                  <summary className="text-[10px] text-ink-tertiary cursor-pointer hover:text-ink-secondary">Исходная расшифровка</summary>
                  <p className="text-[11px] text-ink-tertiary mt-1 whitespace-pre-wrap">{tzAiPreview.rawText}</p>
                </details>
              )}
            </div>
            <div className="p-4 border-t border-bg-border flex justify-end gap-2">
              <button onClick={() => setTzAiPreview(null)}
                className="px-4 py-2 rounded-lg border border-bg-border text-sm text-ink-secondary hover:bg-bg-raised transition-colors">
                Отмена
              </button>
              <button
                onClick={() => {
                  if (!tzAiPreview.text.trim()) return;
                  setTzText((prev) => (prev ? `${prev}\n${tzAiPreview.text.trim()}` : tzAiPreview.text.trim()));
                  setTzAiPreview(null);
                }}
                disabled={!tzAiPreview.text.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-green-500/20 bg-green-500/10 text-green-400 text-sm font-bold hover:bg-green-500/20 disabled:opacity-50 transition-colors"
              >
                <Plus size={13} />
                В основное поле
              </button>
              <button
                onClick={async () => {
                  if (!tzAiPreview.text.trim()) return;
                  setAddingTzNote(true);
                  try {
                    await api.addTzNote(o.id, tzAiPreview.text.trim());
                    setTzAiPreview(null);
                    await loadOrder();
                  } catch (e: any) { alert(e.response?.data?.error || "Ошибка"); }
                  setAddingTzNote(false);
                }}
                disabled={addingTzNote || !tzAiPreview.text.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-500 text-white text-sm font-bold hover:bg-purple-400 disabled:opacity-50 transition-colors"
              >
                {addingTzNote
                  ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <Plus size={13} />}
                Доп. заметка
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── StagesTab: multi-round stage view with sub-stages ───────────────────────

const STAGE_ORDER_LIST: StageName[] = ["STORYBOARD", "ANIMATION", "EDITING", "REVIEW", "COMPLETED"];
const SUB_STAGE_NAMES: Partial<Record<StageName, boolean>> = { STORYBOARD: true, ANIMATION: true, COMPLETED: true };

interface StagesTabProps {
  order: Order;
  user: User | null;
  loading: boolean;
  canApprove: boolean;
  canSubmitReport: boolean;
  isParticipant: boolean;
  isMarketer: boolean;
  onStageUpdate: (stageId: string, status: string) => void;
  onRemoveCreator: (creatorId: string) => void;
  onSwitchToReports: () => void;
  onReload: () => void;
}

function StagesTab({ order, user, loading, canApprove, canSubmitReport, isParticipant, isMarketer, onStageUpdate, onRemoveCreator, onSwitchToReports, onReload }: StagesTabProps) {
  const [clientApprovalLoading, setClientApprovalLoading] = useState<string | null>(null);
  const [revisionLoading,       setRevisionLoading]       = useState(false);
  const [expandedRounds,        setExpandedRounds]        = useState<Set<number>>(new Set());

  const stages = order.stages || [];
  const maxRound = stages.length > 0 ? Math.max(...stages.map((s) => s.revisionRound ?? 0)) : 0;

  // Group by revisionRound
  const rounds: OrderStage[][] = [];
  for (let r = 0; r <= maxRound; r++) {
    const roundStages = stages.filter((s) => (s.revisionRound ?? 0) === r);
    if (roundStages.length > 0) rounds.push(roundStages);
  }

  // Current round is done when COMPLETED stage in max round is DONE
  const maxRoundStages = stages.filter((s) => (s.revisionRound ?? 0) === maxRound);
  const currentRoundDone = maxRoundStages.every((s) => s.status === "DONE");

  const toggleRound = (round: number) => {
    setExpandedRounds((prev) => {
      const next = new Set(prev);
      if (next.has(round)) next.delete(round); else next.add(round);
      return next;
    });
  };

  const handleClientApproval = async (stageId: string, action: "request" | "approve" | "skip") => {
    setClientApprovalLoading(stageId + action);
    try { await api.toggleClientApproval(order.id, stageId, action); onReload(); }
    catch (err: any) { alert(err.response?.data?.error || "Ошибка"); }
    setClientApprovalLoading(null);
  };

  const handleStartRevision = async () => {
    setRevisionLoading(true);
    try { await api.startRevisionRound(order.id); onReload(); }
    catch (err: any) { alert(err.response?.data?.error || "Ошибка"); }
    setRevisionLoading(false);
  };

  return (
    <div className="space-y-3">
      {/* Quick report shortcut */}
      {canSubmitReport && isParticipant && (
        <div className="p-3 bg-green-500/5 border border-green-500/20 rounded-lg flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-green-400">Ежедневный отчёт</p>
            <p className="text-[10px] text-ink-tertiary">Отправьте отчёт о проделанной работе</p>
          </div>
          <button onClick={onSwitchToReports}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-green-500 text-black font-bold hover:bg-green-400 transition-colors flex-shrink-0">
            <FileText size={12} /> Добавить
          </button>
        </div>
      )}

      {/* Rounds */}
      {rounds.map((roundStages, idx) => {
        const round = roundStages[0]?.revisionRound ?? idx;
        const isCurrentRound = round === maxRound;
        const isDoneRound = roundStages.every((s) => s.status === "DONE");
        const isOldRound = !isCurrentRound;
        // Старые раунды свёрнуты по умолчанию; текущий всегда раскрыт
        const isExpanded = isCurrentRound || expandedRounds.has(round);

        return (
          <div key={round} className={`rounded-xl border overflow-hidden transition-all ${
            isOldRound ? "border-bg-border/30" : "border-bg-border"
          }`}>
            {/* Round header */}
            <div
              className={`px-3 py-2 flex items-center gap-2 ${
                isOldRound
                  ? "bg-bg-raised/20 cursor-pointer hover:bg-bg-raised/40 transition-colors"
                  : "bg-bg-raised border-b border-bg-border"
              }`}
              onClick={isOldRound ? () => toggleRound(round) : undefined}
            >
              {round === 0 ? (
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${isOldRound ? "text-ink-muted" : "text-ink-tertiary"}`}>
                  Основной раунд
                </span>
              ) : (
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${isOldRound ? "text-purple-400/50" : "text-purple-400"}`}>
                  Правка #{round}
                </span>
              )}
              {isDoneRound && <span className={`text-[10px] ${isOldRound ? "text-green-400/50" : "text-green-400"}`}>✓ Завершён</span>}
              {isOldRound && (
                <span className="ml-auto text-[10px] text-ink-muted flex items-center gap-1">
                  {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  {isExpanded ? "Скрыть" : "Показать"}
                </span>
              )}
            </div>

            {/* Stages in this round — скрываем если свёрнут */}
            {isExpanded && <div className={`p-2 space-y-1.5 ${isOldRound ? "pointer-events-none opacity-40" : ""}`}>
              {STAGE_ORDER_LIST.map((name) => {
                const stage = roundStages.find((s) => s.name === name);
                if (!stage) return null;
                const hasSubStage = SUB_STAGE_NAMES[name] && stage.status === "IN_PROGRESS";

                return (
                  <div key={stage.id}>
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-bg-surface border border-bg-border/60">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          stage.status === "DONE" ? "bg-green-500"
                          : stage.status === "IN_PROGRESS" ? "bg-amber-400 pulse-green"
                          : "bg-bg-border"
                        }`} />
                        <div className="min-w-0">
                          <span className="text-sm text-ink-primary">{STAGE_LABELS[stage.name]}</span>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {stage.startedAt && (
                              <span className="flex items-center gap-1 text-[10px] text-ink-tertiary">
                                <Calendar size={9} /> {new Date(stage.startedAt).toLocaleString("ru-RU", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit", timeZone:"Europe/Moscow" })} МСК
                              </span>
                            )}
                            {stage.completedAt && (
                              <span className="flex items-center gap-1 text-[10px] text-green-400">
                                <Check size={9} /> {new Date(stage.completedAt).toLocaleString("ru-RU", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit", timeZone:"Europe/Moscow" })} МСК
                              </span>
                            )}
                            {stage.awaitingClientApproval && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                                ⏳ Ожидание апрува
                              </span>
                            )}
                            {stage.clientApprovedAt && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                                ✓ Клиент одобрил
                              </span>
                            )}
                            {stage.clientApprovalSkipped && (
                              <span className="text-[10px] text-ink-muted">пропущено</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-1 flex-shrink-0">
                        {isCurrentRound && stage.status === "PENDING" && (
                          <button onClick={() => onStageUpdate(stage.id, "IN_PROGRESS")} disabled={loading}
                            className="text-xs px-2.5 py-1 rounded-lg bg-amber-400/10 text-amber-400 border border-amber-400/20 hover:bg-amber-400/20 font-medium transition-colors disabled:opacity-40">
                            Начать
                          </button>
                        )}
                        {isCurrentRound && stage.status === "IN_PROGRESS" && (
                          <button onClick={() => onStageUpdate(stage.id, "DONE")}
                            disabled={loading || (stage.awaitingClientApproval) || (stage.name === "REVIEW" && !canApprove)}
                            title={stage.awaitingClientApproval ? "Ожидается апрув клиента" : stage.name === "REVIEW" && !canApprove ? "Только маркетолог или лид-креатор" : undefined}
                            className="text-xs px-2.5 py-1 rounded-lg bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 font-medium transition-colors disabled:opacity-40">
                            {stage.name === "REVIEW" ? "Утвердить" : "Готово"}
                          </button>
                        )}
                        {isCurrentRound && stage.status === "DONE" && isMarketer && (
                          <button onClick={() => onStageUpdate(stage.id, "PENDING")} disabled={loading}
                            title="Откатить этап"
                            className="p-1 rounded-lg text-ink-muted hover:text-amber-400 hover:bg-amber-400/10 transition-colors disabled:opacity-40">
                            <RotateCcw size={12} />
                          </button>
                        )}
                        {stage.status === "DONE" && !isMarketer && (
                          <span className="text-xs text-green-400 font-medium px-1">✓</span>
                        )}
                      </div>
                    </div>

                    {/* Sub-stage: waiting for client approval */}
                    {hasSubStage && isCurrentRound && (
                      <div className="ml-6 mt-1 p-2 rounded-lg bg-yellow-500/5 border border-yellow-500/15">
                        <p className="text-[10px] font-medium text-yellow-400 mb-1.5">Подэтап: апрув от заказчика</p>
                        {!stage.awaitingClientApproval && !stage.clientApprovedAt && !stage.clientApprovalSkipped && (
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => handleClientApproval(stage.id, "request")}
                              disabled={!!clientApprovalLoading}
                              className="text-[10px] px-2 py-1 rounded-lg bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 hover:bg-yellow-500/20 transition-colors disabled:opacity-40">
                              Отправить на апрув
                            </button>
                            <button
                              onClick={() => handleClientApproval(stage.id, "skip")}
                              disabled={!!clientApprovalLoading}
                              className="text-[10px] px-2 py-1 rounded-lg text-ink-tertiary border border-bg-border hover:bg-bg-raised transition-colors disabled:opacity-40">
                              Пропустить
                            </button>
                          </div>
                        )}
                        {stage.awaitingClientApproval && canApprove && (
                          <button
                            onClick={() => handleClientApproval(stage.id, "approve")}
                            disabled={!!clientApprovalLoading}
                            className="text-[10px] px-2 py-1 rounded-lg bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-colors disabled:opacity-40">
                            ✓ Клиент одобрил
                          </button>
                        )}
                        {stage.awaitingClientApproval && !canApprove && (
                          <p className="text-[10px] text-ink-tertiary">Ждём ответа от клиента...</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>}
          </div>
        );
      })}

      {/* Start revision round button */}
      {isMarketer && currentRoundDone && (
        <button onClick={handleStartRevision} disabled={revisionLoading}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-purple-500/30 text-purple-400 text-sm hover:border-purple-500/60 hover:bg-purple-500/5 transition-colors disabled:opacity-40">
          {revisionLoading
            ? <div className="w-4 h-4 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin" />
            : <Plus size={14} />}
          Клиент дал правки — новый раунд
        </button>
      )}

      {/* Team management */}
      {order.creators && order.creators.filter((c) => isMarketer || c.addedById === user?.id).length > 0 && (
        <div className="mt-2 pt-3 border-t border-bg-border">
          <p className="text-[10px] text-ink-tertiary uppercase tracking-wide mb-2">Управление командой</p>
          {order.creators.filter((c) => isMarketer || c.addedById === user?.id).map((c) => (
            <div key={c.id} className="flex items-center justify-between py-1.5">
              <UserProfileCard userId={c.creatorId} trigger={
                <span className="text-sm text-ink-secondary hover:text-ink-primary cursor-pointer transition-colors">{c.creator.displayName}</span>
              } />
              <button onClick={() => onRemoveCreator(c.creatorId)} className="text-xs text-ink-tertiary hover:text-red-400 transition-colors">Убрать</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FileRow({ file, canDelete, onDeleted }: { file: OrderFile; canDelete: boolean; onDeleted: (id: string) => void }) {
  const [dl,  setDl]  = useState(false);
  const [del, setDel] = useState(false);
  const [tgOk, setTgOk] = useState(false);

  const isTgFile  = !!file.telegramFileId || !!file.telegramMsgId;
  const fileBucket = getFileBucket(file);
  const isTextMsg = fileBucket === "tz" && file.mimeType === "text/plain";

  const handleDl = async () => {
    setDl(true);
    try {
      const res = await api.sendFileToTelegram(file.id);
      setTgOk(true);
      setTimeout(() => setTgOk(false), 3000);
    } catch (e: any) {
      alert(e.response?.data?.error || e.response?.data?.message || "Ошибка");
    }
    setDl(false);
  };

  const handleDlS3 = async () => {
    setDl(true);
    try {
      const url = await api.getDownloadUrl(file.id);
      window.open(url, "_blank");
    } catch (e: any) {
      alert(e.response?.data?.error || e.response?.data?.message || "Ошибка");
    }
    setDl(false);
  };

  const handleDel = async () => {
    if (!confirm(`Удалить «${isTextMsg ? file.fileName.slice(0, 40) : file.fileName}»?`)) return;
    setDel(true);
    try { await api.deleteFile(file.id); onDeleted(file.id); } catch (e: any) { alert(e.response?.data?.error || "Ошибка"); }
    setDel(false);
  };

  const size = file.fileSize > 1048576 ? `${(file.fileSize / 1048576).toFixed(1)} МБ` : `${Math.round(file.fileSize / 1024)} КБ`;

  // Текстовые сообщения ТЗ из бота — отдельный вид
  if (isTextMsg) {
    return (
      <div className="rounded-lg bg-bg-raised border border-bg-border hover:border-bg-hover transition-colors p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0">
            <span className="text-[#229ED9] mt-0.5 flex-shrink-0">💬</span>
            <div className="min-w-0">
              <p className="text-sm text-ink-primary whitespace-pre-wrap break-words leading-relaxed">{file.fileName}</p>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400">ТЗ / текст</span>
                <span className="text-[10px] text-[#229ED9]">TG</span>
                {file.uploadedBy && <span className="text-[10px] text-ink-tertiary">· {file.uploadedBy.displayName}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {tgOk ? (
              <span className="text-[10px] text-green-400 px-2">✓ Отправлено!</span>
            ) : (
              <button onClick={handleDl} disabled={dl} title="Переслать себе в Telegram"
                className="p-1.5 rounded-lg hover:bg-[#229ED9]/10 text-[#229ED9]/60 hover:text-[#229ED9] transition-colors disabled:opacity-40">
                {dl
                  ? <div className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                  : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg>
                }
              </button>
            )}
            {canDelete && (
              <button onClick={handleDel} disabled={del} title="Удалить" className="p-1.5 rounded-lg hover:bg-red-500/10 text-ink-tertiary hover:text-red-400 transition-colors disabled:opacity-40">
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-bg-raised border border-bg-border hover:border-bg-hover transition-colors">
      <div className="flex items-center gap-2.5 min-w-0">
        {isTgFile
          ? <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="text-[#229ED9] flex-shrink-0"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
          : <Paperclip size={13} className="text-ink-tertiary flex-shrink-0" />
        }
        <div className="min-w-0">
          <p className="text-sm text-ink-primary truncate">{file.fileName}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${FILE_BUCKET_COLORS[fileBucket] || FILE_BUCKET_COLORS.other}`}>
              {FILE_BUCKET_LABELS[fileBucket] || file.fileType}
            </span>
            <span className="text-[10px] text-ink-tertiary">{size}</span>
            {isTgFile && <span className="text-[10px] text-[#229ED9]">TG</span>}
            {file.uploadedBy && <span className="text-[10px] text-ink-tertiary">· {file.uploadedBy.displayName}</span>}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        {tgOk ? (
          <span className="text-[10px] text-green-400 px-2">✓ Отправлено!</span>
        ) : (
          <button onClick={isTgFile ? handleDl : handleDlS3} disabled={dl}
            title={isTgFile ? "Получить в Telegram" : "Скачать"}
            className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${
              isTgFile
                ? "hover:bg-[#229ED9]/10 text-[#229ED9]/60 hover:text-[#229ED9]"
                : "hover:bg-bg-hover text-ink-tertiary hover:text-ink-primary"
            }`}>
            {dl
              ? <div className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
              : isTgFile
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg>
                : <Download size={14} />
            }
          </button>
        )}
        {canDelete && (
          <button onClick={handleDel} disabled={del} title="Удалить файл" className="p-1.5 rounded-lg hover:bg-red-500/10 text-ink-tertiary hover:text-red-400 transition-colors disabled:opacity-40">
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
