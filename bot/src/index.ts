import { Bot, InlineKeyboard } from "grammy";
import { PrismaClient, UserRole, UserStatus, NotificationType } from "@prisma/client";
import dotenv from "dotenv";
import crypto from "crypto";
import http from 'http';
dotenv.config({ path: "../.env" });
dotenv.config();

const bot = new Bot(process.env.BOT_TOKEN || "");
const prisma = new PrismaClient();
// Экранирование спецсимволов Markdown
function esc(text: string): string {
  return text.replace(/([_*`\[\]])/g, '\\$1');
}
// ==================== АНТИСПАМ ====================
// Health-check сервер для Render
const PORT = process.env.PORT || 3001;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Bot is running');
}).listen(PORT, () => {
  console.log(`Health-check on port ${PORT}`);
});
const rateLimits = new Map<number, { count: number; resetAt: number }>();
const RATE_LIMIT = 20;       // макс сообщений
const RATE_WINDOW = 60_000;  // за 60 секунд
const blocked = new Set<number>();

function checkRateLimit(userId: number): boolean {
  if (blocked.has(userId)) return false;

  const now = Date.now();
  let entry = rateLimits.get(userId);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_WINDOW };
    rateLimits.set(userId, entry);
  }

  entry.count++;

  if (entry.count > RATE_LIMIT * 2) {
    // Серьёзный спам — блокируем на 10 минут
    blocked.add(userId);
    setTimeout(() => blocked.delete(userId), 10 * 60 * 1000);
    return false;
  }

  return entry.count <= RATE_LIMIT;
}

// Middleware антиспама
bot.use(async (ctx, next) => {
  if (!ctx.from) return;
  if (!checkRateLimit(ctx.from.id)) {
    // Молча игнорируем спамера
    return;
  }
  await next();
});

// ==================== ХЕЛПЕРЫ ====================

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

function generatePin(): string {
  let pin = "";
  for (let i = 0; i < 4; i++) pin += CHARS[crypto.randomInt(0, CHARS.length)];
  return pin;
}

async function generateUniquePin(): Promise<string> {
  for (let i = 0; i < 100; i++) {
    const pin = generatePin();
    const exists = await prisma.user.findUnique({ where: { pinCode: pin } });
    if (!exists) return pin;
  }
  throw new Error("PIN generation failed");
}

function formatRole(role: UserRole): string {
  const map: Record<string, string> = {
    ADMIN: "👑 Администратор",
    HEAD_MARKETER: "📊 Главный маркетолог",
    MARKETER: "📋 Маркетолог",
    HEAD_CREATOR: "🎯 Главный креатор",
    LEAD_CREATOR: "⭐ Тимлид креаторов",
    CREATOR: "🎬 Креатор",
  };
  return map[role] || role;
}

function mainMenuKeyboard(status: UserStatus): InlineKeyboard {
  const kb = new InlineKeyboard();

  if (status === "APPROVED") {
    kb.text("🔑 Мой PIN", "show_pin").text("🔄 Сменить PIN", "change_pin").row();
    kb.text("📋 Мои заказы", "my_orders").text("👤 Профиль", "my_profile").row();
    kb.text("📝 Отправить отчёт", "send_report");
  } else if (status === "PENDING") {
    kb.text("⏳ Статус заявки", "check_status");
  }

  return kb;
}

// ==================== /start — РЕГИСТРАЦИЯ / ВХОД ====================

bot.command("start", async (ctx) => {
  const telegramId = BigInt(ctx.from!.id);
  const username   = ctx.from?.username || null;

  let existing = await prisma.user.findUnique({ where: { telegramId } });

  // Если не нашли по telegramId — ищем по username (для случая пересозданного аккаунта или старых записей)
  if (!existing && username) {
    const byUsername = await prisma.user.findFirst({
      where: { telegramUsername: username },
    });
    if (byUsername) {
      // Обновляем telegramId и chatId чтобы совпадало с реальным аккаунтом
      existing = await prisma.user.update({
        where: { id: byUsername.id },
        data: { telegramId, chatId: BigInt(ctx.chat!.id) },
      });
    }
  } else if (existing && existing.chatId?.toString() !== ctx.chat!.id.toString()) {
    // Обновляем chatId если изменился
    existing = await prisma.user.update({
      where: { id: existing.id },
      data: { chatId: BigInt(ctx.chat!.id) },
    });
  }

  if (existing) {
    // Мастер-восстановление: если это сконфигурированный главный админ — всегда разблокировать
    const ADMIN_TG = process.env.ADMIN_TG_USERNAME || "Dbm0ne";
    if (username === ADMIN_TG && (existing.status === "BLOCKED" || existing.role !== "ADMIN")) {
      existing = await prisma.user.update({
        where: { id: existing.id },
        data: { status: "APPROVED", role: "ADMIN", isActive: true },
      });
    }

    // Если пре-одобренный пользователь (фейковый telegramId) — выдать PIN и обновить данные
    if (existing.status === "APPROVED" && !existing.pinCode) {
      const newPin = await generateUniquePin();
      existing = await prisma.user.update({
        where: { id: existing.id },
        data: { pinCode: newPin },
      });
    }
    // Обновляем displayName из Telegram если ещё не заполнен нормально
    if (existing.displayName.startsWith("@")) {
      const realName = ctx.from?.first_name + (ctx.from?.last_name ? ` ${ctx.from.last_name}` : "");
      if (realName) {
        existing = await prisma.user.update({
          where: { id: existing.id },
          data: { displayName: realName },
        });
      }
    }

    const statusText = existing.status === "APPROVED"
      ? `✅ Вы зарегистрированы и одобрены.\n🔑 PIN для входа на сайт: \`${existing.pinCode}\``
      : existing.status === "PENDING"
      ? "⏳ Ваша заявка на рассмотрении. Дождитесь одобрения."
      : existing.status === "REJECTED"
      ? "❌ Ваша заявка была отклонена."
      : "🚫 Ваш аккаунт заблокирован.";

    await ctx.reply(
      `👋 ${existing.displayName}!\n\n${statusText}\nРоль: ${formatRole(existing.role)}`,
      { parse_mode: "Markdown", reply_markup: mainMenuKeyboard(existing.status) }
    );
    return;
  }

  // Новый пользователь — выбор роли
  const kb = new InlineKeyboard()
    .text("🎬 Креатор", "reg_CREATOR")
    .text("📋 Маркетолог", "reg_MARKETER");

  await ctx.reply(
    `👋 Добро пожаловать в *TRENITY CRM*!\n\n` +
    `Для начала работы нужно подать заявку.\n` +
    `Выберите вашу роль:`,
    { parse_mode: "Markdown", reply_markup: kb }
  );
});

// Обработка выбора роли при регистрации
bot.callbackQuery(/^reg_(.+)$/, async (ctx) => {
  const roleStr = ctx.match![1] as UserRole;
  const telegramId = BigInt(ctx.from!.id);

  const existing = await prisma.user.findUnique({ where: { telegramId } });
  if (existing) {
    await ctx.answerCallbackQuery("Вы уже зарегистрированы!");
    return;
  }

  const username = ctx.from?.username || null;
  const displayName = ctx.from?.first_name + (ctx.from?.last_name ? ` ${ctx.from.last_name}` : "");

  // Создаём заявку (статус PENDING, без PIN)
  await prisma.user.create({
    data: {
      telegramId,
      telegramUsername: username,
      displayName,
      role: roleStr,
      status: UserStatus.PENDING,
      chatId: BigInt(ctx.chat!.id),
      // pinCode — не выдаётся до одобрения
    },
  });

  // Уведомляем админов и лидов
  const managers = await prisma.user.findMany({
    where: {
      status: UserStatus.APPROVED,
      role: { in: [UserRole.ADMIN, UserRole.HEAD_MARKETER, UserRole.HEAD_CREATOR, UserRole.LEAD_CREATOR] },
    },
    select: { id: true },
  });

  for (const m of managers) {
    await prisma.notification.create({
      data: {
        userId: m.id,
        type: NotificationType.REGISTRATION_REQUEST,
        message: `📥 Новая заявка: ${displayName} (@${username || "—"}) → ${formatRole(roleStr)}`,
      },
    });
  }

  await ctx.answerCallbackQuery("Заявка отправлена!");
  await ctx.editMessageText(
    `✅ Заявка отправлена!\n\n` +
    `👤 ${displayName}\n` +
    `📋 Роль: ${formatRole(roleStr)}\n\n` +
    `⏳ Дождитесь одобрения от администратора.\n` +
    `Вам придёт уведомление и PIN-код для входа на сайт.`,
    { reply_markup: mainMenuKeyboard(UserStatus.PENDING) }
  );
});

// ==================== КНОПКИ МЕНЮ ====================

// Показать PIN
bot.callbackQuery("show_pin", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user || !user.pinCode) {
    await ctx.answerCallbackQuery("PIN не найден");
    return;
  }
  await ctx.answerCallbackQuery();
  await ctx.reply(`🔑 Ваш PIN-код: \`${user.pinCode}\`\n\nИспользуйте для входа на сайт.`, { parse_mode: "Markdown" });
});

