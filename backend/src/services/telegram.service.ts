/**
 * telegram.service.ts
 * Прямые вызовы Telegram Bot API из бэкенда для хранения файлов в TG.
 * Не требует grammy или отдельного бота — работает через HTTP.
 */
import FormData from "form-data";
import { ProxyAgent } from "proxy-agent";
import { config } from "../config";
import {
  isTelegramUserbotEnabled,
  uploadBufferToTelegramChatViaUserbot,
} from "./telegram-userbot.service";

const nodeFetch = require("node-fetch") as typeof fetch;

const telegramProxy = config.bot.proxyUrl
  ? new ProxyAgent({ getProxyForUrl: () => config.bot.proxyUrl })
  : null;

function getBotApiBase(): string {
  return config.bot.apiBaseUrl.replace(/\/+$/, "");
}

function getTG(): string {
  const token = config.bot.token;
  if (!token) throw new Error("BOT_TOKEN не задан в переменных окружения бэкенда");
  return `${getBotApiBase()}/bot${token}`;
}

function getTGFileBase(): string {
  const token = config.bot.token;
  if (!token) throw new Error("BOT_TOKEN не задан в переменных окружения бэкенда");
  return `${getBotApiBase()}/file/bot${token}`;
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

function extractTelegramUploadMeta(result: any, fallbackChatId: string) {
  const media =
    result?.document
    || result?.video
    || result?.audio
    || result?.voice
    || (Array.isArray(result?.photo) ? result.photo[result.photo.length - 1] : null);

  return {
    fileId: media?.file_id || null,
    messageId: Number(result?.message_id || 0),
    chatId: String(result?.chat?.id || fallbackChatId),
  };
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

  const uploadViaUserbot = async (): Promise<TgUploadResult> => {
    const uploaded = await uploadBufferToTelegramChatViaUserbot(storageChatId, buffer, fileName, mimeType, caption);
    return {
      fileId: uploaded.fileId || "",
      messageId: uploaded.messageId,
      chatId: uploaded.chatId,
    };
  };

  if (isTelegramUserbotEnabled() && buffer.length >= 45 * 1024 * 1024) {
    return uploadViaUserbot();
  }

  try {
    const formData = new FormData();
    formData.append("chat_id", storageChatId);
    formData.append("document", buffer, {
      filename: fileName,
      contentType: mimeType,
    });
    if (caption) formData.append("caption", caption);

    // Таймаут 3 мин для больших файлов; если TG не ответит — бросаем ошибку
    const abortCtrl = new AbortController();
    const timeoutId = setTimeout(() => abortCtrl.abort(), 3 * 60 * 1000);
    let res: any;
    try {
      res = await tgFetch(`${getTG()}/sendDocument`, {
        method: "POST",
        headers: formData.getHeaders() as any,
        body: formData as any,
        signal: abortCtrl.signal as any,
      });
    } finally {
      clearTimeout(timeoutId);
    }
    const data: any = await res.json();
    if (!data.ok) throw new Error(`Telegram API error: ${data.description}`);

    const uploaded = extractTelegramUploadMeta(data.result, storageChatId);
    if (!uploaded.messageId) {
      throw new Error("Telegram API error: upload response has no message id");
    }

    if (!uploaded.fileId && isTelegramUserbotEnabled()) {
      return uploadViaUserbot();
    }

    return {
      fileId: uploaded.fileId || "",
      messageId: uploaded.messageId,
      chatId: uploaded.chatId,
    };
  } catch (err) {
    if (!isTelegramUserbotEnabled()) throw err;
    return uploadViaUserbot();
  }
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

export async function getTelegramFileStream(fileId: string): Promise<{
  stream: NodeJS.ReadableStream;
  contentType: string | null;
  contentLength: number | null;
}> {
  const metaRes = await tgFetch(`${getTG()}/getFile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId }),
  });
  const meta: any = await metaRes.json();
  if (!meta.ok || !meta.result?.file_path) {
    throw new Error(`Telegram API error: ${meta.description || "getFile failed"}`);
  }

  const downloadUrl = `${getTGFileBase()}/${meta.result.file_path}`;
  const fileRes: any = await tgFetch(downloadUrl, { method: "GET" });
  if (!fileRes.ok || !fileRes.body) {
    throw new Error(`Telegram file download failed: ${fileRes.status}`);
  }

  const lengthHeader = fileRes.headers?.get?.("content-length");
  return {
    stream: fileRes.body,
    contentType: fileRes.headers?.get?.("content-type") || null,
    contentLength: lengthHeader ? Number(lengthHeader) : null,
  };
}
