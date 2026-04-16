import { useEffect, useState } from "react";
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
  if (file.fileType === "TZ" || file.mimeType === "text/plain") return "tz";
  if (file.fileType === "CONTRACT") return "contract";
  if (file.fileType === "STORYBOARD") return "storyboard";
  if (file.fileType === "VIDEO_DRAFT" || file.fileType === "VIDEO_FINAL") return "video";
  return "other";
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
  const [dl, setDl] = useState(false);
  const [del, setDel] = useState(false);
  const [tgOk, setTgOk] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const isTgFile = !!file.telegramFileId || !!file.telegramMsgId;
  const fileBucket = getFileBucket(file);
  const isTextMsg = fileBucket === "tz" && file.mimeType === "text/plain";
  const isImagePreview = file.mimeType?.startsWith("image/");
  const isVideoPreview = file.mimeType?.startsWith("video/");
  const isAudioPreview = file.mimeType?.startsWith("audio/");
  const canPreview = isImagePreview || isVideoPreview || isAudioPreview;

  useEffect(() => {
    if (!previewOpen || previewUrl || !canPreview) return;
    let disposed = false;
    let objectUrl: string | null = null;

    (async () => {
      setPreviewLoading(true);
      try {
        const blob = await api.getFileContent(file.id);
        if (disposed) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      } catch (e: any) {
        if (!disposed) {
          alert(e.response?.data?.error || e.response?.data?.message || "Не удалось загрузить превью");
          setPreviewOpen(false);
        }
      } finally {
        if (!disposed) setPreviewLoading(false);
      }
    })();

    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [previewOpen, previewUrl, canPreview, file.id]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleDl = async () => {
    setDl(true);
    try {
      await api.sendFileToTelegram(file.id);
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
    try {
      await api.deleteFile(file.id);
      onDeleted(file.id);
    } catch (e: any) {
      alert(e.response?.data?.error || "Ошибка");
    }
    setDel(false);
  };

  const size = file.fileSize > 1048576 ? `${(file.fileSize / 1048576).toFixed(1)} МБ` : `${Math.round(file.fileSize / 1024)} КБ`;

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
              <span className="text-[10px] text-green-400 px-2">Отправлено</span>
            ) : (
              <button
                onClick={handleDl}
                disabled={dl}
                title="Переслать себе в Telegram"
                className="p-1.5 rounded-lg hover:bg-[#229ED9]/10 text-[#229ED9]/60 hover:text-[#229ED9] transition-colors disabled:opacity-40"
              >
                {dl ? (
                  <div className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13" /><path d="M22 2L15 22 11 13 2 9l20-7z" /></svg>
                )}
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
    <div className="rounded-lg bg-bg-raised border border-bg-border hover:border-bg-hover transition-colors p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {isTgFile ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="text-[#229ED9] flex-shrink-0"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" /></svg>
          ) : (
            <Paperclip size={13} className="text-ink-tertiary flex-shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-sm text-ink-primary truncate">{file.fileName}</p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
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
          {canPreview && (
            <button
              onClick={() => setPreviewOpen((value) => !value)}
              className="px-2.5 py-1 rounded-lg border border-bg-border text-[11px] text-ink-tertiary hover:text-ink-primary hover:border-bg-hover transition-colors"
            >
              {previewOpen ? "Скрыть" : "Превью"}
            </button>
          )}
          {tgOk ? (
            <span className="text-[10px] text-green-400 px-2">Отправлено</span>
          ) : (
            <button
              onClick={isTgFile ? handleDl : handleDlS3}
              disabled={dl}
              title={isTgFile ? "Получить в Telegram" : "Скачать"}
              className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${
                isTgFile ? "hover:bg-[#229ED9]/10 text-[#229ED9]/60 hover:text-[#229ED9]" : "hover:bg-bg-hover text-ink-tertiary hover:text-ink-primary"
              }`}
            >
              {dl ? (
                <div className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
              ) : isTgFile ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13" /><path d="M22 2L15 22 11 13 2 9l20-7z" /></svg>
              ) : (
                <Download size={14} />
              )}
            </button>
          )}
          {canDelete && (
            <button onClick={handleDel} disabled={del} title="Удалить файл" className="p-1.5 rounded-lg hover:bg-red-500/10 text-ink-tertiary hover:text-red-400 transition-colors disabled:opacity-40">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {previewOpen && canPreview && (
        <div className="mt-3 rounded-lg border border-bg-border bg-bg-base/60 p-2">
          {previewLoading && !previewUrl ? (
            <div className="flex items-center justify-center py-8 text-xs text-ink-tertiary">Загружаю превью...</div>
          ) : previewUrl ? (
            isImagePreview ? (
              <img src={previewUrl} alt={file.fileName} className="w-full max-h-80 object-contain rounded-lg bg-black/20" />
            ) : isVideoPreview ? (
              <video src={previewUrl} controls preload="metadata" className="w-full max-h-80 rounded-lg bg-black" />
            ) : (
              <audio src={previewUrl} controls preload="metadata" className="w-full" />
            )
          ) : null}
        </div>
      )}
    </div>
  );
}