// Сменить PIN
bot.callbackQuery("change_pin", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user || user.status !== "APPROVED") {
    await ctx.answerCallbackQuery("Недоступно");
    return;
  }

  const newPin = await generateUniquePin();
  await prisma.user.update({ where: { id: user.id }, data: { pinCode: newPin } });

  await ctx.answerCallbackQuery("PIN изменён!");
  await ctx.reply(`✅ Новый PIN-код: \`${newPin}\``, { parse_mode: "Markdown" });
});

// Статус заявки
bot.callbackQuery("check_status", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  await ctx.answerCallbackQuery();

  if (!user) {
    await ctx.reply("Вы не зарегистрированы. Нажмите /start");
    return;
  }

  const statusText: Record<string, string> = {
    PENDING: "⏳ На рассмотрении. Дождитесь одобрения.",
    APPROVED: "✅ Одобрено! Используйте /start чтобы получить PIN.",
    REJECTED: "❌ Отклонена. Свяжитесь с администратором.",
    BLOCKED: "🚫 Заблокирован.",
  };

  await ctx.reply(statusText[user.status] || user.status);
});

// Профиль
bot.callbackQuery("my_profile", async (ctx) => {
  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(ctx.from!.id) },
    include: {
      teamLead: { select: { displayName: true, telegramUsername: true } },
      _count: { select: { assignments: true, createdOrders: true } },
    },
  });

  if (!user) { await ctx.answerCallbackQuery("Не найден"); return; }
  await ctx.answerCallbackQuery();

  let text = `👤 *Ваш профиль*\n\n` +
    `Имя: ${user.displayName}\n` +
    `Telegram: @${user.telegramUsername || "—"}\n` +
    `Роль: ${formatRole(user.role)}\n` +
    `Статус: ${user.status}\n`;

  if (user.teamLead) {
    text += `Тимлид: ${user.teamLead.displayName} (@${user.teamLead.telegramUsername || "—"})\n`;
  }

  text += `\nЗаказов создано: ${user._count.createdOrders}\n`;
  text += `Назначений: ${user._count.assignments}\n`;
  text += `Зарегистрирован: ${user.createdAt.toLocaleDateString("ru-RU")}`;

  const kb = new InlineKeyboard().text("✏️ Изменить имя", "edit_name").text("🔙 Меню", "back_menu");
  await ctx.reply(text, { parse_mode: "Markdown", reply_markup: kb });
});

