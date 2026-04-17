import { config } from "../config";

const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { CustomFile } = require("telegram/client/uploads");

let clientPromise: Promise<any> | null = null;

function isConfigured(): boolean {
  return Boolean(
    config.telegramUserbot.apiId &&
    config.telegramUserbot.apiHash &&
    config.telegramUserbot.session
  );
}

export function isTelegramUserbotEnabled(): boolean {
  return isConfigured();
}

function buildUserbotProxy() {
  if (!config.bot.proxyUrl) return undefined;

  try {
    const parsed = new URL(config.bot.proxyUrl);
    const protocol = parsed.protocol.replace(":", "").toLowerCase();
    const socksType = protocol === "socks4" ? 4 : 5;

    return {
      ip: parsed.hostname,
      port: Number(parsed.port || 1080),
      socksType,
      username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
      timeout: 8,
    };
  } catch {
    return undefined;
  }
}

async function createClient() {
  const session = new StringSession(config.telegramUserbot.session);
  const client = new TelegramClient(session, config.telegramUserbot.apiId, config.telegramUserbot.apiHash, {
    connectionRetries: 5,
    proxy: buildUserbotProxy(),
  });
  await client.connect();
  return client;
}

export async function getTelegramUserbotClient(): Promise<any | null> {
  if (!isConfigured()) return null;
  if (!clientPromise) {
    clientPromise = createClient().catch((err) => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

export async function resolveTelegramInputUser(client: any, participant: {
  telegramUsername?: string | null;
  telegramId?: bigint | null;
}) {
  const username = participant.telegramUsername?.replace(/^@/, "").trim();
  if (username) {
    return client.getInputEntity(username);
  }

  if (participant.telegramId) {
    try {
      return await client.getInputEntity(participant.telegramId.toString());
    } catch {
      return null;
    }
  }

  return null;
}

export async function uploadBufferToTelegramChatViaUserbot(
  chatId: string,
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  caption?: string
): Promise<{ messageId: number; chatId: string; fileId: string | null }> {
  const client = await getTelegramUserbotClient();
  if (!client) {
    throw new Error("Telegram userbot is not configured");
  }

  const entity = await client.getInputEntity(chatId);
  const file = new CustomFile(fileName, buffer.length, "", buffer);
  const sent = await client.sendFile(entity, {
    file,
    caption,
    forceDocument: !(mimeType.startsWith("image/") || mimeType.startsWith("video/")),
    supportsStreaming: mimeType.startsWith("video/"),
    workers: 1,
  });

  const message = Array.isArray(sent) ? sent[0] : sent;
  return {
    messageId: Number(message?.id),
    chatId,
    fileId: null,
  };
}

export async function downloadTelegramMessageMediaViaUserbot(
  chatId: string,
  messageId: number
): Promise<{ buffer: Buffer; contentType: string | null }> {
  const client = await getTelegramUserbotClient();
  if (!client) {
    throw new Error("Telegram userbot is not configured");
  }

  const result = await client.getMessages(chatId, { ids: [messageId] });
  const message = Array.isArray(result) ? result[0] : result;
  if (!message) {
    throw new Error("Telegram message not found");
  }

  const downloaded = await client.downloadMedia(message, {});
  if (!downloaded || !Buffer.isBuffer(downloaded)) {
    throw new Error("Telegram media download failed");
  }

  const documentMime =
    message?.document?.mimeType
    || message?.media?.document?.mimeType
    || null;
  const contentType = message?.photo ? "image/jpeg" : documentMime;

  return {
    buffer: downloaded,
    contentType,
  };
}
