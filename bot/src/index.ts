import { Bot, Context, session, InlineKeyboard } from "grammy";
import { PrismaClient, UserRole } from "@prisma/client";
import dotenv from "dotenv";
import { generateUniquePin } from "./utils";

dotenv.config({ path: "../.env" });

const bot = new Bot(process.env.BOT_TOKEN || "");
const prisma = new PrismaClient();

// ==================== /start — РЕГИСТРАЦИЯ ====================

bot.command("start", async (ctx) => {
  const telegramId = BigInt(ctx.from!.id);
  const username = ctx.from?.username || null;

  // Проверяем, есть ли уже пользователь
  const existing = await prisma.user.findUnique({
    where: { telegramId },
  });

  if (existing) {
    await ctx.reply(
      `👋 С возвращением, ${existing.displayName}!\n\n` +
        `Ваш PIN-код: \`${existing.pinCode}\`\n` +
        `Роль: ${formatRole(existing.role)}\n\n` +
        `Используйте PIN для входа на сайт.`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  // Новый пользователь — спрашиваем роль
  const keyboard = new InlineKeyboard()
    .text("📊 Маркетолог", "role_MARKETER")
    .text("🎬 Креатор", "role_CREATOR")
    .row()
    .text("⭐ Главный креатор", "role_LEAD_CREATOR");

  await ctx.reply(
    `👋 Добро пожаловать в CRM Creators!\n\nВыберите вашу роль:`,
    { reply_markup: keyboard }
  );
});

// Обработка выбора роли при регистрации
bot.callbackQuery(/^role_(.+)$/, async (ctx) => {
  const roleStr = ctx.match![1] as UserRole;
  const telegramId = BigInt(ctx.from!.id);
  const username = ctx.from?.username || null;
  const displayName =
    ctx.from?.first_name +
    (ctx.from?.last_name ? ` ${ctx.from.last_name}` : "");

  // Проверяем на дубль
  const existing = await prisma.user.findUnique({ where: { telegramId } });
  if (existing) {
    await ctx.answerCallbackQuery("Вы уже зарегистрированы!");
    return;
  }

  const pinCode = await generateUniquePin(prisma);

  await prisma.user.create({
    data: {
      telegramId,
      telegramUsername: username,
      displayName,
      role: roleStr,
      pinCode,
      chatId: BigInt(ctx.chat!.id),
    },
  });

  await ctx.answerCallbackQuery("Регистрация завершена!");
  await ctx.editMessageText(
    `✅ Регистрация завершена!\n\n` +
      `👤 Имя: ${displayName}\n` +
      `📋 Роль: ${formatRole(roleStr)}\n` +
      `🔑 Ваш PIN-код: \`${pinCode}\`\n\n` +
      `Используйте этот PIN для входа на сайт.\n` +
      `Сменить PIN: /pin\n` +
      `Редактировать профиль: /profile`,
    { parse_mode: "Markdown" }
  );
});

// ==================== /pin — ПОКАЗАТЬ / СМЕНИТЬ PIN ====================

bot.command("pin", async (ctx) => {
  const telegramId = BigInt(ctx.from!.id);
  const user = await prisma.user.findUnique({ where: { telegramId } });

  if (!user) {
    await ctx.reply("❌ Вы не зарегистрированы. Используйте /start");
    return;
  }

  const keyboard = new InlineKeyboard()
    .text("🔄 Сменить PIN", "change_pin")
    .text("👁 Показать PIN", "show_pin");

  await ctx.reply("🔑 Управление PIN-кодом:", { reply_markup: keyboard });
});

bot.callbackQuery("show_pin", async (ctx) => {
  const telegramId = BigInt(ctx.from!.id);
  const user = await prisma.user.findUnique({ where: { telegramId } });

  if (!user) {
    await ctx.answerCallbackQuery("Ошибка");
    return;
  }

  await ctx.answerCallbackQuery();
  await ctx.reply(`🔑 Ваш PIN-код: \`${user.pinCode}\``, {
    parse_mode: "Markdown",
  });
});

bot.callbackQuery("change_pin", async (ctx) => {
  const telegramId = BigInt(ctx.from!.id);
  const user = await prisma.user.findUnique({ where: { telegramId } });

  if (!user) {
    await ctx.answerCallbackQuery("Ошибка");
    return;
  }

  const newPin = await generateUniquePin(prisma);
  await prisma.user.update({
    where: { telegramId },
    data: { pinCode: newPin },
  });

  await ctx.answerCallbackQuery("PIN изменён!");
  await ctx.editMessageText(
    `✅ PIN-код изменён!\n\nНовый PIN: \`${newPin}\``,
    { parse_mode: "Markdown" }
  );
});

// ==================== /profile — РЕДАКТИРОВАНИЕ ПРОФИЛЯ ====================

bot.command("profile", async (ctx) => {
  const telegramId = BigInt(ctx.from!.id);
  const user = await prisma.user.findUnique({ where: { telegramId } });

  if (!user) {
    await ctx.reply("❌ Вы не зарегистрированы. Используйте /start");
    return;
  }

  const keyboard = new InlineKeyboard().text(
    "✏️ Изменить имя",
    "edit_name"
  );

  await ctx.reply(
    `👤 Ваш профиль:\n\n` +
      `Имя: ${user.displayName}\n` +
      `Telegram: @${user.telegramUsername || "не указан"}\n` +
      `Роль: ${formatRole(user.role)}\n` +
      `Зарегистрирован: ${user.createdAt.toLocaleDateString("ru-RU")}`,
    { reply_markup: keyboard }
  );
});

// Состояние для ожидания ввода имени
const waitingForName = new Set<number>();

bot.callbackQuery("edit_name", async (ctx) => {
  waitingForName.add(ctx.from!.id);
  await ctx.answerCallbackQuery();
  await ctx.reply("✏️ Введите новое отображаемое имя:");
});

// Обработка текстовых сообщений (для имени и отчётов)
bot.on("message:text", async (ctx, next) => {
  const userId = ctx.from!.id;

  // Обработка смены имени
  if (waitingForName.has(userId)) {
    waitingForName.delete(userId);

    const newName = ctx.message.text.trim();
    if (newName.length < 2 || newName.length > 50) {
      await ctx.reply("❌ Имя должно быть от 2 до 50 символов");
      return;
    }

    await prisma.user.update({
      where: { telegramId: BigInt(userId) },
      data: { displayName: newName },
    });

    await ctx.reply(`✅ Имя изменено на: ${newName}`);
    return;
  }

  // Обработка отчёта
  if (waitingForReport.has(userId)) {
    const orderId = waitingForReport.get(userId)!;
    waitingForReport.delete(userId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(userId) },
    });
    if (!user) return;

    await prisma.dailyReport.upsert({
      where: {
        orderId_creatorId_reportDate: {
          orderId,
          creatorId: user.id,
          reportDate: today,
        },
      },
      update: { reportText: ctx.message.text, submittedAt: new Date() },
      create: {
        orderId,
        creatorId: user.id,
        reportText: ctx.message.text,
        reportDate: today,
      },
    });

    await ctx.reply("✅ Отчёт отправлен! Спасибо за работу 💪");
    return;
  }

  await next();
});