// Мои заказы
bot.callbackQuery("my_orders", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user) { await ctx.answerCallbackQuery("Не найден"); return; }
  await ctx.answerCallbackQuery();

  const isMarketer = ["ADMIN", "HEAD_MARKETER", "MARKETER"].includes(user.role);

  const orders = await prisma.order.findMany({
    where: isMarketer
      ? { marketerId: user.id, status: { not: "ARCHIVED" } }
      : { creators: { some: { creatorId: user.id } }, status: { not: "ARCHIVED" } },
    include: { stages: { orderBy: { sortOrder: "asc" } } },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });

  if (orders.length === 0) {
    await ctx.reply("📭 Нет активных заказов.");
    return;
  }

  const emoji: Record<string, string> = {
    NEW: "🆕", IN_PROGRESS: "🔄", ON_REVIEW: "👀", DONE: "✅", ARCHIVED: "📦",
  };

  let text = `📋 *Ваши заказы* (${orders.length}):\n\n`;
  for (const o of orders) {
    const done = o.stages.filter((s) => s.status === "DONE").length;
    const total = o.stages.length;
    const bar = "▓".repeat(done) + "░".repeat(total - done);

    text += `${emoji[o.status] || "📋"} *${o.title}*\n`;
    text += `   ${bar} (${done}/${total})\n`;

    if (o.deadline) {
      const days = Math.ceil((o.deadline.getTime() - Date.now()) / 86400000);
      text += days > 0 ? `   ⏰ ${days} дн. до дедлайна\n` : `   🔴 Просрочено!\n`;
    }
    text += "\n";
  }

  await ctx.reply(text, { parse_mode: "Markdown" });
});

