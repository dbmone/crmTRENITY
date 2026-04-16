/**
 * telegram.service.ts
 * Прямые вызовы Telegram Bot API из бэкенда для хранения файлов в TG.
 * Не требует grammy или отдельного бота — работает через HTTP.
 */
import FormData from "form-data";
import { ProxyAgent } from "proxy-agent";
import { config } from "../config";

const nodeFetch = require("node-fetch") as typeof fetch;

const telegramProxy = config.bot.proxyUrl
  ? new ProxyAgent({ getProxyForUrl: () => config.bot.proxyUrl })
  : null;

function getTG(): string {
  const token = config.bot.token;
  if (!token) throw new Error("BOT_TOKEN не задан в переменных окружения бэкенда");
  return `https://api.telegram.org/bot${token}`;
}

async function tgFetch(input: string, init: RequestInit = {}) {
  return nodeFetch(input as any, {
    ...init,
    agent: telegramProxy as any,
  } as any) as any;
}

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
  formData.append("document", buffer, {
    filename: fileName,
    contentType: mimeType,
  });
  if (caption) formData.append("caption", caption);

  const res  = await tgFetch(`${getTG()}/sendDocument`, {
    method: "POST",
    headers: formData.getHeaders() as any,
    body: formData as any,
  });
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
  const res = await tgFetch(`${getTG()}/copyMessage`, {
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
export async function copyMessageToChat(
  telegramChatId: string,
  fromChatId: string,
  messageId: number
): Promise<void> {
  const res = await tgFetch(`${getTG()}/copyMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: telegramChatId,
      from_chat_id: fromChatId,
      message_id: messageId,
    }),
  });
  const data: any = await res.json();
  if (!data.ok) throw new Error(`Telegram API error: ${data.description}`);
}

export async function sendTextToChat(chatId: string, text: string): Promise<void> {
  const res = await tgFetch(`${getTG()}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
  const data: any = await res.json();
  if (!data.ok) throw new Error(`Telegram API error: ${data.description}`);
}

export async function sendBufferToChat(
  chatId: string,
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  caption?: string
): Promise<void> {
  const method = mimeType.startsWith("image/")
    ? "sendPhoto"
    : mimeType.startsWith("video/")
    ? "sendVideo"
    : "sendDocument";
  const field = method === "sendPhoto" ? "photo" : method === "sendVideo" ? "video" : "document";

  const formData = new FormData();
  formData.append("chat_id", chatId);
  formData.append(field, buffer, {
    filename: fileName,
    contentType: mimeType,
  });
  if (caption) formData.append("caption", caption);

  const res = await tgFetch(`${getTG()}/${method}`, {
    method: "POST",
    headers: formData.getHeaders() as any,
    body: formData as any,
  });
  const data: any = await res.json();
  if (!data.ok) throw new Error(`Telegram API error: ${data.description}`);
}

export async function sendMessageToUser(chatId: string, text: string): Promise<void> {
  await sendTextToChat(chatId, text);
}
