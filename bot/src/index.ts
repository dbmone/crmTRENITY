import { Bot, InlineKeyboard } from "grammy";
import { PrismaClient, UserRole, UserStatus, NotificationType } from "@prisma/client";
import dotenv from "dotenv";
import crypto from "crypto";
import http from 'http';
dotenv.config({ path: "../.env" });
dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error("BOT_TOKEN is not set");
  process.exit(1);
}

const bot = new Bot(BOT_TOKEN);
const prisma = new PrismaClient();
// Экранирование спецсимволов Markdown
function esc(text: string): string {
  return text.replace(/([_*`\[\]])/g, '\\$1');
}
// ==================== АНТИСПАМ ====================
// Health-check сервер для Render
const PORT = process.env.PORT || 3001;
let healthServerStarted = false;

function startHealthServer() {
  if (healthServerStarted) return;
  healthServerStarted = true;

  http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Bot is running');
  }).listen(PORT, () => {
    console.log(`Health-check on port ${PORT}`);
  });
}
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

const MARKETER_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.HEAD_MARKETER, UserRole.MARKETER];
const STORAGE_CHAT_ID = process.env.TELEGRAM_STORAGE_CHAT_ID || "";

function mainMenuKeyboard(status: UserStatus, role?: UserRole): InlineKeyboard {
  const kb = new InlineKeyboard();

  if (status === "APPROVED") {
    kb.text("🔑 Мой PIN", "show_pin").text("🔄 Сменить PIN", "change_pin").row();
    kb.text("📋 Мои заказы", "my_orders").text("👤 Профиль", "my_profile").row();
    kb.text("📝 Отправить отчёт", "send_report");
    if (role && MARKETER_ROLES.includes(role)) {
      kb.row().text("➕ Создать заказ", "create_order");
    }
    kb.row().text("📎 Загрузить файл", "upload_file_menu");
    if (role && ADMIN_ROLES.includes(role)) {
      kb.row().text("⚙️ Панель управления", "adm_open");
    }
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
      { parse_mode: "Markdown", reply_markup: mainMenuKeyboard(existing.status, existing.role) }
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
  await ctx.reply("📋 Главное меню:", { reply_markup: mainMenuKeyboard(user.status, user.role) });
});

// ==================== ОТПРАВКА ОТЧЁТА ====================

const waitingForReport     = new Map<number, string>();
const waitingForName       = new Set<number>();
const waitingForOrderTitle = new Map<number, true>();

// Батч-сбор ТЗ / файлов
interface CollectedItem {
  fileName: string;
  fileSize: number;
  mimeType: string;     // "text/plain" для текстовых сообщений
  fileId?: string;      // для медиа
  storageMsgId: number; // message_id в канале-хранилище
}
interface CollectingState {
  mode: "create_order" | "attach_files";
  title?: string;   // для create_order
  orderId?: string; // для attach_files
  items: CollectedItem[];
}
const collectingState = new Map<number, CollectingState>();

function collectingKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Готово", "tz_done").row()
    .text("❌ Отмена", "tz_cancel");
}

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

// ==================== СОЗДАНИЕ ЗАКАЗА ====================

bot.callbackQuery("create_order", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user || user.status !== "APPROVED" || !MARKETER_ROLES.includes(user.role)) {
    await ctx.answerCallbackQuery("Недоступно");
    return;
  }
  await ctx.answerCallbackQuery();
  waitingForOrderTitle.set(ctx.from!.id, true);
  await ctx.reply(
    "➕ *Создание заказа*\n\nВведите название заказа:",
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("❌ Отмена", "tz_cancel") }
  );
});

// Готово / Отмена для батч-сбора
bot.callbackQuery("tz_done", async (ctx) => {
  const userId = ctx.from!.id;
  const state = collectingState.get(userId);
  if (!state) { await ctx.answerCallbackQuery("Нет активной сессии"); return; }

  collectingState.delete(userId);
  await ctx.answerCallbackQuery();

  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(userId) } });
  if (!user) return;

  let orderId: string;
  let orderTitle: string;

  if (state.mode === "create_order") {
    const order = await prisma.order.create({
      data: {
        title: state.title!,
        marketerId: user.id,
        status: "NEW",
        stages: {
          create: [
            { name: "STORYBOARD", status: "PENDING", sortOrder: 1 },
            { name: "ANIMATION",  status: "PENDING", sortOrder: 2 },
            { name: "EDITING",    status: "PENDING", sortOrder: 3 },
            { name: "REVIEW",     status: "PENDING", sortOrder: 4 },
            { name: "COMPLETED",  status: "PENDING", sortOrder: 5 },
          ],
        },
      },
    });
    orderId = order.id;
    orderTitle = state.title!;
  } else {
    orderId = state.orderId!;
    const order = await prisma.order.findUnique({ where: { id: orderId }, select: { title: true } });
    orderTitle = order?.title || orderId;
  }

  // Сохраняем все собранные элементы
  if (state.items.length > 0 && STORAGE_CHAT_ID) {
    await prisma.orderFile.createMany({
      data: state.items.map((item) => ({
        orderId,
        uploadedById: user.id,
        fileType: "TZ" as any,
        fileName: item.fileName,
        fileSize: BigInt(item.fileSize),
        mimeType: item.mimeType,
        storagePath: "",
        telegramFileId: item.fileId ?? null,
        telegramChatId: STORAGE_CHAT_ID,
        telegramMsgId:  item.storageMsgId,
      })),
    });
  }

  const what = state.mode === "create_order"
    ? `✅ Заказ *${orderTitle}* создан!`
    : `✅ Файлы добавлены к заказу *${orderTitle}*!`;

  await ctx.reply(
    `${what}\n📎 Прикреплено: ${state.items.length} элем.`,
    { parse_mode: "Markdown", reply_markup: mainMenuKeyboard(user.status, user.role) }
  );
});

bot.callbackQuery("tz_cancel", async (ctx) => {
  collectingState.delete(ctx.from!.id);
  waitingForOrderTitle.delete(ctx.from!.id);
  await ctx.answerCallbackQuery("Отменено");
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (user) await ctx.reply("📋 Меню:", { reply_markup: mainMenuKeyboard(user.status, user.role) });
});

// ==================== ЗАГРУЗКА ФАЙЛА ====================

bot.callbackQuery("upload_file_menu", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user || user.status !== "APPROVED") { await ctx.answerCallbackQuery("Недоступно"); return; }
  await ctx.answerCallbackQuery();

  const isMarketer = MARKETER_ROLES.includes(user.role);
  const orders = await prisma.order.findMany({
    where: isMarketer
      ? { marketerId: user.id, status: { notIn: ["ARCHIVED"] } }
      : { creators: { some: { creatorId: user.id } }, status: { notIn: ["ARCHIVED"] } },
    select: { id: true, title: true },
    orderBy: { updatedAt: "desc" },
    take: 15,
  });

  if (orders.length === 0) {
    await ctx.reply("📭 Нет активных заказов.", { reply_markup: mainMenuKeyboard(user.status, user.role) });
    return;
  }

  const kb = new InlineKeyboard();
  for (const o of orders) kb.text(o.title.slice(0, 40), `upl_ord_${o.id}`).row();
  kb.text("🔙 Отмена", "back_menu");
  await ctx.reply("📎 *Загрузить файлы*\n\nВыберите заказ:", { parse_mode: "Markdown", reply_markup: kb });
});

bot.callbackQuery(/^upl_ord_(.+)$/, async (ctx) => {
  const orderId = ctx.match![1];
  await ctx.answerCallbackQuery();
  collectingState.set(ctx.from!.id, { mode: "attach_files", orderId, items: [] });
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { title: true } });
  await ctx.reply(
    `📎 Заказ: *${order?.title}*\n\nОтправляйте файлы, фото, видео или текст.\nМожно сколько угодно — всё сохранится.\nКогда закончите:`,
    { parse_mode: "Markdown", reply_markup: collectingKeyboard() }
  );
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

  // Создание заказа — ввод названия
  if (waitingForOrderTitle.has(userId)) {
    const title = ctx.message.text.trim();
    if (title.length < 2 || title.length > 100) {
      await ctx.reply("❌ Название: от 2 до 100 символов. Попробуйте снова:");
      return;
    }
    waitingForOrderTitle.delete(userId);
    collectingState.set(userId, { mode: "create_order", title, items: [] });
    await ctx.reply(
      `📋 Название: *${title}*\n\n` +
      `Теперь отправляйте всё для ТЗ:\n` +
      `• Текстовые сообщения\n• Файлы, фото, видео\n• Пересланные сообщения\n\n` +
      `Можно сколько угодно штук подряд. Когда закончите — нажмите *Готово*.\n` +
      `Или сразу Готово если ТЗ не нужно:`,
      { parse_mode: "Markdown", reply_markup: collectingKeyboard() }
    );
    return;
  }

  // Батч-сбор: текстовое сообщение → пересылаем в хранилище
  if (collectingState.has(userId)) {
    const state = collectingState.get(userId)!;
    if (!STORAGE_CHAT_ID) {
      await ctx.reply("❌ Хранилище Telegram не настроено.");
      return;
    }
    try {
      const fwd = await bot.api.forwardMessage(STORAGE_CHAT_ID, ctx.chat!.id, ctx.message!.message_id);
      const text = ctx.message.text.trim();
      state.items.push({
        fileName: text.slice(0, 500),
        fileSize: 0,
        mimeType: "text/plain",
        storageMsgId: fwd.message_id,
      });
      await ctx.reply(
        `📩 Добавлено (${state.items.length} эл.). Продолжайте или нажмите Готово:`,
        { reply_markup: collectingKeyboard() }
      );
    } catch (e: any) {
      await ctx.reply("❌ Ошибка: " + e.message);
    }
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
    await ctx.reply("Используйте кнопки меню:", { reply_markup: mainMenuKeyboard(user.status, user.role) });
  } else {
    await ctx.reply("Нажмите /start чтобы начать");
  }
});

// ==================== ФАЙЛОВЫЕ СООБЩЕНИЯ ====================

// Хелпер: форвардим файл в хранилище с подписью и сохраняем в БД
async function saveBotFile(
  ctx: any,
  orderId: string,
  userId: string,
  fileType: string,
  fileId: string,
  fileName: string,
  fileSize: number,
  mimeType: string
): Promise<boolean> {
  if (!STORAGE_CHAT_ID) {
    await ctx.reply("❌ Хранилище Telegram не настроено. Обратитесь к администратору.");
    return false;
  }
  try {
    // Получаем человекочитаемые названия для подписи
    const [order, uploader] = await Promise.all([
      prisma.order.findUnique({ where: { id: orderId }, select: { title: true } }),
      prisma.user.findUnique({ where: { id: userId }, select: { displayName: true, telegramUsername: true } }),
    ]);
    const orderLabel    = order?.title || orderId;
    const uploaderLabel = uploader?.displayName || uploader?.telegramUsername || userId;

    // Отправляем подпись перед файлом
    await bot.api.sendMessage(
      STORAGE_CHAT_ID,
      `📋 Заказ: *${orderLabel}*\n👤 От: ${uploaderLabel}\n📎 ${fileName}`,
      { parse_mode: "Markdown" }
    );
    const fwd = await bot.api.forwardMessage(STORAGE_CHAT_ID, ctx.chat!.id, ctx.message!.message_id);
    await prisma.orderFile.create({
      data: {
        orderId,
        uploadedById: userId,
        fileType: fileType as any,
        fileName,
        fileSize: BigInt(fileSize),
        mimeType,
        storagePath: "",
        telegramFileId: fileId,
        telegramChatId: String(STORAGE_CHAT_ID),
        telegramMsgId: fwd.message_id,
      },
    });
    return true;
  } catch (e: any) {
    console.error("saveBotFile error:", e.message);
    await ctx.reply("❌ Ошибка при сохранении файла: " + e.message);
    return false;
  }
}

// Хелпер: обрабатываем любой файловый тип
interface FileInfo { fileId: string; fileName: string; fileSize: number; mimeType: string }

async function handleFileMessage(ctx: any, info: FileInfo) {
  const userId = ctx.from!.id;

  // Батч-режим: добавляем файл в коллекцию
  if (collectingState.has(userId)) {
    const state = collectingState.get(userId)!;
    if (!STORAGE_CHAT_ID) {
      await ctx.reply("❌ Хранилище Telegram не настроено.");
      return;
    }
    try {
      const fwd = await bot.api.forwardMessage(STORAGE_CHAT_ID, ctx.chat!.id, ctx.message!.message_id);
      state.items.push({
        fileName:     info.fileName,
        fileSize:     info.fileSize,
        mimeType:     info.mimeType,
        fileId:       info.fileId,
        storageMsgId: fwd.message_id,
      });
      const typeLabel = info.mimeType === "audio/ogg" ? "🎙 Голосовое" : "📎 Файл";
      await ctx.reply(
        `${typeLabel} добавлен (${state.items.length} эл.). Продолжайте или нажмите Готово:`,
        { reply_markup: collectingKeyboard() }
      );
    } catch (e: any) {
      await ctx.reply("❌ Ошибка сохранения: " + e.message);
    }
    return;
  }

  // Нет активного состояния — подсказываем
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(userId) } });
  if (user) {
    await ctx.reply(
      "Чтобы прикрепить файл к заказу, используйте кнопку 📎 Загрузить файл:",
      { reply_markup: mainMenuKeyboard(user.status, user.role) }
    );
  }
}

// Документы (pdf, zip, любые файлы)
bot.on("message:document", async (ctx) => {
  const doc = ctx.message.document;
  await handleFileMessage(ctx, {
    fileId:   doc.file_id,
    fileName: doc.file_name || `file_${Date.now()}`,
    fileSize: doc.file_size || 0,
    mimeType: doc.mime_type || "application/octet-stream",
  });
});

// Видео
bot.on("message:video", async (ctx) => {
  const vid = ctx.message.video;
  await handleFileMessage(ctx, {
    fileId:   vid.file_id,
    fileName: vid.file_name || `video_${Date.now()}.mp4`,
    fileSize: vid.file_size || 0,
    mimeType: vid.mime_type || "video/mp4",
  });
});

// Фото
bot.on("message:photo", async (ctx) => {
  const photo = ctx.message.photo[ctx.message.photo.length - 1];
  await handleFileMessage(ctx, {
    fileId:   photo.file_id,
    fileName: `photo_${Date.now()}.jpg`,
    fileSize: photo.file_size || 0,
    mimeType: "image/jpeg",
  });
});

// Голосовые сообщения — попадают в TZ как аудио
bot.on("message:voice", async (ctx) => {
  const voice = ctx.message.voice;
  await handleFileMessage(ctx, {
    fileId:   voice.file_id,
    fileName: `voice_${Date.now()}.ogg`,
    fileSize: voice.file_size || 0,
    mimeType: "audio/ogg",
  });
});

// Видеосообщения (кружочки)
bot.on("message:video_note", async (ctx) => {
  const note = ctx.message.video_note;
  await handleFileMessage(ctx, {
    fileId:   note.file_id,
    fileName: `videonote_${Date.now()}.mp4`,
    fileSize: note.file_size || 0,
    mimeType: "video/mp4",
  });
});

// ==================== ADMIN PANEL ====================

const ADMIN_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.HEAD_MARKETER, UserRole.HEAD_CREATOR];

function adminMenuKeyboard(pendingCount = 0): InlineKeyboard {
  const pendingLabel = pendingCount > 0 ? `📋 Заявки на апрув (${pendingCount})` : "📋 Заявки на апрув";
  return new InlineKeyboard()
    .text(pendingLabel, "adm_pending").row()
    .text("👥 Список пользователей", "adm_users_0").row()
    .text("🔙 В меню", "back_menu");
}

async function sendAdminPanel(ctx: any, user: any) {
  const roleFilter = getRoleFilter(user.role);
  const [pending, totalUsers] = await Promise.all([
    prisma.user.count({ where: { status: "PENDING", ...roleFilter } }),
    prisma.user.count({ where: { status: { in: ["APPROVED", "BLOCKED"] } } }),
  ]);
  await ctx.reply(
    `⚙️ *Панель управления*\n\n` +
    `👥 Пользователей: *${totalUsers}*\n` +
    `📋 Заявок на апрув: *${pending}*\n` +
    `🎭 Ваша роль: ${formatRole(user.role)}`,
    { parse_mode: "Markdown", reply_markup: adminMenuKeyboard(pending) }
  );
}

bot.command("admin", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    await ctx.reply("❌ Нет доступа.");
    return;
  }
  await sendAdminPanel(ctx, user);
});

// Открыть панель управления из главного меню
bot.callbackQuery("adm_open", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user || !ADMIN_ROLES.includes(user.role)) { await ctx.answerCallbackQuery("Нет доступа"); return; }
  await ctx.answerCallbackQuery();
  await sendAdminPanel(ctx, user);
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

const PAGE_SIZE = 6;

// Список пользователей (с пагинацией)
bot.callbackQuery(/^adm_users_(\d+)$/, async (ctx) => {
  const admin = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!admin || !ADMIN_ROLES.includes(admin.role)) { await ctx.answerCallbackQuery("Нет доступа"); return; }
  await ctx.answerCallbackQuery();

  const page = parseInt(ctx.match![1]);
  const [total, users] = await Promise.all([
    prisma.user.count({ where: { status: { in: ["APPROVED", "BLOCKED"] } } }),
    prisma.user.findMany({
      where: { status: { in: ["APPROVED", "BLOCKED"] } },
      orderBy: [{ role: "asc" }, { displayName: "asc" }],
      skip: page * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, displayName: true, telegramUsername: true, role: true, status: true },
    }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  let text = `👥 *Пользователи* (${total} чел., стр. ${page + 1}/${totalPages || 1})\n\n`;

  const kb = new InlineKeyboard();
  for (const u of users) {
    const blocked = u.status === "BLOCKED" ? " 🚫" : "";
    text += `• ${u.displayName}${blocked} — ${formatRole(u.role)}\n`;
    kb.text(`${u.displayName.slice(0, 20)}${blocked}`, `adm_user_${u.id}`).row();
  }

  // Навигация — добавляем к тому же kb
  if (page > 0)              kb.text("← Назад",  `adm_users_${page - 1}`);
  if (page + 1 < totalPages) kb.text("Вперёд →", `adm_users_${page + 1}`);
  kb.row().text("🔙 Меню", "adm_back");

  await ctx.reply(text, { parse_mode: "Markdown", reply_markup: kb });
});

// Профиль пользователя (управление)
bot.callbackQuery(/^adm_user_(.+)$/, async (ctx) => {
  const admin = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!admin || !ADMIN_ROLES.includes(admin.role)) { await ctx.answerCallbackQuery("Нет доступа"); return; }
  await ctx.answerCallbackQuery();

  const targetId = ctx.match![1];
  const target = await prisma.user.findUnique({
    where: { id: targetId },
    include: { _count: { select: { assignments: true, createdOrders: true } } },
  });
  if (!target) { await ctx.reply("Пользователь не найден"); return; }

  const blocked = target.status === "BLOCKED";
  let text = `👤 *${target.displayName}*\n`;
  text += `📱 @${target.telegramUsername || "—"}\n`;
  text += `🎭 ${formatRole(target.role)}\n`;
  text += `📊 Статус: ${blocked ? "🚫 Заблокирован" : "✅ Активен"}\n`;
  text += `📋 Заказов: ${target._count.createdOrders}, назначений: ${target._count.assignments}`;

  const kb = new InlineKeyboard();

  // Смена роли (только если admin может управлять)
  if (canAdminApprove(admin.role, target.role) || admin.role === UserRole.ADMIN) {
    kb.text("🎭 Изменить роль", `adm_role_${targetId}`).row();
  }

  // Блок/разблок
  if (admin.role === UserRole.ADMIN && target.id !== admin.id) {
    if (blocked) {
      kb.text("✅ Восстановить", `adm_unblock_${targetId}`).row();
    } else {
      kb.text("🚫 Заблокировать", `adm_block_${targetId}`).row();
    }
  }
  kb.text("🔙 Назад", "adm_users_0");

  await ctx.reply(text, { parse_mode: "Markdown", reply_markup: kb });
});

// Изменить роль — выбор новой роли
bot.callbackQuery(/^adm_role_(.+)$/, async (ctx) => {
  const admin = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!admin || !ADMIN_ROLES.includes(admin.role)) { await ctx.answerCallbackQuery("Нет доступа"); return; }
  await ctx.answerCallbackQuery();

  const targetId = ctx.match![1];
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) { await ctx.reply("Не найден"); return; }

  const allRoles: UserRole[] = [UserRole.CREATOR, UserRole.LEAD_CREATOR, UserRole.HEAD_CREATOR, UserRole.MARKETER, UserRole.HEAD_MARKETER];
  if (admin.role === UserRole.ADMIN) allRoles.push(UserRole.ADMIN);

  const kb = new InlineKeyboard();
  for (const role of allRoles) {
    const mark = target.role === role ? "✓ " : "";
    kb.text(`${mark}${formatRole(role)}`, `adm_setrole_${targetId}_${role}`).row();
  }
  kb.text("🔙 Назад", `adm_user_${targetId}`);

  await ctx.reply(`Текущая роль: ${formatRole(target.role)}\nВыберите новую роль:`, { reply_markup: kb });
});

// Установить роль
bot.callbackQuery(/^adm_setrole_(.+)_(.+)$/, async (ctx) => {
  const admin = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!admin || !ADMIN_ROLES.includes(admin.role)) { await ctx.answerCallbackQuery("Нет доступа"); return; }

  const targetId = ctx.match![1];
  const newRole  = ctx.match![2] as UserRole;

  if (!Object.values(UserRole).includes(newRole)) { await ctx.answerCallbackQuery("Недопустимая роль"); return; }
  if (!canAdminApprove(admin.role, newRole) && admin.role !== UserRole.ADMIN) {
    await ctx.answerCallbackQuery("Нет прав назначать эту роль");
    return;
  }

  await prisma.user.update({ where: { id: targetId }, data: { role: newRole } });
  await ctx.answerCallbackQuery(`Роль изменена на ${formatRole(newRole)}`);
  await ctx.editMessageText(`✅ Роль изменена: ${formatRole(newRole)}`);
});

// Заблокировать
bot.callbackQuery(/^adm_block_(.+)$/, async (ctx) => {
  const admin = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!admin || admin.role !== UserRole.ADMIN) { await ctx.answerCallbackQuery("Нет доступа"); return; }

  const targetId = ctx.match![1];
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target || target.id === admin.id) { await ctx.answerCallbackQuery("Нельзя"); return; }

  await prisma.user.update({ where: { id: targetId }, data: { status: "BLOCKED", isActive: false } });
  await ctx.answerCallbackQuery("Заблокирован");
  await ctx.editMessageText(`🚫 *${target.displayName}* заблокирован.`, { parse_mode: "Markdown" });
});

// Восстановить
bot.callbackQuery(/^adm_unblock_(.+)$/, async (ctx) => {
  const admin = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!admin || admin.role !== UserRole.ADMIN) { await ctx.answerCallbackQuery("Нет доступа"); return; }

  const targetId = ctx.match![1];
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) { await ctx.answerCallbackQuery("Не найден"); return; }

  await prisma.user.update({ where: { id: targetId }, data: { status: "APPROVED", isActive: true } });
  await ctx.answerCallbackQuery("Восстановлен");
  await ctx.editMessageText(`✅ *${target.displayName}* восстановлен.`, { parse_mode: "Markdown" });
});

// Назад в панель управления
bot.callbackQuery("adm_back", async (ctx) => {
  const admin = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!admin) return;
  await ctx.answerCallbackQuery();
  await sendAdminPanel(ctx, admin);
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
  await ctx.reply("📋 Меню:", { reply_markup: mainMenuKeyboard(user.status, user.role) });
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
process.on("unhandledRejection", (err) => console.error("Unhandled rejection:", err));
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  process.exit(1);
});

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

if (false) bot.start({
  onStart: async () => {
    console.log("🤖 TRENITY CRM Bot started");
    console.log("🛡️  Anti-spam: " + RATE_LIMIT + " msg/" + (RATE_WINDOW / 1000) + "s");
    console.log("📨 Notification queue: 5s interval");
    await ensureDbmAdmin();
  },
});

async function startTelegramBot() {
  try {
    console.log("Checking Telegram bot token...");
    const me = await bot.api.getMe();
    console.log(`Telegram auth OK: @${me.username}`);
    console.log("Starting Telegram polling...");

    await bot.start({
      onStart: async () => {
        startHealthServer();
        console.log("TRENITY CRM Bot started");
        console.log("Anti-spam: " + RATE_LIMIT + " msg/" + (RATE_WINDOW / 1000) + "s");
        console.log("Notification queue: 5s interval");
        await ensureDbmAdmin();
      },
    });
  } catch (err) {
    console.error("Failed to start Telegram bot:", err);
    process.exit(1);
  }
}

void startTelegramBot();