// Назад в меню
bot.callbackQuery("back_menu", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  await ctx.answerCallbackQuery();
  if (!user) return;
  await ctx.reply("📋 Главное меню:", { reply_markup: mainMenuKeyboard(user.status) });
});

// ==================== ОТПРАВКА ОТЧЁТА ====================

const waitingForReport = new Map<number, string>();
const waitingForName = new Set<number>();

bot.callbackQuery("send_report", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user || user.status !== "APPROVED") { await ctx.answerCallbackQuery("Недоступно"); return; }
  await ctx.answerCallbackQuery();

  const orders = await prisma.order.findMany({
    where: { creators: { some: { creatorId: user.id } }, status: { in: ["IN_PROGRESS", "ON_REVIEW"] } },
    select: { id: true, title: true },
  });

  if (orders.length === 0) {
    await ctx.reply("📭 Нет активных заказов для отчёта.");
    return;
  }

  if (orders.length === 1) {
    waitingForReport.set(ctx.from!.id, orders[0].id);
    await ctx.reply(`📝 Отчёт по «${orders[0].title}»\n\nНапишите, что сделали сегодня:`);
    return;
  }

  const kb = new InlineKeyboard();
  for (const o of orders) {
    kb.text(o.title.slice(0, 40), `rpt_${o.id}`).row();
  }
  await ctx.reply("📝 Выберите заказ:", { reply_markup: kb });
});

bot.callbackQuery(/^rpt_(.+)$/, async (ctx) => {
  const orderId = ctx.match![1];
  waitingForReport.set(ctx.from!.id, orderId);
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { title: true } });
  await ctx.answerCallbackQuery();
  await ctx.reply(`📝 Отчёт по «${order?.title}»\n\nНапишите, что сделали:`);
});

// Редактирование имени
bot.callbackQuery("edit_name", async (ctx) => {
  waitingForName.add(ctx.from!.id);
  await ctx.answerCallbackQuery();
  await ctx.reply("✏️ Введите новое имя:");
});

// ==================== ОБРАБОТКА ТЕКСТОВЫХ СООБЩЕНИЙ ====================

