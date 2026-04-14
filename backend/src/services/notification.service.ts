import { PrismaClient, NotificationType } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Создать уведомление в очереди.
 * Telegram-бот будет забирать и отправлять.
 */
export async function createNotification(
  userId: string,
  type: NotificationType,
  message: string,
  orderId?: string
) {
  return prisma.notification.create({
    data: {
      userId,
      orderId,
      type,
      message,
    },
  });
}

/**
 * Получить неотправленные уведомления
 */
export async function getPendingNotifications(limit: number = 50) {
  return prisma.notification.findMany({
    where: { isSent: false },
    include: {
      user: { select: { chatId: true, displayName: true, telegramUsername: true } },
      order: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}

/**
 * Пометить уведомление как отправленное
 */
export async function markAsSent(id: string) {
  return prisma.notification.update({
    where: { id },
    data: { isSent: true, sentAt: new Date() },
  });
}

// ==================== Хелперы для типовых уведомлений ====================

export async function notifyNewOrder(orderId: string, title: string) {
  // Уведомляем всех активных креаторов
  const creators = await prisma.user.findMany({
    where: { role: { in: ["CREATOR", "LEAD_CREATOR"] }, isActive: true },
    select: { id: true },
  });

  for (const creator of creators) {
    await createNotification(
      creator.id,
      NotificationType.NEW_ORDER,
      `📋 Новый заказ: «${title}»`,
      orderId
    );
  }
}

export async function notifyAssigned(
  orderId: string,
  creatorId: string,
  orderTitle: string
) {
  await createNotification(
    creatorId,
    NotificationType.ASSIGNED,
    `✅ Вы назначены на заказ: «${orderTitle}»`,
    orderId
  );
}

export async function notifyStageChanged(
  orderId: string,
  orderTitle: string,
  stageName: string,
  recipientIds: string[]
) {
  for (const userId of recipientIds) {
    await createNotification(
      userId,
      NotificationType.STAGE_CHANGED,
      `🔄 Этап «${stageName}» изменён в заказе «${orderTitle}»`,
      orderId
    );
  }
}

export async function notifyReviewRequest(
  orderId: string,
  orderTitle: string,
  reviewerId: string
) {
  await createNotification(
    reviewerId,
    NotificationType.REVIEW_REQUEST,
    `👀 Заказ «${orderTitle}» отправлен вам на проверку`,
    orderId
  );
}

export async function notifyOrderApproved(
  orderId: string,
  orderTitle: string,
  creatorIds: string[]
) {
  for (const creatorId of creatorIds) {
    await createNotification(
      creatorId,
      NotificationType.ORDER_APPROVED,
      `🎉 Заказ «${orderTitle}» утверждён!`,
      orderId
    );
  }
}
