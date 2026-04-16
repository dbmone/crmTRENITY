import { PrismaClient } from "@prisma/client";
import { config } from "../config";
import { copyMessageToChat, sendBufferToChat, sendTextToChat } from "./telegram.service";
import {
  getTelegramUserbotClient,
  isTelegramUserbotEnabled,
  resolveTelegramInputUser,
} from "./telegram-userbot.service";

const prisma = new PrismaClient();
const { Api } = require("telegram");

function groupTitleForOrder(orderTitle: string): string {
  const clean = orderTitle.trim().slice(0, 80);
  return `TRENITY | ${clean}`;
}

function escMd(text: string): string {
  return text.replace(/([_*`\[\]])/g, "\\$1");
}

function isKnownInviteError(message: string): boolean {
  return [
    "USER_ALREADY_PARTICIPANT",
    "USER_PRIVACY_RESTRICTED",
    "PEER_FLOOD",
    "CHAT_ADMIN_REQUIRED",
    "USERS_TOO_MUCH",
  ].some((code) => message.includes(code));
}

async function exportInviteLink(client: any, chatEntity: any): Promise<string | null> {
  try {
    const invite = await client.invoke(new Api.messages.ExportChatInvite({ peer: chatEntity }));
    return invite?.link || null;
  } catch {
    return null;
  }
}

async function addBotToChat(client: any, chatEntity: any) {
  const username = config.bot.username?.replace(/^@/, "").trim();
  if (!username) return;

  try {
    const botEntity = await client.getInputEntity(username);
    await client.invoke(new Api.messages.StartBot({
      bot: botEntity,
      peer: chatEntity,
      startParam: "crm-order-group",
      randomId: BigInt(Date.now()),
    }));
  } catch (err: any) {
    const message = String(err?.message || "");
    if (!isKnownInviteError(message)) {
      console.warn("Telegram order group: failed to add bot:", message);
    }
  }
}

async function addUserToChat(client: any, chatEntity: any, participant: any): Promise<boolean> {
  const entity = await resolveTelegramInputUser(client, participant);
  if (!entity) return false;

  try {
    await client.invoke(new Api.messages.AddChatUser({
      chatId: Number(chatEntity.chatId ?? chatEntity.id ?? 0),
      userId: entity,
      fwdLimit: 10,
    }));
    return true;
  } catch (err: any) {
    const message = String(err?.message || "");
    if (!isKnownInviteError(message)) {
      console.warn(`Telegram order group: failed to add ${participant.displayName}:`, message);
    }
    return false;
  }
}

async function sendInviteFallback(inviteLink: string | null, participant: any, orderTitle: string) {
  if (!inviteLink || !participant.chatId) return;

  try {
    await sendTextToChat(
      participant.chatId.toString(),
      `Создана группа по заказу *${escMd(orderTitle)}*.\n\nВойти: ${inviteLink}`
    );
  } catch {}
}

export async function ensureOrderTelegramGroup(orderId: string) {
  if (!isTelegramUserbotEnabled()) return null;

  const existing = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, telegramGroupChatId: true },
  });
  if (!existing) return null;
  if (existing.telegramGroupChatId) return existing;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      marketer: {
        select: {
          id: true,
          displayName: true,
          telegramUsername: true,
          telegramId: true,
          chatId: true,
        },
      },
      creators: {
        include: {
          creator: {
            select: {
              id: true,
              displayName: true,
              telegramUsername: true,
              telegramId: true,
              chatId: true,
            },
          },
        },
      },
      files: {
        select: {
          id: true,
          fileName: true,
          telegramChatId: true,
          telegramMsgId: true,
        },
        orderBy: { uploadedAt: "asc" },
        take: 5,
      },
      comments: {
        include: { author: { select: { displayName: true } } },
        orderBy: { createdAt: "asc" },
        take: 5,
      },
    },
  });
  if (!order || order.telegramGroupChatId) return order;

  const client = await getTelegramUserbotClient();
  if (!client) return order;

  const participants = [order.marketer, ...order.creators.map((c) => c.creator)]
    .filter(Boolean)
    .filter((participant, index, all) => all.findIndex((item) => item.id === participant.id) === index);

  const inviteUsers = [];
  for (const participant of participants) {
    const entity = await resolveTelegramInputUser(client, participant);
    if (entity) inviteUsers.push(entity);
  }

  if (inviteUsers.length === 0) {
    console.warn(`Telegram order group: no resolvable members for order ${order.id}`);
    return order;
  }

  const result = await client.invoke(new Api.messages.CreateChat({
    users: inviteUsers,
    title: groupTitleForOrder(order.title),
  }));

  const createdChat = result?.chats?.[0];
  if (!createdChat?.id) {
    console.warn(`Telegram order group: Telegram did not return chat id for ${order.id}`);
    return order;
  }

  const rawChatId = BigInt(createdChat.id.toString());
  const botChatId = -rawChatId;
  const chatEntity = await client.getInputEntity(createdChat);

  await addBotToChat(client, chatEntity);
  const inviteLink = await exportInviteLink(client, chatEntity);

  const updatedOrder = await prisma.order.update({
    where: { id: order.id },
    data: {
      telegramGroupChatId: botChatId,
      telegramGroupTitle: createdChat.title || groupTitleForOrder(order.title),
      telegramGroupInviteLink: inviteLink,
      telegramGroupCreatedAt: new Date(),
    },
  });

  await sendTextToChat(
    botChatId.toString(),
    [
      `*${escMd(order.title)}*`,
      order.description ? escMd(order.description) : "_Без описания_",
      order.deadline ? `Дедлайн: ${order.deadline.toLocaleDateString("ru-RU")}` : "Дедлайн: не задан",
      "",
      "Команды для бота в группе:",
      "- бот, скинь ТЗ",
      "- бот, покажи дедлайны",
      "- бот, покажи статус",
      "- бот, тегни всех",
    ].join("\n")
  ).catch(() => {});

  for (const comment of order.comments) {
    await sendTextToChat(botChatId.toString(), `💬 ${escMd(comment.author.displayName)}: ${escMd(comment.text)}`).catch(() => {});
  }

  for (const file of order.files) {
    if (file.telegramChatId && file.telegramMsgId) {
      await copyMessageToChat(botChatId.toString(), file.telegramChatId, file.telegramMsgId).catch(() => {});
    }
  }

  for (const participant of participants) {
    await sendInviteFallback(inviteLink, participant, order.title);
  }

  return updatedOrder;
}

export async function syncOrderTelegramParticipants(orderId: string) {
  if (!isTelegramUserbotEnabled()) return;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      marketer: {
        select: {
          id: true,
          displayName: true,
          telegramUsername: true,
          telegramId: true,
          chatId: true,
        },
      },
      creators: {
        include: {
          creator: {
            select: {
              id: true,
              displayName: true,
              telegramUsername: true,
              telegramId: true,
              chatId: true,
            },
          },
        },
      },
    },
  });
  if (!order) return;

  if (!order.telegramGroupChatId) {
    await ensureOrderTelegramGroup(orderId);
    return;
  }

  const client = await getTelegramUserbotClient();
  if (!client) return;

  const groupId = Number((-order.telegramGroupChatId).toString());
  const chatEntity = await client.getInputEntity(groupId);
  const participants = [order.marketer, ...order.creators.map((c) => c.creator)]
    .filter(Boolean)
    .filter((participant, index, all) => all.findIndex((item) => item.id === participant.id) === index);

  for (const participant of participants) {
    const added = await addUserToChat(client, chatEntity, participant);
    if (!added) {
      await sendInviteFallback(order.telegramGroupInviteLink, participant, order.title);
    }
  }
}

async function getOrderGroupChatId(orderId: string): Promise<string | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { telegramGroupChatId: true },
  });
  return order?.telegramGroupChatId ? order.telegramGroupChatId.toString() : null;
}

export async function mirrorCommentToOrderGroup(orderId: string, authorName: string, text: string) {
  const chatId = await getOrderGroupChatId(orderId);
  if (!chatId) return;
  await sendTextToChat(chatId, `💬 *${escMd(authorName)}*\n${escMd(text)}`);
}

export async function mirrorTextNoteToOrderGroup(orderId: string, authorName: string, text: string, isTz = false) {
  const chatId = await getOrderGroupChatId(orderId);
  if (!chatId) return;
  const prefix = isTz ? "📝 ТЗ" : "📝";
  await sendTextToChat(chatId, `${prefix} от *${escMd(authorName)}*\n${escMd(text)}`);
}

export async function mirrorStoredTelegramMessageToOrderGroup(orderId: string, fromChatId: string, messageId: number) {
  const chatId = await getOrderGroupChatId(orderId);
  if (!chatId) return;
  await copyMessageToChat(chatId, fromChatId, messageId);
}

export async function mirrorBufferFileToOrderGroup(
  orderId: string,
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  caption?: string
) {
  const chatId = await getOrderGroupChatId(orderId);
  if (!chatId) return;
  await sendBufferToChat(chatId, buffer, fileName, mimeType, caption);
}

export async function startOrderGroupSyncLoop() {
  if (!isTelegramUserbotEnabled()) {
    console.log("Telegram order group sync disabled: userbot is not configured");
    return;
  }

  const run = async () => {
    const missing = await prisma.order.findMany({
      where: {
        status: { not: "ARCHIVED" },
        telegramGroupChatId: null,
      },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: 10,
    });

    for (const order of missing) {
      await ensureOrderTelegramGroup(order.id);
    }
  };

  await run().catch((err) => console.warn("Telegram order group initial sync failed:", err.message));
  setInterval(() => {
    void run().catch((err) => console.warn("Telegram order group sync failed:", err.message));
  }, 60_000);

  console.log("Telegram order group sync loop started");
}