bot.on("message:text", async (ctx, next) => {
  const userId = ctx.from!.id;

  // Пропускаем команды — передаём управление следующему хендлеру (bot.command)
  if (ctx.message.text.startsWith("/")) return next();

  // Смена имени
  if (waitingForName.has(userId)) {
    waitingForName.delete(userId);
    const name = ctx.message.text.trim();
    if (name.length < 2 || name.length > 50) {
      await ctx.reply("❌ Имя: от 2 до 50 символов");
      return;
    }
    await prisma.user.update({ where: { telegramId: BigInt(userId) }, data: { displayName: name } });
    await ctx.reply(`✅ Имя изменено: ${name}`);
    return;
  }

  // Отчёт
  if (waitingForReport.has(userId)) {
    const orderId = waitingForReport.get(userId)!;
    waitingForReport.delete(userId);

    const user = await prisma.user.findUnique({ where: { telegramId: BigInt(userId) } });
    if (!user) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await prisma.dailyReport.upsert({
      where: { orderId_creatorId_reportDate: { orderId, creatorId: user.id, reportDate: today } },
      update: { reportText: ctx.message.text, submittedAt: new Date() },
      create: { orderId, creatorId: user.id, reportText: ctx.message.text, reportDate: today },
    });

    await ctx.reply("✅ Отчёт сохранён! 💪", {
      reply_markup: new InlineKeyboard().text("🔙 Меню", "back_menu"),
    });
    return;
  }

  // Неизвестное сообщение — предлагаем меню
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(userId) } });
  if (user) {
    await ctx.reply("Используйте кнопки меню:", { reply_markup: mainMenuKeyboard(user.status) });
  } else {
    await ctx.reply("Нажмите /start чтобы начать");
  }
});

// ==================== ADMIN PANEL ====================

const ADMIN_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.HEAD_MARKETER, UserRole.HEAD_CREATOR];

function adminMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📋 Заявки на апрув", "adm_pending").row()
    .text("👥 Пользователи", "adm_users").row()
    .text("📊 Статистика", "adm_stats");
}

bot.command("admin", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    await ctx.reply("❌ Нет доступа.");
    return;
  }
  // Фильтруем заявки по роли администратора
  const roleFilter = getRoleFilter(user.role);
  const pending = await prisma.user.count({ where: { status: "PENDING", ...roleFilter } });
  await ctx.reply(
    `⚙️ *Панель администратора*\n\n` +
    `Заявок на апрув: *${pending}*\n` +
    `Ваша роль: ${formatRole(user.role)}`,
    { parse_mode: "Markdown", reply_markup: adminMenuKeyboard() }
  );
});

// Хелпер: фильтр ролей по иерархии
function getRoleFilter(adminRole: UserRole): { role?: { in: UserRole[] } } {
  if (adminRole === UserRole.ADMIN) return {};
  if (adminRole === UserRole.HEAD_CREATOR) return { role: { in: [UserRole.CREATOR, UserRole.LEAD_CREATOR] } };
  if (adminRole === UserRole.HEAD_MARKETER) return { role: { in: [UserRole.MARKETER] } };
  return { role: { in: [UserRole.CREATOR] } };
}

function canAdminApprove(adminRole: UserRole, targetRole: UserRole): boolean {
  if (adminRole === UserRole.ADMIN) return true;
  if (adminRole === UserRole.HEAD_CREATOR) { const allowed: UserRole[] = [UserRole.CREATOR, UserRole.LEAD_CREATOR]; return allowed.includes(targetRole); }
  if (adminRole === UserRole.HEAD_MARKETER) return targetRole === UserRole.MARKETER;
  return false;
}

// Список заявок
bot.callbackQuery("adm_pending", async (ctx) => {
  const admin = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!admin || !ADMIN_ROLES.includes(admin.role)) { await ctx.answerCallbackQuery("Нет доступа"); return; }
  await ctx.answerCallbackQuery();

  const roleFilter = getRoleFilter(admin.role);
  const pending = await prisma.user.findMany({
    where: { status: "PENDING", ...roleFilter },
    orderBy: { createdAt: "asc" },
    take: 10,
  });

  if (pending.length === 0) {
    await ctx.reply("✅ Заявок нет.", { reply_markup: adminMenuKeyboard() });
    return;
  }

  for (const u of pending) {
    const kb = new InlineKeyboard()
      .text("✅ Одобрить", `adm_approve_${u.id}`)
      .text("❌ Отклонить", `adm_reject_${u.id}`);

    await ctx.reply(
      `👤 *${u.displayName}*\n` +
      `📱 @${u.telegramUsername || "—"}\n` +
      `📋 Роль: ${formatRole(u.role)}\n` +
      `📅 ${u.createdAt.toLocaleDateString("ru-RU")}`,
      { parse_mode: "Markdown", reply_markup: kb }
    );
  }
});

