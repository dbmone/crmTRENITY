import { PrismaClient, NotificationType } from "@prisma/client";

const prisma = new PrismaClient();

export async function createNotification(
  userId: string,
  type: NotificationType,
  message: string,
  orderId?: string
) {
  return prisma.notification.create({
    data: { userId, orderId, type, message },
  });
}

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

export async function markAsSent(id: string) {
  return prisma.notification.update({
    where: { id },
    data: { isSent: true, sentAt: new Date() },
  });
}

// Получить уведомления пользователя (для фронта)
export async function getUserNotifications(userId: string, page: number = 1, limit: number = 20) {
  const skip = (page - 1) * limit;
  const [items, total, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      include: { order: { select: { id: true, title: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.notification.count({ where: { userId } }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);
  return { items, total, unread, page, limit };
}

export async function markAsRead(id: string, userId: string) {
  return prisma.notification.update({
    where: { id, userId },
    data: { isRead: true },
  });
}

export async function markAllAsRead(userId: string) {
  return prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
}

// ==================== Хелперы ====================

export async function notifyNewOrder(orderId: string, title: string) {
  const creators = await prisma.user.findMany({
    where: { role: { in: ["CREATOR", "LEAD_CREATOR"] }, status: "APPROVED", isActive: true },
    select: { id: true },
  });
  for (const c of creators) {
    await createNotification(c.id, NotificationType.NEW_ORDER, `📋 Новый заказ: «${title}»`, orderId);
  }
}

export async function notifyAssigned(orderId: string, creatorId: string, orderTitle: string) {
  await createNotification(creatorId, NotificationType.ASSIGNED, `✅ Вы назначены на заказ: «${orderTitle}»`, orderId);
}

export async function notifyStageChanged(orderId: string, orderTitle: string, stageName: string, recipientIds: string[]) {
  for (const userId of recipientIds) {
    await createNotification(userId, NotificationType.STAGE_CHANGED, `🔄 Этап «${stageName}» изменён в «${orderTitle}»`, orderId);
  }
}

export async function notifyReviewRequest(orderId: string, orderTitle: string, reviewerId: string) {
  await createNotification(reviewerId, NotificationType.REVIEW_REQUEST, `👀 Заказ «${orderTitle}» отправлен вам на проверку`, orderId);
}

export async function notifyOrderApproved(orderId: string, orderTitle: string, creatorIds: string[]) {
  for (const cid of creatorIds) {
    await createNotification(cid, NotificationType.ORDER_APPROVED, `🎉 Заказ «${orderTitle}» утверждён!`, orderId);
  }
}

export async function notifyComment(orderId: string, orderTitle: string, authorName: string, recipientIds: string[], text?: string) {
  const preview = text ? (text.length > 80 ? text.slice(0, 77) + "..." : text) : "";
  for (const userId of recipientIds) {
    await createNotification(userId, NotificationType.COMMENT_ADDED, `💬 ${authorName} → «${orderTitle}»${preview ? `:\n${preview}` : ""}`, orderId);
  }
}

export async function notifyRegistrationRequest(adminIds: string[], applicantName: string) {
  for (const adminId of adminIds) {
    await createNotification(adminId, NotificationType.REGISTRATION_REQUEST, `📥 Заявка на регистрацию: ${applicantName}`);
  }
}

export async function notifyRegistrationResult(userId: string, approved: boolean) {
  const type = approved ? NotificationType.REGISTRATION_APPROVED : NotificationType.REGISTRATION_REJECTED;
  const msg = approved ? "✅ Ваша заявка одобрена! Теперь вы можете войти по PIN-коду." : "❌ Ваша заявка отклонена.";
  await createNotification(userId, type, msg);
}
