/**
 * telegram.service.ts
 * Прямые вызовы Telegram Bot API из бэкенда для хранения файлов в TG.
 * Не требует grammy или отдельного бота — работает через HTTP.
 */
import { config } from "../config";

const TG = `https://api.telegram.org/bot${config.bot.token}`;

export interface TgUploadResult {
  fileId:    string;
  messageId: number;
  chatId:    string;
}

// Загрузить файл в канал-хранилище
export async function uploadFileToStorage(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  caption?: string
): Promise<TgUploadResult> {
  const storageChatId = config.bot.storageChatId;
  if (!storageChatId) throw new Error("TELEGRAM_STORAGE_CHAT_ID не задан");

  // Формируем multipart/form-data вручную через Blob API (Node.js 18+)
  const formData = new FormData();
  formData.append("chat_id", storageChatId);
  formData.append("document",
    new Blob([buffer], { type: mimeType }),
    fileName
  );
  if (caption) formData.append("caption", caption);

  const res  = await fetch(`${TG}/sendDocument`, { method: "POST", body: formData });
  const data: any = await res.json();
  if (!data.ok) throw new Error(`Telegram API error: ${data.description}`);

  const doc = data.result.document;
  return {
    fileId:    doc.file_id,
    messageId: data.result.message_id,
    chatId:    storageChatId,
  };
}

// Переслать файл из хранилища в чат пользователя
export async function forwardFileToUser(
  telegramChatId: string,   // куда пересылаем (chatId пользователя)
  fromChatId: string,       // откуда (хранилище)
  messageId: number
): Promise<void> {
  const res = await fetch(`${TG}/copyMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id:      telegramChatId,
      from_chat_id: fromChatId,
      message_id:   messageId,
    }),
  });
  const data: any = await res.json();
  if (!data.ok) throw new Error(`Telegram API error: ${data.description}`);
}

// Отправить текстовое уведомление пользователю
export async function sendMessageToUser(chatId: string, text: string): Promise<void> {
  await fetch(`${TG}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
}