// Одобрить заявку
bot.callbackQuery(/^adm_approve_(.+)$/, async (ctx) => {
  const admin = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!admin || !ADMIN_ROLES.includes(admin.role)) { await ctx.answerCallbackQuery("Нет доступа"); return; }

  const targetId = ctx.match![1];
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) { await ctx.answerCallbackQuery("Не найден"); return; }

  // Проверяем иерархию
  if (!canAdminApprove(admin.role, target.role)) {
    await ctx.answerCallbackQuery("Нет прав одобрять эту роль");
    return;
  }

  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let pin = "";
  for (let i = 0; i < 4; i++) pin += chars[crypto.randomInt(0, chars.length)];

  await prisma.user.update({
    where: { id: targetId },
    data: { status: "APPROVED", pinCode: pin, approvedById: admin.id },
  });

  // Уведомить пользователя
  if (target.chatId) {
    try {
      await bot.api.sendMessage(
        target.chatId.toString(),
        `✅ *Ваша заявка одобрена!*\n\n` +
        `Роль: ${formatRole(target.role)}\n` +
        `🔑 PIN для входа на сайт: \`${pin}\``,
        { parse_mode: "Markdown" }
      );
    } catch {}
  }

  await ctx.answerCallbackQuery("Одобрено!");
  await ctx.editMessageText(
    `✅ *${target.displayName}* одобрен!\nPIN: \`${pin}\``,
    { parse_mode: "Markdown" }
  );
});

// Отклонить заявку
bot.callbackQuery(/^adm_reject_(.+)$/, async (ctx) => {
  const admin = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!admin || !ADMIN_ROLES.includes(admin.role)) { await ctx.answerCallbackQuery("Нет доступа"); return; }

  const targetId = ctx.match![1];
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) { await ctx.answerCallbackQuery("Не найден"); return; }

  await prisma.user.update({ where: { id: targetId }, data: { status: "REJECTED" } });

  if (target.chatId) {
    try {
      await bot.api.sendMessage(target.chatId.toString(), "❌ Ваша заявка отклонена. Обратитесь к администратору.");
    } catch {}
  }

  await ctx.answerCallbackQuery("Отклонено");
  await ctx.editMessageText(`❌ *${target.displayName}* отклонён.`, { parse_mode: "Markdown" });
});

// Список пользователей
bot.callbackQuery("adm_users", async (ctx) => {
  const admin = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!admin || !ADMIN_ROLES.includes(admin.role)) { await ctx.answerCallbackQuery("Нет доступа"); return; }
  await ctx.answerCallbackQuery();

  const counts = await prisma.user.groupBy({
    by: ["role"],
    where: { status: "APPROVED" },
    _count: { id: true },
  });

  let text = `👥 *Пользователи (одобренные)*\n\n`;
  for (const c of counts) {
    text += `${formatRole(c.role as UserRole)}: ${c._count.id}\n`;
  }

  await ctx.reply(text, { parse_mode: "Markdown", reply_markup: adminMenuKeyboard() });
});

// Статистика
bot.callbackQuery("adm_stats", async (ctx) => {
  const admin = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!admin || !ADMIN_ROLES.includes(admin.role)) { await ctx.answerCallbackQuery("Нет доступа"); return; }
  await ctx.answerCallbackQuery();

  const [orders, users, pending] = await Promise.all([
    prisma.order.groupBy({ by: ["status"], _count: { id: true } }),
    prisma.user.count({ where: { status: "APPROVED" } }),
    prisma.user.count({ where: { status: "PENDING" } }),
  ]);

  const statusEmoji: Record<string, string> = { NEW: "🆕", IN_PROGRESS: "🔄", ON_REVIEW: "👀", DONE: "✅", ARCHIVED: "📦" };
  let text = `📊 *Статистика TRENITY CRM*\n\n`;
  text += `👥 Пользователей: ${users}\n`;
  text += `⏳ Заявок на апрув: ${pending}\n\n`;
  text += `📋 *Заказы:*\n`;
  for (const o of orders) {
    text += `${statusEmoji[o.status] || "📋"} ${o.status}: ${o._count.id}\n`;
  }

  await ctx.reply(text, { parse_mode: "Markdown", reply_markup: adminMenuKeyboard() });
});

