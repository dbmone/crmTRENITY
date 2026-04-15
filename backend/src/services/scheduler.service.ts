import cron from "node-cron";
import { PrismaClient, NotificationType, OrderStatus } from "@prisma/client";
import { calcReminderInterval, formatDeadline } from "../utils/deadline";
import { cleanupArchivedFiles } from "./file.service";

const prisma = new PrismaClient();

export function startScheduler() {
  // Каждый день в 10:00 — напоминания об отчётах (с эскалацией)
  cron.schedule("0 10 * * *", async () => {
    console.log("⏰ Report reminders...");
    await sendReportReminders();
  });

  // Каждый день в 09:00 — дедлайн-предупреждения
  cron.schedule("0 9 * * *", async () => {
    console.log("⏰ Deadline warnings...");
    await sendDeadlineWarnings();
  });

  // Каждый день в 18:00 — повторные напоминания для тех кто не сдал (эскалация)
  cron.schedule("0 18 * * *", async () => {
    console.log("⏰ Escalated reminders...");
    await sendEscalatedReminders();
  });

  // Каждое воскресенье в 03:00 — очистка файлов из архивных заказов (90+ дней)
  cron.schedule("0 3 * * 0", async () => {
    console.log("🗑️  Cleaning up archived files...");
    try {
      const result = await cleanupArchivedFiles();
      if (result.deleted > 0) {
        const mb = (Number(result.freedBytes) / (1024 * 1024)).toFixed(1);
        console.log(`✅ Cleanup: removed ${result.deleted} files, freed ${mb} МБ`);
      }
    } catch (err) {
      console.error("Cleanup failed:", err);
    }
  });

  console.log("✅ Scheduler started");
}

async function sendReportReminders() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const orders = await prisma.order.findMany({
    where: {
      status: { in: [OrderStatus.IN_PROGRESS, OrderStatus.ON_REVIEW] },
      deadline: { not: null },
    },
    include: {
      creators: { include: { creator: { select: { id: true, displayName: true } } } },
    },
  });

  for (const order of orders) {
    if (!order.deadline) continue;

    for (const assignment of order.creators) {
      // Находим последний отчёт
      const lastReport = await prisma.dailyReport.findFirst({
        where: { orderId: order.id, creatorId: assignment.creatorId },
        orderBy: { reportDate: "desc" },
      });

      // Считаем пропуски
      let missedDays = 0;
      if (lastReport) {
        missedDays = Math.floor(
          (today.getTime() - lastReport.reportDate.getTime()) / (1000 * 60 * 60 * 24)
        );
      } else {
        missedDays = Math.floor(
          (today.getTime() - order.createdAt.getTime()) / (1000 * 60 * 60 * 24)
        );
      }

      const interval = calcReminderInterval(order.deadline, missedDays > 2 ? missedDays : 0);
      const daysSinceCreated = Math.floor(
        (today.getTime() - order.createdAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceCreated <= 0 || daysSinceCreated % interval !== 0) continue;

      // Проверяем что сегодня отчёт ещё не сдан
      const todayReport = await prisma.dailyReport.findUnique({
        where: { orderId_creatorId_reportDate: { orderId: order.id, creatorId: assignment.creatorId, reportDate: today } },
      });

      if (!todayReport) {
        const urgency = missedDays >= 3 ? "🔴🔴🔴 СРОЧНО! " : missedDays >= 2 ? "🔴 " : "";
        await prisma.notification.create({
          data: {
            userId: assignment.creatorId,
            orderId: order.id,
            type: NotificationType.REPORT_REMINDER,
            message: `${urgency}📝 Отправьте отчёт по «${order.title}». ${formatDeadline(order.deadline)}${missedDays > 1 ? `\n⚠️ Пропущено отчётов: ${missedDays}` : ""}`,
          },
        });
      }
    }
  }
}

async function sendDeadlineWarnings() {
  const now = new Date();
  const twoDaysOut = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

  const orders = await prisma.order.findMany({
    where: {
      status: { in: [OrderStatus.IN_PROGRESS, OrderStatus.ON_REVIEW] },
      deadline: { lte: twoDaysOut, gte: now },
    },
    include: {
      marketer: { select: { id: true } },
      creators: { select: { creatorId: true } },
    },
  });

  for (const order of orders) {
    const recipients = [order.marketer.id, ...order.creators.map((c) => c.creatorId)];
    for (const userId of [...new Set(recipients)]) {
      await prisma.notification.create({
        data: {
          userId,
          orderId: order.id,
          type: NotificationType.DEADLINE_WARNING,
          message: `⚠️ Дедлайн по «${order.title}»: ${formatDeadline(order.deadline!)}`,
        },
      });
    }
  }
}

async function sendEscalatedReminders() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Находим креаторов которые пропустили отчёт сегодня (утром получили напоминание, но не сдали)
  const orders = await prisma.order.findMany({
    where: {
      status: { in: [OrderStatus.IN_PROGRESS, OrderStatus.ON_REVIEW] },
      deadline: { not: null },
    },
    include: {
      creators: { select: { creatorId: true } },
    },
  });

  for (const order of orders) {
    for (const c of order.creators) {
      // Было утреннее напоминание?
      const morningReminder = await prisma.notification.findFirst({
        where: {
          userId: c.creatorId,
          orderId: order.id,
          type: NotificationType.REPORT_REMINDER,
          createdAt: { gte: today },
        },
      });

      if (!morningReminder) continue;

      // Отчёт сдан?
      const report = await prisma.dailyReport.findUnique({
        where: { orderId_creatorId_reportDate: { orderId: order.id, creatorId: c.creatorId, reportDate: today } },
      });

      if (!report) {
        await prisma.notification.create({
          data: {
            userId: c.creatorId,
            orderId: order.id,
            type: NotificationType.REPORT_REMINDER,
            message: `🔴 Вы до сих пор не сдали отчёт по «${order.title}»! Пожалуйста, отправьте сейчас.`,
          },
        });
      }
    }
  }
}
