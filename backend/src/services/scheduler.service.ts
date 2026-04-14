import cron from "node-cron";
import { PrismaClient, NotificationType, OrderStatus } from "@prisma/client";
import { calcReminderInterval, formatDeadline } from "../utils/deadline";

const prisma = new PrismaClient();

/**
 * Запуск всех cron-задач
 */
export function startScheduler() {
  // Каждый день в 10:00 — напоминание об отчётах
  cron.schedule("0 10 * * *", async () => {
    console.log("⏰ Running report reminders...");
    await sendReportReminders();
  });

  // Каждый день в 09:00 — предупреждения о дедлайнах
  cron.schedule("0 9 * * *", async () => {
    console.log("⏰ Running deadline warnings...");
    await sendDeadlineWarnings();
  });

  // Каждые 30 секунд — отправка уведомлений из очереди (будет обрабатывать бот)
  // В проде можно увеличить интервал

  console.log("✅ Scheduler started");
}

/**
 * Напоминание креаторам об отчётах.
 * Проверяет: есть ли активные заказы, где сегодня нужен отчёт,
 * и креатор ещё не отправил.
 */
async function sendReportReminders() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Все активные заказы с дедлайнами
  const orders = await prisma.order.findMany({
    where: {
      status: { in: [OrderStatus.IN_PROGRESS, OrderStatus.ON_REVIEW] },
      deadline: { not: null },
    },
    include: {
      creators: {
        include: {
          creator: { select: { id: true, displayName: true } },
        },
      },
    },
  });

  for (const order of orders) {
    if (!order.deadline) continue;

    const interval = calcReminderInterval(order.deadline);

    // Проверяем, нужно ли сегодня напоминание
    const daysSinceCreated = Math.floor(
      (today.getTime() - order.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceCreated <= 0 || daysSinceCreated % interval !== 0) continue;

    // Проверяем, кто ещё не отправил отчёт сегодня
    for (const assignment of order.creators) {
      const existingReport = await prisma.dailyReport.findUnique({
        where: {
          orderId_creatorId_reportDate: {
            orderId: order.id,
            creatorId: assignment.creatorId,
            reportDate: today,
          },
        },
      });

      if (!existingReport) {
        await prisma.notification.create({
          data: {
            userId: assignment.creatorId,
            orderId: order.id,
            type: NotificationType.REPORT_REMINDER,
            message: `📝 Пора отправить отчёт по заказу «${order.title}». Дедлайн: ${formatDeadline(order.deadline)}`,
          },
        });
      }
    }
  }
}

/**
 * Предупреждения о приближающихся дедлайнах
 */
async function sendDeadlineWarnings() {
  const now = new Date();
  const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

  // Заказы с дедлайном в ближайшие 2 дня
  const orders = await prisma.order.findMany({
    where: {
      status: { in: [OrderStatus.IN_PROGRESS, OrderStatus.ON_REVIEW] },
      deadline: {
        lte: twoDaysFromNow,
        gte: now,
      },
    },
    include: {
      marketer: { select: { id: true } },
      creators: { select: { creatorId: true } },
    },
  });

  for (const order of orders) {
    const recipientIds = [
      order.marketer.id,
      ...order.creators.map((c) => c.creatorId),
    ];

    for (const userId of recipientIds) {
      await prisma.notification.create({
        data: {
          userId,
          orderId: order.id,
          type: NotificationType.DEADLINE_WARNING,
          message: `⚠️ Дедлайн по заказу «${order.title}»: ${formatDeadline(order.deadline!)}`,
        },
      });
    }
  }
}