// ==================== ТЕКСТОВЫЕ КОМАНДЫ (для удобства) ====================

bot.command("pin", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user || !user.pinCode) {
    await ctx.reply("PIN не доступен. Используйте /start");
    return;
  }
  await ctx.reply(`🔑 Ваш PIN: \`${user.pinCode}\``, { parse_mode: "Markdown" });
});

bot.command("menu", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user) { await ctx.reply("Нажмите /start"); return; }
  await ctx.reply("📋 Меню:", { reply_markup: mainMenuKeyboard(user.status) });
});

// ==================== ОТПРАВКА УВЕДОМЛЕНИЙ ИЗ ОЧЕРЕДИ ====================

async function processNotifications() {
  try {
    const pending = await prisma.notification.findMany({
      where: { isSent: false },
      include: { user: { select: { chatId: true } } },
      take: 10,
      orderBy: { createdAt: "asc" },
    });

    for (const n of pending) {
      if (!n.user.chatId) {
        await prisma.notification.update({ where: { id: n.id }, data: { isSent: true, sentAt: new Date() } });
        continue;
      }

      try {
        await bot.api.sendMessage(n.user.chatId.toString(), n.message, { parse_mode: "Markdown" });
        await prisma.notification.update({ where: { id: n.id }, data: { isSent: true, sentAt: new Date() } });
      } catch (err: any) {
        // 403 — бот заблокирован, 400 — чат не найден (фейковый/устаревший chatId)
        // В обоих случаях помечаем как отправлено чтобы больше не пытаться
        if (err.error_code === 403 || err.error_code === 400) {
          await prisma.notification.update({ where: { id: n.id }, data: { isSent: true, sentAt: new Date() } });
        }
        // Не спамим в консоль на каждый цикл — только если неизвестная ошибка
        if (err.error_code !== 400 && err.error_code !== 403) {
          console.error(`Notification ${n.id} failed:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error("Notification queue error:", err);
  }
}

setInterval(processNotifications, 5000);

// ==================== ЗАПУСК ====================

bot.catch((err) => console.error("Bot error:", err));

// ==================== ОБЕСПЕЧИТЬ ADMIN @Dbm0ne ====================
async function ensureDbmAdmin() {
  try {
    const ADMIN_TG = process.env.ADMIN_TG_USERNAME || "Dbm0ne";
    // Найти пользователя с пин-кодом Adm1 или с username ADMIN_TG
    const byPin = await prisma.user.findUnique({ where: { pinCode: "Adm1" } });
    if (byPin && byPin.telegramUsername !== ADMIN_TG) {
      await prisma.user.update({ where: { id: byPin.id }, data: { telegramUsername: ADMIN_TG, displayName: "Dbm" } });
      console.log(`✅ Admin user linked to @${ADMIN_TG}`);
    }
    // Если @Dbm0ne уже есть в БД — убедиться что он ADMIN и не заблокирован
    const byUsername = await prisma.user.findFirst({ where: { telegramUsername: ADMIN_TG } });
    if (byUsername && (byUsername.role !== "ADMIN" || byUsername.status !== "APPROVED")) {
      await prisma.user.update({ where: { id: byUsername.id }, data: { role: "ADMIN", status: "APPROVED", isActive: true } });
      console.log(`✅ Restored @${ADMIN_TG} to ADMIN`);
    }
  } catch (e) {
    console.error("Admin setup error:", e);
  }
}

bot.start({
  onStart: async () => {
    console.log("🤖 TRENITY CRM Bot started");
    console.log("🛡️  Anti-spam: " + RATE_LIMIT + " msg/" + (RATE_WINDOW / 1000) + "s");
    console.log("📨 Notification queue: 5s interval");
    await ensureDbmAdmin();
  },
});
