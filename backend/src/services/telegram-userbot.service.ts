import { config } from "../config";

const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");

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

async function createClient() {
  const session = new StringSession(config.telegramUserbot.session);
  const client = new TelegramClient(session, config.telegramUserbot.apiId, config.telegramUserbot.apiHash, {
    connectionRetries: 5,
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
