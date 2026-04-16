import { useState } from "react";
import { Download, Paperclip, Trash2 } from "lucide-react";
import * as api from "../../api/client";
import { OrderFile } from "../../types";

type FileBucket = "tz" | "contract" | "storyboard" | "video" | "other";

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

function getFileBucket(file: Pick<OrderFile, "fileType" | "mimeType">): FileBucket {
  const ft = file.fileType?.toUpperCase();
  if (ft === "TZ" || file.mimeType === "text/plain") return "tz";
  if (ft === "CONTRACT") return "contract";
  if (ft === "STORYBOARD") return "storyboard";
  if (ft === "VIDEO_DRAFT" || ft === "VIDEO_FINAL") return "video";
  return "other";
}

function formatFileSize(size: number) {
  if (size > 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} МБ`;
  return `${Math.max(1, Math.round(size / 1024))} КБ`;
}

function getExtension(fileName: string) {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() || "" : "";
}

function isImageFile(file: Pick<OrderFile, "fileName" | "mimeType">) {
  const ext = getExtension(file.fileName);
  return file.mimeType?.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif", "bmp"].includes(ext);
}

function isVideoFile(file: Pick<OrderFile, "fileName" | "mimeType">) {
  const ext = getExtension(file.fileName);
  return file.mimeType?.startsWith("video/") || ["mp4", "mov", "webm", "mkv", "avi", "m4v"].includes(ext);
}

function isAudioFile(file: Pick<OrderFile, "fileName" | "mimeType">) {
  const ext = getExtension(file.fileName);
  const mime = (file.mimeType || "").toLowerCase();
  return mime.startsWith("audio/")
    || mime.includes("ogg")
    || mime.includes("mpeg")
    || mime.includes("wav")
    || mime.includes("mp4")
    || ["ogg", "oga", "opus", "mp3", "wav", "m4a", "aac", "webm"].includes(ext);
}

export default function OrderFileRow({
  file,
  canDelete,
  onDeleted,
}: {
  file: OrderFile;
  canDelete: boolean;
  onDeleted: (id: string) => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sentToTelegram, setSentToTelegram] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  const isTelegramFile = !!file.telegramFileId || !!file.telegramMsgId;
  const fileBucket = getFileBucket(file);
  const isTextTz = fileBucket === "tz" && file.mimeType === "text/plain";
  const isImagePreview = isImageFile(file);
  const isVideoPreview = isVideoFile(file);
  const isAudioPreview = isAudioFile(file);
  const canPreview = isImagePreview || isVideoPreview || isAudioPreview;
  const previewUrl = canPreview ? api.getFileStreamUrl(file.id) : null;

  const handleSendToTelegram = async () => {
    setDownloading(true);
    try {
      await api.sendFileToTelegram(file.id);
      setSentToTelegram(true);
      setTimeout(() => setSentToTelegram(false), 3000);
    } catch (e: any) {
      alert(e.response?.data?.error || e.response?.data?.message || "Ошибка");
    } finally {
      setDownloading(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const url = await api.getDownloadUrl(file.id);
      window.open(url, "_blank");
    } catch (e: any) {
      alert(e.response?.data?.error || e.response?.data?.message || "Ошибка");
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Удалить «${isTextTz ? file.fileName.slice(0, 40) : file.fileName}»?`)) return;
    setDeleting(true);
    try {
      await api.deleteFile(file.id);
      onDeleted(file.id);
    } catch (e: any) {
      alert(e.response?.data?.error || "Ошибка");
    } finally {
      setDeleting(false);
    }
  };

  if (isTextTz) {
    return (
      <div className="rounded-lg bg-bg-raised border border-bg-border hover:border-bg-hover transition-colors p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0">
            <span className="text-[#229ED9] mt-0.5 flex-shrink-0">💬</span>
            <div className="min-w-0">
              <p className="text-sm text-ink-primary whitespace-pre-wrap break-words leading-relaxed">{file.fileName}</p>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400">
                  ТЗ / текст
                </span>
                <span className="text-[10px] text-[#229ED9]">TG</span>
                {file.uploadedBy && <span className="text-[10px] text-ink-tertiary">• {file.uploadedBy.displayName}</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {sentToTelegram ? (
              <span className="text-[10px] text-green-400 px-2">Отправлено</span>
            ) : (
              <button
                onClick={handleSendToTelegram}
                disabled={downloading}
                title="Переслать себе в Telegram"
                className="p-1.5 rounded-lg hover:bg-[#229ED9]/10 text-[#229ED9]/60 hover:text-[#229ED9] transition-colors disabled:opacity-40"
              >
                {downloading ? (
                  <div className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 2L11 13" />
                    <path d="M22 2L15 22 11 13 2 9l20-7z" />
                  </svg>
                )}
              </button>
            )}
            {canDelete && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                title="Удалить"
                className="p-1.5 rounded-lg hover:bg-red-500/10 text-ink-tertiary hover:text-red-400 transition-colors disabled:opacity-40"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-bg-raised border border-bg-border hover:border-bg-hover transition-colors p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {isTelegramFile ? (
            <span className="text-[#229ED9] text-xs font-bold flex-shrink-0">TG</span>
          ) : (
            <Paperclip size={13} className="text-ink-tertiary flex-shrink-0" />
          )}

          <div className="min-w-0">
            <p className="text-sm text-ink-primary truncate">{file.fileName}</p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${FILE_BUCKET_COLORS[fileBucket]}`}>
                {FILE_BUCKET_LABELS[fileBucket]}
              </span>
              <span className="text-[10px] text-ink-tertiary">{formatFileSize(file.fileSize)}</span>
              {isTelegramFile && <span className="text-[10px] text-[#229ED9]">TG</span>}
              {file.uploadedBy && <span className="text-[10px] text-ink-tertiary">• {file.uploadedBy.displayName}</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {canPreview && (
            <button
              onClick={() => setPreviewOpen((value) => !value)}
              className="px-2.5 py-1 rounded-lg border border-bg-border text-[11px] text-ink-tertiary hover:text-ink-primary hover:border-bg-hover transition-colors"
            >
              {previewOpen ? "Скрыть" : "Превью"}
            </button>
          )}

          {sentToTelegram ? (
            <span className="text-[10px] text-green-400 px-2">Отправлено</span>
          ) : (
            <button
              onClick={isTelegramFile ? handleSendToTelegram : handleDownload}
              disabled={downloading}
              title={isTelegramFile ? "Получить в Telegram" : "Скачать"}
              className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${
                isTelegramFile
                  ? "hover:bg-[#229ED9]/10 text-[#229ED9]/60 hover:text-[#229ED9]"
                  : "hover:bg-bg-hover text-ink-tertiary hover:text-ink-primary"
              }`}
            >
              {downloading ? (
                <div className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
              ) : isTelegramFile ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 2L11 13" />
                  <path d="M22 2L15 22 11 13 2 9l20-7z" />
                </svg>
              ) : (
                <Download size={14} />
              )}
            </button>
          )}

          {canDelete && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              title="Удалить файл"
              className="p-1.5 rounded-lg hover:bg-red-500/10 text-ink-tertiary hover:text-red-400 transition-colors disabled:opacity-40"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {previewOpen && canPreview && (
        <div className="mt-3 rounded-lg border border-bg-border bg-bg-base/60 p-2">
          {isVideoPreview ? (
            <video
              src={previewUrl!}
              controls
              preload="metadata"
              className="w-full max-h-80 rounded-lg bg-black"
              onLoadStart={() => setPreviewLoading(true)}
              onLoadedData={() => setPreviewLoading(false)}
              onError={() => alert("Не удалось воспроизвести видео")}
            />
          ) : isAudioPreview ? (
            <audio
              src={previewUrl!}
              controls
              preload="metadata"
              className="w-full"
              onLoadStart={() => setPreviewLoading(true)}
              onLoadedData={() => setPreviewLoading(false)}
              onError={() => alert("Не удалось воспроизвести аудио")}
            />
          ) : previewLoading ? (
            <div className="flex items-center justify-center py-8 text-xs text-ink-tertiary">Загружаю превью...</div>
          ) : previewUrl ? (
            <img
              src={previewUrl}
              alt={file.fileName}
              className="w-full max-h-80 object-contain rounded-lg bg-black/20"
              onLoadStart={() => setPreviewLoading(true)}
              onLoad={() => setPreviewLoading(false)}
              onError={() => {
                setPreviewLoading(false);
                alert("Не удалось загрузить превью");
              }}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