// ==================== /myorders — МОИ ЗАКАЗЫ ====================

bot.command("myorders", async (ctx) => {
  const telegramId = BigInt(ctx.from!.id);
  const user = await prisma.user.findUnique({ where: { telegramId } });

  if (!user) {
    await ctx.reply("❌ Вы не зарегистрированы. Используйте /start");
    return;
  }

  let orders;
  if (user.role === UserRole.MARKETER) {
    orders = await prisma.order.findMany({
      where: { marketerId: user.id, status: { not: "ARCHIVED" } },
      include: {
        creators: { include: { creator: { select: { displayName: true } } } },
        stages: { orderBy: { sortOrder: "asc" } },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
    });
  } else {
    orders = await prisma.order.findMany({
      where: {
        creators: { some: { creatorId: user.id } },
        status: { not: "ARCHIVED" },
      },
      include: {
        marketer: { select: { displayName: true } },
        stages: { orderBy: { sortOrder: "asc" } },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
    });
  }

  if (orders.length === 0) {
    await ctx.reply("📭 У вас пока нет активных заказов.");
    return;
  }

  const statusEmoji: Record<string, string> = {
    NEW: "🆕",
    IN_PROGRESS: "🔄",
    ON_REVIEW: "👀",
    DONE: "✅",
    ARCHIVED: "📦",
  };

  let text = `📋 Ваши заказы (${orders.length}):\n\n`;

  for (const order of orders) {
    const doneStages = order.stages.filter((s) => s.status === "DONE").length;
    const totalStages = order.stages.length;
    const progress = `${"▓".repeat(doneStages)}${"░".repeat(totalStages - doneStages)}`;

    text +=
      `${statusEmoji[order.status] || "📋"} *${order.title}*\n` +
      `   Прогресс: ${progress} (${doneStages}/${totalStages})\n`;

    if (order.deadline) {
      const days = Math.ceil(
        (order.deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      text +=
        days > 0
          ? `   ⏰ Дедлайн через ${days} дн.\n`
          : `   🔴 Просрочено!\n`;
    }

    text += "\n";
  }

  await ctx.reply(text, { parse_mode: "Markdown" });
});

// ==================== /report — ОТПРАВИТЬ ОТЧЁТ ====================

const waitingForReport = new Map<number, string>(); // userId → orderId

bot.command("report", async (ctx) => {
  const telegramId = BigInt(ctx.from!.id);
  const user = await prisma.user.findUnique({ where: { telegramId } });

  if (!user) {
    await ctx.reply("❌ Вы не зарегистрированы. Используйте /start");
    return;
  }

  // Находим активные заказы креатора
  const orders = await prisma.order.findMany({
    where: {
      creators: { some: { creatorId: user.id } },
      status: { in: ["IN_PROGRESS", "ON_REVIEW"] },
    },
    select: { id: true, title: true },
  });

  if (orders.length === 0) {
    await ctx.reply("📭 Нет активных заказов для отчёта.");
    return;
  }

  if (orders.length === 1) {
    // Один заказ — сразу спрашиваем текст
    waitingForReport.set(ctx.from!.id, orders[0].id);
    await ctx.reply(
      `📝 Отчёт по заказу «${orders[0].title}»\n\nНапишите, что сделали:`
    );
    return;
  }

  // Несколько заказов — выбор
  const keyboard = new InlineKeyboard();
  for (const order of orders) {
    keyboard.text(order.title.slice(0, 40), `report_${order.id}`).row();
  }

  await ctx.reply("📝 Выберите заказ для отчёта:", {
    reply_markup: keyboard,
  });
});

bot.callbackQuery(/^report_(.+)$/, async (ctx) => {
  const orderId = ctx.match![1];
  waitingForReport.set(ctx.from!.id, orderId);

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { title: true },
  });

  await ctx.answerCallbackQuery();
  await ctx.reply(
    `📝 Отчёт по заказу «${order?.title}»\n\nНапишите, что сделали за сегодня:`
  );
});

// ==================== ОТПРАВКА УВЕДОМЛЕНИЙ ИЗ ОЧЕРЕДИ ====================

async function processNotificationQueue() {
  try {
    const pending = await prisma.notification.findMany({
      where: { isSent: false },
      include: {
        user: { select: { chatId: true, displayName: true } },
        order: { select: { title: true } },
      },
      take: 10,
      orderBy: { createdAt: "asc" },
    });

    for (const notif of pending) {
      if (!notif.user.chatId) continue;

      try {
        await bot.api.sendMessage(
          notif.user.chatId.toString(),
          notif.message,
          { parse_mode: "Markdown" }
        );

        await prisma.notification.update({
          where: { id: notif.id },
          data: { isSent: true, sentAt: new Date() },
        });
      } catch (err) {
        console.error(
          `Failed to send notification ${notif.id}:`,
          (err as Error).message
        );
      }
    }
  } catch (err) {
    console.error("Notification queue error:", err);
  }
}

// Обрабатываем очередь каждые 5 секунд
setInterval(processNotificationQueue, 5000);

// ==================== ХЕЛПЕРЫ ====================

function formatRole(role: UserRole): string {
  const map: Record<UserRole, string> = {
    MARKETER: "📊 Маркетолог",
    CREATOR: "🎬 Креатор",
    LEAD_CREATOR: "⭐ Главный креатор",
    ADMIN: "👑 Администратор",
  };
  return map[role] || role;
}

// ==================== ЗАПУСК ====================

bot.catch((err) => {
  console.error("Bot error:", err);
});

bot.start({
  onStart: () => {
    console.log("🤖 Telegram bot started");
    console.log("📨 Notification queue active (5s interval)");
  },
});
