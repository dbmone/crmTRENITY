import { Bot, InlineKeyboard, Keyboard } from "grammy";
import { PrismaClient, UserRole, UserStatus, NotificationType } from "@prisma/client";
import dotenv from "dotenv";
import crypto from "crypto";
import http from 'http';
import { ProxyAgent } from "proxy-agent";
const nodeFetch = require("node-fetch") as typeof fetch;
const FormDataNode = require("form-data") as typeof import("form-data");
dotenv.config({ path: "../.env" });
dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const TELEGRAM_PROXY_URL = process.env.TELEGRAM_PROXY_URL;
const FRONTEND_URL = process.env.FRONTEND_URL?.trim() || "https://trenitycrm.duckdns.org";
const BOT_USERNAME = (process.env.BOT_USERNAME || "").replace(/^@/, "").toLowerCase();
let BOT_SELF_ID: number | null = null;

function maskEndpoint(value: string): string {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ""}`;
  } catch {
    return "configured";
  }
}

if (!BOT_TOKEN) {
  console.error("BOT_TOKEN is not set");
  process.exit(1);
}

const telegramProxyAgent = TELEGRAM_PROXY_URL
  ? new ProxyAgent({ getProxyForUrl: () => TELEGRAM_PROXY_URL })
  : null;

const bot = new Bot(BOT_TOKEN, telegramProxyAgent ? {
  client: {
    fetch: (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1]
    ) => nodeFetch(input as any, { ...init, agent: telegramProxyAgent as any } as any) as any,
  },
} : undefined);
type TaskStatusValue = "TODO" | "IN_PROGRESS" | "DONE";
type TaskPriorityValue = "LOW" | "MEDIUM" | "HIGH";

const prisma = new PrismaClient() as any;
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

  http.createServer((_req, res) => {
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

const CHARS = "abcdefghjkmnpqrstuvwxyz23456789";

function generatePin(): string {
  let pin = "";
  for (let i = 0; i < 4; i++) pin += CHARS[crypto.randomInt(0, CHARS.length)];
  return pin;
}

async function generateUniquePin(): Promise<string> {
  for (let i = 0; i < 100; i++) {
    const pin = generatePin();
    const exists = await prisma.user.findFirst({
      where: { pinCode: { equals: pin, mode: "insensitive" } },
      select: { id: true },
    });
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
const panelMessageIds = new Map<number, number>();
const replyKeyboardChats = new Set<number>();

const MENU_TEXT = {
  menu: "📋 Меню",
  pin: "🔑 Мой PIN",
  orders: "📋 Мои заказы",
  profile: "👤 Профиль",
  report: "📝 Отправить отчёт",
  notifications: "🔔 Уведомления",
  tasks: "🗂 Мои задачи",
  createOrder: "➕ Создать заказ",
  upload: "📎 Загрузить файл",
  admin: "⚙️ Панель управления",
  status: "⏳ Статус заявки",
  site: "🌐 Открыть сайт",
} as const;

function mainMenuKeyboard(status: UserStatus, role?: UserRole): InlineKeyboard {
  const kb = new InlineKeyboard();

  if (status === "APPROVED") {
    kb.text("🔑 Мой PIN", "show_pin").text("🔄 Сменить PIN", "change_pin").row();
    kb.text("📋 Мои заказы", "my_orders").text("👤 Профиль", "my_profile").row();
    kb.text("📝 Отправить отчёт", "send_report").text("🔔 Уведомления", "my_notifs").row();
    kb.text("🗂 Мои задачи", "tasks_menu");
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

function withFrontendLink(kb: InlineKeyboard): InlineKeyboard {
  if (FRONTEND_URL) kb.row().url("🌐 Открыть сайт", FRONTEND_URL);
  return kb;
}

function mainReplyKeyboard(status: UserStatus, role?: UserRole) {
  const kb = new Keyboard();

  if (status === "APPROVED") {
    kb.text(MENU_TEXT.menu).text(MENU_TEXT.orders).row();
    kb.text(MENU_TEXT.tasks).text(MENU_TEXT.profile).row();
    kb.text(MENU_TEXT.pin).text(MENU_TEXT.notifications).row();
    kb.text(MENU_TEXT.report).text(MENU_TEXT.upload).row();
    if (role && MARKETER_ROLES.includes(role)) {
      kb.text(MENU_TEXT.createOrder).row();
    }
    if (role && ADMIN_ROLES.includes(role)) {
      kb.text(MENU_TEXT.admin).row();
    }
    if (FRONTEND_URL) {
      kb.text(MENU_TEXT.site).row();
    }
    kb.text("/menu").text("/tasks").text("/pin");
    if (role && ADMIN_ROLES.includes(role)) kb.text("/admin");
  } else if (status === "PENDING") {
    kb.text(MENU_TEXT.status);
    if (FRONTEND_URL) kb.text(MENU_TEXT.site);
    kb.row().text("/start");
  } else {
    kb.text("/start");
  }

  return kb.resized().persistent();
}

// Reply keyboard disabled — using inline keyboards and slash commands instead.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function ensureReplyKeyboard(_ctx: any, _status: UserStatus, _role?: UserRole) {}

async function removeLegacyReplyKeyboard(ctx: any) {
  if (ctx.chat?.type !== "private") return;

  const chatId = Number(ctx.chat.id);
  if (replyKeyboardChats.has(chatId)) return;

  try {
    const cleanup = await bot.api.sendMessage(chatId, "ㅤ", {
      reply_markup: { remove_keyboard: true },
    });
    try {
      await bot.api.deleteMessage(chatId, cleanup.message_id);
    } catch {}
  } catch {}

  replyKeyboardChats.add(chatId);
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

    await ensureReplyKeyboard(ctx, existing.status, existing.role);
    await replyOrEdit(
      ctx,
      `👋 ${existing.displayName}!\n\n${statusText}\nРоль: ${formatRole(existing.role)}`,
      { parse_mode: "Markdown", reply_markup: withFrontendLink(mainMenuKeyboard(existing.status, existing.role)) }
    );
    return;
  }

  // Новый пользователь — выбор роли
  const kb = new InlineKeyboard()
    .text("🎬 Креатор", "reg_CREATOR")
    .text("📋 Маркетолог", "reg_MARKETER");

  await replyOrEdit(
    ctx,
    `👋 Добро пожаловать в *TRENITY CRM*!\n\n` +
    `Для начала работы нужно подать заявку.\n` +
    `Выберите вашу роль:`,
    { parse_mode: "Markdown", reply_markup: withFrontendLink(kb) }
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
    { reply_markup: withFrontendLink(mainMenuKeyboard(UserStatus.PENDING)) }
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
  await sendPinPanel(ctx, user);
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
  await replyOrEdit(ctx, `✅ Новый PIN-код: \`${newPin}\``, {
    parse_mode: "Markdown",
    reply_markup: withFrontendLink(new InlineKeyboard().text("🔙 В меню", "back_menu")),
  });
});

// Статус заявки
bot.callbackQuery("check_status", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  await ctx.answerCallbackQuery();

  if (!user) {
    await replyOrEdit(ctx, "Вы не зарегистрированы. Нажмите /start", {
      reply_markup: withFrontendLink(new InlineKeyboard().text("🔙 Назад", "back_menu")),
    });
    return;
  }
  await sendStatusPanel(ctx, user);
});

// Профиль
bot.callbackQuery("my_profile", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user) { await ctx.answerCallbackQuery("Не найден"); return; }
  await ctx.answerCallbackQuery();
  await sendProfilePanel(ctx, BigInt(ctx.from!.id));
});

// Мои заказы
bot.callbackQuery("my_orders_legacy_disabled", async (ctx) => {
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
    const done = o.stages.filter((s: any) => s.status === "DONE").length;
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
// ==================== ЗАДАЧИ ====================

bot.callbackQuery("tasks_menu", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user || user.status !== "APPROVED") { await ctx.answerCallbackQuery("Недоступно"); return; }
  await ctx.answerCallbackQuery();
  await sendTaskMenuPanel(ctx, user);
});

bot.callbackQuery(/^tsk_list_(\d+)$/, async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user || user.status !== "APPROVED") { await ctx.answerCallbackQuery("Недоступно"); return; }

  const page = parseInt(ctx.match![1], 10);
  const [total, tasks] = await Promise.all([
    prisma.task.count({ where: { userId: user.id } }),
    prisma.task.findMany({
      where: { userId: user.id },
      orderBy: [{ updatedAt: "desc" }],
      skip: page * TASK_PAGE_SIZE,
      take: TASK_PAGE_SIZE,
      select: { id: true, title: true, status: true },
    }),
  ]);

  await ctx.answerCallbackQuery();
  await replyOrEdit(ctx, `🗂 *Список задач* (${total})`, {
    parse_mode: "Markdown",
    reply_markup: taskListKeyboard(tasks, page, total),
  });
});

bot.callbackQuery(/^tsk_open_(.+)$/, async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user || user.status !== "APPROVED") { await ctx.answerCallbackQuery("Недоступно"); return; }

  const taskId = ctx.match![1];
  const text = await getTaskDetailText(taskId, user.id);
  const kb = await taskDetailKeyboard(taskId, user.id);
  if (!text || !kb) { await ctx.answerCallbackQuery("Задача не найдена"); return; }

  await ctx.answerCallbackQuery();
  await replyOrEdit(ctx, text, { parse_mode: "Markdown", reply_markup: kb });
});

bot.callbackQuery("tsk_new", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user || user.status !== "APPROVED") { await ctx.answerCallbackQuery("Недоступно"); return; }

  waitingForTaskTitle.add(ctx.from!.id);
  await ctx.answerCallbackQuery();
  await ctx.reply("✍️ Введите название новой задачи:");
});

bot.callbackQuery("tsk_voice", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user || user.status !== "APPROVED") { await ctx.answerCallbackQuery("Недоступно"); return; }

  waitingForTaskVoice.add(ctx.from!.id);
  taskVoiceDraft.delete(ctx.from!.id);
  await ctx.answerCallbackQuery();
  await ctx.reply("🎙 Отправьте голосовое сообщение, и я превращу его в задачу.");
});

bot.callbackQuery("tsk_voice_ok", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  const draft = taskVoiceDraft.get(ctx.from!.id);
  if (!user || !draft) { await ctx.answerCallbackQuery("Черновик не найден"); return; }

  const task = await prisma.task.create({
    data: {
      userId: user.id,
      title: draft.title.trim(),
      description: draft.description?.trim() || undefined,
      priority: draft.priority,
      aiGenerated: true,
      subtasks: draft.subtasks.length
        ? { create: draft.subtasks.map((title, index) => ({ title: title.trim(), sortOrder: index })) }
        : undefined,
    },
  });

  taskVoiceDraft.delete(ctx.from!.id);
  await ctx.answerCallbackQuery("Задача создана");

  const text = await getTaskDetailText(task.id, user.id);
  const kb = await taskDetailKeyboard(task.id, user.id);
  if (text && kb) {
    await replyOrEdit(ctx, text, { parse_mode: "Markdown", reply_markup: kb });
  }
});

bot.callbackQuery("tsk_voice_cancel", async (ctx) => {
  taskVoiceDraft.delete(ctx.from!.id);
  waitingForTaskVoice.delete(ctx.from!.id);
  await ctx.answerCallbackQuery("Отменено");
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user) return;
  await replyOrEdit(ctx, await getTaskMenuText(user.id), {
    parse_mode: "Markdown",
    reply_markup: taskMenuKeyboard(),
  });
});

bot.callbackQuery(/^tsk_cycle_(.+)$/, async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user) { await ctx.answerCallbackQuery("Нет доступа"); return; }

  const taskId = ctx.match![1];
  const task = await prisma.task.findFirst({ where: { id: taskId, userId: user.id } });
  if (!task) { await ctx.answerCallbackQuery("Задача не найдена"); return; }

  await prisma.task.update({
    where: { id: task.id },
    data: { status: nextTaskStatus(task.status) },
  });

  await ctx.answerCallbackQuery("Статус обновлён");
  const text = await getTaskDetailText(task.id, user.id);
  const kb = await taskDetailKeyboard(task.id, user.id);
  if (text && kb) {
    await replyOrEdit(ctx, text, { parse_mode: "Markdown", reply_markup: kb });
  }
});

bot.callbackQuery(/^tsk_addsub_(.+)$/, async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user) { await ctx.answerCallbackQuery("Нет доступа"); return; }

  const taskId = ctx.match![1];
  const task = await prisma.task.findFirst({ where: { id: taskId, userId: user.id } });
  if (!task) { await ctx.answerCallbackQuery("Задача не найдена"); return; }

  waitingForSubtaskForTask.set(ctx.from!.id, task.id);
  await ctx.answerCallbackQuery();
  await ctx.reply(`➕ Отправьте текст новой подзадачи для «${task.title}».`);
});

bot.callbackQuery(/^tsk_sub_(.+)$/, async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user) { await ctx.answerCallbackQuery("Нет доступа"); return; }

  const subtaskId = ctx.match![1];
  const subtask = await prisma.taskSubtask.findUnique({
    where: { id: subtaskId },
    include: { task: true },
  });
  if (!subtask || subtask.task.userId !== user.id) { await ctx.answerCallbackQuery("Подзадача не найдена"); return; }

  await prisma.taskSubtask.update({
    where: { id: subtask.id },
    data: { done: !subtask.done },
  });

  await ctx.answerCallbackQuery(subtask.done ? "Снято" : "Отмечено");
  const text = await getTaskDetailText(subtask.taskId, user.id);
  const kb = await taskDetailKeyboard(subtask.taskId, user.id);
  if (text && kb) {
    await replyOrEdit(ctx, text, { parse_mode: "Markdown", reply_markup: kb });
  }
});

bot.callbackQuery(/^tsk_del_(.+)$/, async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user) { await ctx.answerCallbackQuery("Нет доступа"); return; }

  const taskId = ctx.match![1];
  const task = await prisma.task.findFirst({ where: { id: taskId, userId: user.id } });
  if (!task) { await ctx.answerCallbackQuery("Задача не найдена"); return; }

  await prisma.task.delete({ where: { id: task.id } });
  await ctx.answerCallbackQuery("Удалено");
  await replyOrEdit(ctx, await getTaskMenuText(user.id), {
    parse_mode: "Markdown",
    reply_markup: taskMenuKeyboard(),
  });
});

bot.callbackQuery("my_orders", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user) { await ctx.answerCallbackQuery("Не найден"); return; }
  await ctx.answerCallbackQuery();
  await sendOrdersPanel(ctx, user, 0);
});

bot.callbackQuery(/^ord_list_(\d+)$/, async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user) { await ctx.answerCallbackQuery("Не найден"); return; }
  await ctx.answerCallbackQuery();

  const page = parseInt(ctx.match![1], 10);
  const isMarketer = ["ADMIN", "HEAD_MARKETER", "MARKETER", "HEAD_CREATOR"].includes(user.role);
  const where = isMarketer
    ? { marketerId: user.id, status: { not: "ARCHIVED" } }
    : { creators: { some: { creatorId: user.id } }, status: { not: "ARCHIVED" } };

  const [total, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: page * ORDER_PAGE_SIZE,
      take: ORDER_PAGE_SIZE,
      select: { id: true, title: true, status: true },
    }),
  ]);

  await replyOrEdit(ctx, `📋 *Ваши заказы* (${total})`, {
    parse_mode: "Markdown",
    reply_markup: orderListKeyboard(orders, page, total),
  });
});

bot.callbackQuery(/^ord_open_(.+)$/, async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user) { await ctx.answerCallbackQuery("Нет доступа"); return; }
  const currentOrder = await fetchOrderForBot(ctx.match![1]);
  if (!currentOrder || !canAccessOrder(user, currentOrder)) { await ctx.answerCallbackQuery("No access"); return; }
  if (!currentOrder) { await ctx.answerCallbackQuery("Заказ не найден"); return; }

  await ctx.answerCallbackQuery();
  await replyOrEdit(ctx, await getOrderSummaryText(currentOrder), {
    parse_mode: "Markdown",
    reply_markup: orderDetailKeyboardV2(currentOrder),
  });
});

bot.callbackQuery(/^ord_stages_(.+)$/, async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user) { await ctx.answerCallbackQuery("Нет доступа"); return; }
  const order = await fetchOrderForBot(ctx.match![1]);
  if (!order) { await ctx.answerCallbackQuery("Заказ не найден"); return; }

  await ctx.answerCallbackQuery();
  await replyOrEdit(ctx, await getOrderStagesText(order), {
    parse_mode: "Markdown",
    reply_markup: orderStagesKeyboard(order, user),
  });
});

bot.callbackQuery(/^ord_reports_(.+)$/, async (ctx) => {
  const order = await fetchOrderForBot(ctx.match![1]);
  if (!order) { await ctx.answerCallbackQuery("Заказ не найден"); return; }

  let text = `📝 *Отчёты: ${esc(order.title)}*`;
  if (!order.reports?.length) {
    text += `\n\nОтчётов пока нет.`;
  } else {
    for (const report of order.reports.slice(0, 8)) {
      text += `\n\n*${esc(report.creator.displayName)}* • ${new Date(report.reportDate).toLocaleDateString("ru-RU")}\n${esc(report.reportText)}`;
    }
  }

  const kb = new InlineKeyboard()
    .text("➕ Добавить отчёт", `rpt_${order.id}`).row()
    .text("🔙 К заказу", `ord_open_${order.id}`);
  await ctx.answerCallbackQuery();
  await replyOrEdit(ctx, text, { parse_mode: "Markdown", reply_markup: kb });
});

bot.callbackQuery(/^ord_comments_(.+)$/, async (ctx) => {
  const order = await fetchOrderForBot(ctx.match![1]);
  if (!order) { await ctx.answerCallbackQuery("Заказ не найден"); return; }

  let text = `💬 *Комментарии: ${esc(order.title)}*`;
  if (!order.comments?.length) {
    text += `\n\nКомментариев пока нет.`;
  } else {
    for (const comment of order.comments.slice(-8)) {
      text += `\n\n*${esc(comment.author.displayName)}*:\n${esc(comment.text)}`;
    }
  }

  const kb = new InlineKeyboard()
    .text("✍️ Написать", `ord_cadd_${order.id}`).row()
    .text("🔙 К заказу", `ord_open_${order.id}`);
  await ctx.answerCallbackQuery();
  await replyOrEdit(ctx, text, { parse_mode: "Markdown", reply_markup: kb });
});

bot.callbackQuery(/^ord_tz_(.+)$/, async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  const order = await fetchOrderForBot(ctx.match![1]);
  if (!user || !order || !canAccessOrder(user, order)) { await ctx.answerCallbackQuery("No access"); return; }

  const tzFiles = getTzFiles(order);
  const kb = new InlineKeyboard()
    .text("🎙 AI из голоса", `ord_tzvoice_${order.id}`)
    .text("📝 Текст в ТЗ", `ord_tztext_${order.id}`).row()
    .text("📎 Файл в ТЗ", `ord_tzadd_${order.id}`)
    .text("📨 Отправить всё ТЗ", `ord_tzsend_${order.id}`);
  for (const file of tzFiles.slice(0, 8)) {
    const title = file.fileName.length > 26 ? `${file.fileName.slice(0, 26)}…` : file.fileName;
    kb.row().text(`📤 ${title}`, `ord_file_${file.id}`);
  }
  kb.row().text("🔙 Назад", `ord_open_${order.id}`);
  await ctx.answerCallbackQuery();
  await replyOrEdit(ctx, buildOrderFilesText(order, tzFiles, "📋 *ТЗ*", "Материалов ТЗ пока нет."), {
    parse_mode: "Markdown",
    reply_markup: buildOrderFilesKeyboard(
      order.id,
      tzFiles,
      `ord_tzadd_${order.id}`,
      `ord_open_${order.id}`,
      { text: "📨 Отправить всё ТЗ", callback: `ord_tzsend_${order.id}` }
    ),
  });
});

bot.callbackQuery(/^ord_files_(.+)$/, async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  const currentOrder = await fetchOrderForBot(ctx.match![1]);
  if (!user || !currentOrder || !canAccessOrder(user, currentOrder)) { await ctx.answerCallbackQuery("No access"); return; }

  const files = getNonTzFiles(currentOrder);
  const order = currentOrder;
  await ctx.answerCallbackQuery();
  await replyOrEdit(ctx, buildOrderFilesText(order, files, "📎 *Файлы*", "Обычных файлов пока нет."), {
    parse_mode: "Markdown",
    reply_markup: buildOrderFilesKeyboard(order.id, files, `ord_fadd_${order.id}`, `ord_open_${order.id}`),
  });
});

bot.callbackQuery(/^ord_tzadd_(.+)$/, async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  const order = await fetchOrderForBot(ctx.match![1]);
  if (!user || !order || !canUploadToOrder(user, order)) { await ctx.answerCallbackQuery("No access"); return; }
  await ctx.answerCallbackQuery();
  await startOrderFileCollection(ctx, order.id, "TZ", "📝 Добавление в ТЗ");
});

bot.callbackQuery(/^ord_fadd_(.+)$/, async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  const order = await fetchOrderForBot(ctx.match![1]);
  if (!user || !order || !canUploadToOrder(user, order)) { await ctx.answerCallbackQuery("No access"); return; }
  await ctx.answerCallbackQuery();
  await replyOrEdit(ctx, "Выберите тип файла:", {
    reply_markup: fileTypePickerKeyboard(order.id, `ord_files_${order.id}`, false),
  });
});

bot.callbackQuery(/^ord_tzsend_(.+)$/, async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  const order = await fetchOrderForBot(ctx.match![1]);
  if (!user || !order || !canAccessOrder(user, order)) { await ctx.answerCallbackQuery("No access"); return; }

  const tzFiles = getTzFiles(order);
  if (!tzFiles.length) { await ctx.answerCallbackQuery("Нет ТЗ"); return; }

  let sent = 0;
  await ctx.reply(`📨 Отправляю ТЗ по заказу *${esc(order.title)}*...`, { parse_mode: "Markdown" });
  for (const file of tzFiles) {
    if (await sendOrderFileToChat(ctx.chat!.id, file)) sent += 1;
  }
  await ctx.answerCallbackQuery(sent > 0 ? `Отправлено: ${sent}` : "Не удалось отправить");
});

bot.callbackQuery(/^ord_file_(.+)$/, async (ctx) => {
  const file = await prisma.orderFile.findUnique({ where: { id: ctx.match![1] } });
  if (!file) { await ctx.answerCallbackQuery("Файл не найден"); return; }
  const sent = await sendOrderFileToChat(ctx.chat!.id, file);
  await ctx.answerCallbackQuery(sent ? "Файл отправлен" : "Не удалось отправить");
});

bot.callbackQuery(/^ord_tztext_(.+)$/, async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  const order = await fetchOrderForBot(ctx.match![1]);
  if (!user || !order || !canUploadToOrder(user, order)) { await ctx.answerCallbackQuery("No access"); return; }
  waitingForTzNote.set(ctx.from!.id, order.id);
  await ctx.answerCallbackQuery();
  await replyOrEdit(ctx, `📝 Пришлите текст для ТЗ по заказу «${order.title}».`, {
    reply_markup: new InlineKeyboard().text("🔙 К заказу", `ord_open_${order.id}`),
  });
});

bot.callbackQuery(/^ord_tzvoice_(.+)$/, async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  const order = await fetchOrderForBot(ctx.match![1]);
  if (!user || !order || !canUploadToOrder(user, order)) { await ctx.answerCallbackQuery("No access"); return; }
  waitingForTzVoice.set(ctx.from!.id, order.id);
  await ctx.answerCallbackQuery();
  await replyOrEdit(ctx, `🎙 Отправьте голосовое, и я превращу его в структурированное ТЗ для «${order.title}».`, {
    reply_markup: new InlineKeyboard().text("🔙 К заказу", `ord_open_${order.id}`),
  });
});

bot.callbackQuery("tz_vdraft_ok", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  const draft = tzVoiceDraft.get(ctx.from!.id);
  if (!user || !draft) { await ctx.answerCallbackQuery("Черновик не найден"); return; }

  tzVoiceDraft.delete(ctx.from!.id);
  await prisma.orderFile.create({
    data: {
      orderId: draft.orderId,
      uploadedById: user.id,
      fileType: "TZ",
      fileName: draft.text.slice(0, 500),
      fileSize: BigInt(Buffer.byteLength(draft.text, "utf8")),
      mimeType: "text/plain",
      storagePath: "",
      telegramFileId: null,
      telegramChatId: null,
      telegramMsgId: null,
    },
  });
  await mirrorTextToOrderGroup(draft.orderId, `📝 ТЗ от *${esc(user.displayName)}*\n${esc(draft.text.slice(0, 500))}`);

  await ctx.answerCallbackQuery("ТЗ сохранено");
  const order = await fetchOrderForBot(draft.orderId);
  if (!order) return;
  const tzFiles = getTzFiles(order);
  await replyOrEdit(ctx, buildOrderFilesText(order, tzFiles, "📋 *ТЗ*", "Материалов ТЗ пока нет."), {
    parse_mode: "Markdown",
    reply_markup: buildOrderFilesKeyboard(
      order.id,
      tzFiles,
      `ord_tzadd_${order.id}`,
      `ord_open_${order.id}`,
      { text: "📨 Отправить всё ТЗ", callback: `ord_tzsend_${order.id}` }
    ),
  });
});

bot.callbackQuery("tz_vdraft_cancel", async (ctx) => {
  waitingForTzVoice.delete(ctx.from!.id);
  tzVoiceDraft.delete(ctx.from!.id);
  await ctx.answerCallbackQuery("Отменено");
});

bot.callbackQuery(/^ord_cadd_(.+)$/, async (ctx) => {
  const order = await fetchOrderForBot(ctx.match![1]);
  if (!order) { await ctx.answerCallbackQuery("Заказ не найден"); return; }
  waitingForOrderComment.set(ctx.from!.id, order.id);
  await ctx.answerCallbackQuery();
  await replyOrEdit(ctx, `✍️ Напишите комментарий к заказу «${order.title}».`, {
    reply_markup: new InlineKeyboard().text("🔙 К заказу", `ord_open_${order.id}`),
  });
});

bot.callbackQuery(/^ord_sstart_(.+)$/, async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  const stage = await prisma.orderStage.findUnique({ where: { id: ctx.match![1] }, include: { order: { include: { creators: true } } } });
  if (!user || !stage || !canManageOrder(user, stage.order)) { await ctx.answerCallbackQuery("Нет доступа"); return; }

  await prisma.orderStage.update({
    where: { id: stage.id },
    data: { status: "IN_PROGRESS", startedAt: stage.startedAt ?? new Date() },
  });
  await syncOrderStatusBot(stage.orderId);
  const order = await fetchOrderForBot(stage.orderId);
  if (!order) return;
  await ctx.answerCallbackQuery("Этап начат");
  await replyOrEdit(ctx, await getOrderStagesText(order), {
    parse_mode: "Markdown",
    reply_markup: orderStagesKeyboard(order, user),
  });
});

bot.callbackQuery(/^ord_sdone_(.+)$/, async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  const stage = await prisma.orderStage.findUnique({ where: { id: ctx.match![1] }, include: { order: { include: { creators: true } } } });
  if (!user || !stage) { await ctx.answerCallbackQuery("Этап не найден"); return; }

  const canDone = stage.name === "REVIEW" ? canApproveReviewStage(user, stage.order) : (canManageOrder(user, stage.order) || canApproveReviewStage(user, stage.order));
  if (!canDone || stage.awaitingClientApproval) { await ctx.answerCallbackQuery("Нет доступа"); return; }

  await prisma.orderStage.update({
    where: { id: stage.id },
    data: {
      status: "DONE",
      completedAt: new Date(),
      awaitingClientApproval: false,
    },
  });
  await syncOrderStatusBot(stage.orderId);
  const order = await fetchOrderForBot(stage.orderId);
  if (!order) return;
  await ctx.answerCallbackQuery("Этап завершён");
  await replyOrEdit(ctx, await getOrderStagesText(order), {
    parse_mode: "Markdown",
    reply_markup: orderStagesKeyboard(order, user),
  });
});

bot.callbackQuery(/^ord_sreset_(.+)$/, async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  const stage = await prisma.orderStage.findUnique({ where: { id: ctx.match![1] }, include: { order: true } });
  if (!user || !stage || !canManageOrder(user, stage.order)) { await ctx.answerCallbackQuery("Нет доступа"); return; }

  await prisma.orderStage.update({
    where: { id: stage.id },
    data: {
      status: "PENDING",
      startedAt: null,
      completedAt: null,
      awaitingClientApproval: false,
      clientApprovalSkipped: false,
      clientApprovedAt: null,
    },
  });
  await syncOrderStatusBot(stage.orderId);
  const order = await fetchOrderForBot(stage.orderId);
  if (!order) return;
  await ctx.answerCallbackQuery("Этап откатан");
  await replyOrEdit(ctx, await getOrderStagesText(order), {
    parse_mode: "Markdown",
    reply_markup: orderStagesKeyboard(order, user),
  });
});

bot.callbackQuery(/^ord_careq_(.+)$/, async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  const stage = await prisma.orderStage.findUnique({ where: { id: ctx.match![1] }, include: { order: true } });
  if (!user || !stage || !canManageOrder(user, stage.order)) { await ctx.answerCallbackQuery("Нет доступа"); return; }

  await prisma.orderStage.update({
    where: { id: stage.id },
    data: { awaitingClientApproval: true, clientApprovalSkipped: false, clientApprovedAt: null },
  });
  const order = await fetchOrderForBot(stage.orderId);
  if (!order) return;
  await ctx.answerCallbackQuery("Апрув запрошен");
  await replyOrEdit(ctx, await getOrderStagesText(order), {
    parse_mode: "Markdown",
    reply_markup: orderStagesKeyboard(order, user),
  });
});

bot.callbackQuery(/^ord_caskip_(.+)$/, async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  const stage = await prisma.orderStage.findUnique({ where: { id: ctx.match![1] }, include: { order: true } });
  if (!user || !stage || !canManageOrder(user, stage.order)) { await ctx.answerCallbackQuery("Нет доступа"); return; }

  await prisma.orderStage.update({
    where: { id: stage.id },
    data: { awaitingClientApproval: false, clientApprovalSkipped: true, clientApprovedAt: null },
  });
  const order = await fetchOrderForBot(stage.orderId);
  if (!order) return;
  await ctx.answerCallbackQuery("Апрув пропущен");
  await replyOrEdit(ctx, await getOrderStagesText(order), {
    parse_mode: "Markdown",
    reply_markup: orderStagesKeyboard(order, user),
  });
});

bot.callbackQuery(/^ord_caok_(.+)$/, async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  const stage = await prisma.orderStage.findUnique({ where: { id: ctx.match![1] }, include: { order: { include: { creators: true } } } });
  if (!user || !stage || !canApproveReviewStage(user, stage.order)) { await ctx.answerCallbackQuery("Нет доступа"); return; }

  await prisma.orderStage.update({
    where: { id: stage.id },
    data: { awaitingClientApproval: false, clientApprovalSkipped: false, clientApprovedAt: new Date() },
  });
  const order = await fetchOrderForBot(stage.orderId);
  if (!order) return;
  await ctx.answerCallbackQuery("Апрув подтверждён");
  await replyOrEdit(ctx, await getOrderStagesText(order), {
    parse_mode: "Markdown",
    reply_markup: orderStagesKeyboard(order, user),
  });
});

bot.callbackQuery(/^ord_rev_(.+)$/, async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  const order = await fetchOrderForBot(ctx.match![1]);
  if (!user || !order || !canManageOrder(user, order)) { await ctx.answerCallbackQuery("Нет доступа"); return; }

  const currentStages = getCurrentRoundStages(order.stages ?? []);
  const currentRoundDone = currentStages.length > 0 && currentStages.every((stage: any) => stage.status === "DONE");
  if (!currentRoundDone) { await ctx.answerCallbackQuery("Раунд ещё не завершён"); return; }

  const newRound = (currentStages[0]?.revisionRound ?? 0) + 1;
  const defaults = [
    { name: "STORYBOARD", sortOrder: 1 },
    { name: "ANIMATION", sortOrder: 2 },
    { name: "EDITING", sortOrder: 3 },
    { name: "REVIEW", sortOrder: 4 },
    { name: "COMPLETED", sortOrder: 5 },
  ];
  await prisma.orderStage.createMany({
    data: defaults.map((stage) => ({
      orderId: order.id,
      name: stage.name,
      sortOrder: stage.sortOrder,
      revisionRound: newRound,
    })),
  });
  await prisma.order.update({ where: { id: order.id }, data: { status: "IN_PROGRESS" } });

  const updatedOrder = await fetchOrderForBot(order.id);
  if (!updatedOrder) return;
  await ctx.answerCallbackQuery("Новый раунд создан");
  await replyOrEdit(ctx, await getOrderStagesText(updatedOrder), {
    parse_mode: "Markdown",
    reply_markup: orderStagesKeyboard(updatedOrder, user),
  });
});

bot.callbackQuery("back_menu", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  await ctx.answerCallbackQuery();
  if (!user) return;
  await sendHomePanel(ctx, user);
});

// ==================== УВЕДОМЛЕНИЯ ====================

bot.callbackQuery("my_notifs", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user || user.status !== "APPROVED") { await ctx.answerCallbackQuery("Недоступно"); return; }
  await ctx.answerCallbackQuery();
  await sendNotificationsPanel(ctx, user);
});

bot.callbackQuery("notifs_read_all", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user) { await ctx.answerCallbackQuery("Нет доступа"); return; }

  await prisma.notification.updateMany({
    where: { userId: user.id, isRead: false },
    data: { isRead: true },
  });
  await ctx.answerCallbackQuery("Всё прочитано ✅");

  const notifs = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  let text = `🔔 *Уведомления*\n\nВсе прочитаны.`;
  for (const n of notifs) {
    const date = new Date(n.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
    text += `\n\n• _${date}_\n${esc(n.message)}`;
  }

  await replyOrEdit(ctx, text, {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard().text("🔙 В меню", "back_menu"),
  });
});

// ==================== ОТПРАВКА ОТЧЁТА ====================

const waitingForReport     = new Map<number, string>();
const waitingForName       = new Set<number>();
const waitingForOrderTitle = new Map<number, true>();
const waitingForTaskTitle  = new Set<number>();
const waitingForTaskVoice  = new Set<number>();
const waitingForSubtaskForTask = new Map<number, string>();
const waitingForOrderComment = new Map<number, string>();
const waitingForTzNote = new Map<number, string>();
const waitingForTzVoice = new Map<number, string>();
const waitingForCollectVoiceText = new Set<number>();
const waitingForCollectVoiceAi = new Set<number>();
const taskVoiceDraft = new Map<number, {
  title: string;
  description?: string;
  priority: TaskPriorityValue;
  subtasks: string[];
  rawText: string;
}>();
const tzVoiceDraft = new Map<number, {
  orderId: string;
  text: string;
  rawText: string;
}>();

const TASK_PAGE_SIZE = 8;
const ORDER_PAGE_SIZE = 8;

function taskStatusLabel(status: TaskStatusValue): string {
  return ({
    TODO: "К выполнению",
    IN_PROGRESS: "В работе",
    DONE: "Выполнено",
  })[status];
}

function taskStatusEmoji(status: TaskStatusValue): string {
  return ({
    TODO: "⬜",
    IN_PROGRESS: "🔄",
    DONE: "✅",
  })[status];
}

function taskPriorityLabel(priority: TaskPriorityValue): string {
  return ({
    LOW: "Низкий",
    MEDIUM: "Средний",
    HIGH: "Высокий",
  })[priority];
}

function taskPriorityEmoji(priority: TaskPriorityValue): string {
  return ({
    LOW: "⚪",
    MEDIUM: "🟡",
    HIGH: "🔴",
  })[priority];
}

function nextTaskStatus(status: TaskStatusValue): TaskStatusValue {
  if (status === "TODO") return "IN_PROGRESS";
  if (status === "IN_PROGRESS") return "DONE";
  return "TODO";
}

function taskMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📋 Список задач", "tsk_list_0").row()
    .text("➕ Новая задача", "tsk_new")
    .text("🎙 AI из голоса", "tsk_voice").row()
    .text("🔙 В меню", "back_menu");
}

function taskListKeyboard(tasks: Array<{ id: string; title: string; status: TaskStatusValue }>, page: number, total: number): InlineKeyboard {
  const kb = new InlineKeyboard();

  for (const task of tasks) {
    const title = task.title.length > 28 ? `${task.title.slice(0, 28)}…` : task.title;
    kb.text(`${taskStatusEmoji(task.status)} ${title}`, `tsk_open_${task.id}`).row();
  }

  const totalPages = Math.max(1, Math.ceil(total / TASK_PAGE_SIZE));
  if (page > 0) kb.text("← Назад", `tsk_list_${page - 1}`);
  if (page + 1 < totalPages) kb.text("Вперёд →", `tsk_list_${page + 1}`);
  if (page > 0 || page + 1 < totalPages) kb.row();
  kb.text("➕ Новая", "tsk_new").text("🎙 AI", "tsk_voice").row();
  kb.text("🔙 К задачам", "tasks_menu");
  return kb;
}

async function getTaskMenuText(userDbId: string): Promise<string> {
  const [todo, inProgress, done] = await Promise.all([
    prisma.task.count({ where: { userId: userDbId, status: "TODO" } }),
    prisma.task.count({ where: { userId: userDbId, status: "IN_PROGRESS" } }),
    prisma.task.count({ where: { userId: userDbId, status: "DONE" } }),
  ]);

  return (
    `🗂 *Мои задачи*\n\n` +
    `⬜ К выполнению: *${todo}*\n` +
    `🔄 В работе: *${inProgress}*\n` +
    `✅ Выполнено: *${done}*`
  );
}

async function getTaskDetailText(taskId: string, userDbId: string): Promise<string | null> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, userId: userDbId },
    include: { subtasks: { orderBy: { sortOrder: "asc" } } },
  });
  if (!task) return null;

  let text =
    `${taskStatusEmoji(task.status)} *${esc(task.title)}*\n` +
    `Приоритет: ${taskPriorityEmoji(task.priority)} ${taskPriorityLabel(task.priority)}\n` +
    `Статус: ${taskStatusLabel(task.status)}`;

  if (task.aiGenerated) text += `\nAI: да`;
  if (task.description) text += `\n\n${esc(task.description)}`;

  if (task.subtasks.length > 0) {
    text += "\n\n*Подзадачи:*";
    for (const subtask of task.subtasks) {
      text += `\n${subtask.done ? "✅" : "⬜"} ${esc(subtask.title)}`;
    }
  }

  return text;
}

async function taskDetailKeyboard(taskId: string, userDbId: string): Promise<InlineKeyboard | null> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, userId: userDbId },
    include: { subtasks: { orderBy: { sortOrder: "asc" } } },
  });
  if (!task) return null;

  const kb = new InlineKeyboard()
    .text(
      task.status === "TODO" ? "▶️ Начать" : task.status === "IN_PROGRESS" ? "✅ Завершить" : "↺ Вернуть в TODO",
      `tsk_cycle_${task.id}`
    ).row()
    .text("➕ Подзадача", `tsk_addsub_${task.id}`)
    .text("🗑 Удалить", `tsk_del_${task.id}`).row();

  for (const subtask of task.subtasks) {
    const title = subtask.title.length > 24 ? `${subtask.title.slice(0, 24)}…` : subtask.title;
    kb.text(`${subtask.done ? "✅" : "⬜"} ${title}`, `tsk_sub_${subtask.id}`).row();
  }

  kb.text("🔙 К списку", "tsk_list_0");
  return kb;
}

async function replyOrEdit(ctx: any, text: string, extra: Record<string, any>) {
  await removeLegacyReplyKeyboard(ctx);

  if (ctx.callbackQuery?.message) {
    try {
      await ctx.editMessageText(text, extra);
      if (ctx.chat?.type === "private") {
        panelMessageIds.set(Number(ctx.chat.id), ctx.callbackQuery.message.message_id);
      }
      return;
    } catch {}
  }

  if (ctx.chat?.type === "private") {
    const chatId = Number(ctx.chat.id);
    const currentPanelId = panelMessageIds.get(chatId);
    if (currentPanelId) {
      try { await bot.api.deleteMessage(chatId, currentPanelId); } catch {}
      panelMessageIds.delete(chatId);
    }
  }

  const sent = await ctx.reply(text, extra);
  if (ctx.chat?.type === "private" && sent?.message_id) {
    panelMessageIds.set(Number(ctx.chat.id), sent.message_id);
  }
}

function clearInteractiveState(userId: number) {
  waitingForReport.delete(userId);
  waitingForName.delete(userId);
  waitingForOrderTitle.delete(userId);
  waitingForTaskTitle.delete(userId);
  waitingForTaskVoice.delete(userId);
  waitingForSubtaskForTask.delete(userId);
  waitingForOrderComment.delete(userId);
  waitingForTzNote.delete(userId);
  waitingForTzVoice.delete(userId);
  waitingForCollectVoiceText.delete(userId);
  waitingForCollectVoiceAi.delete(userId);
  taskVoiceDraft.delete(userId);
  tzVoiceDraft.delete(userId);
  collectingState.delete(userId);
}

async function sendHomePanel(ctx: any, user: any) {
  await ensureReplyKeyboard(ctx, user.status, user.role);
  await replyOrEdit(ctx, "📋 Главное меню:", {
    reply_markup: withFrontendLink(mainMenuKeyboard(user.status, user.role)),
  });
}

async function sendPinPanel(ctx: any, user: any) {
  if (!user.pinCode) {
    await sendHomePanel(ctx, user);
    return;
  }
  await replyOrEdit(ctx, `🔑 Ваш PIN: \`${user.pinCode}\``, {
    parse_mode: "Markdown",
    reply_markup: withFrontendLink(new InlineKeyboard().text("🔙 В меню", "back_menu")),
  });
}

async function sendStatusPanel(ctx: any, user: any) {
  const statusText: Record<string, string> = {
    APPROVED: "✅ Вы одобрены и можете пользоваться CRM.",
    PENDING: "⏳ Ваша заявка ещё на рассмотрении.",
    REJECTED: "❌ Заявка отклонена.",
    BLOCKED: "🚫 Аккаунт заблокирован.",
  };
  await replyOrEdit(ctx, statusText[user.status] || user.status, {
    reply_markup: withFrontendLink(mainMenuKeyboard(user.status, user.role)),
  });
}

async function sendProfilePanel(ctx: any, telegramId: bigint) {
  const user = await prisma.user.findUnique({
    where: { telegramId },
    include: {
      teamLead: { select: { displayName: true, telegramUsername: true } },
      _count: { select: { assignments: true, createdOrders: true } },
    },
  });

  if (!user) return null;

  let text = `👤 *Ваш профиль*\n\n` +
    `Имя: ${user.displayName}\n` +
    `Telegram: @${user.telegramUsername || "—"}\n` +
    `Роль: ${formatRole(user.role)}\n` +
    `Статус: ${user.status}\n`;

  if (user.teamLead) {
    text += `Тимлид: ${user.teamLead.displayName} (@${user.teamLead.telegramUsername || "—"})\n`;
  }

  if (user.avatarUrl) {
    text += `Avatar URL: ${user.avatarUrl}\n`;
  }

  text += `\nЗаказов создано: ${user._count.createdOrders}\n`;
  text += `Назначений: ${user._count.assignments}\n`;
  text += `Зарегистрирован: ${user.createdAt.toLocaleDateString("ru-RU")}`;

  const kb = new InlineKeyboard().text("✏️ Изменить имя", "edit_name").text("🔙 Меню", "back_menu");
  await replyOrEdit(ctx, text, { parse_mode: "Markdown", reply_markup: kb });
  return user;
}

async function sendTaskMenuPanel(ctx: any, user: any) {
  await replyOrEdit(ctx, await getTaskMenuText(user.id), {
    parse_mode: "Markdown",
    reply_markup: taskMenuKeyboard(),
  });
}

async function sendOrdersPanel(ctx: any, user: any, page = 0) {
  const where = getOrderScopeWhere(user);
  const [total, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: page * ORDER_PAGE_SIZE,
      take: ORDER_PAGE_SIZE,
      select: { id: true, title: true, status: true },
    }),
  ]);

  if (orders.length === 0) {
    await replyOrEdit(ctx, "📭 Нет активных заказов.", {
      reply_markup: withFrontendLink(mainMenuKeyboard(user.status, user.role)),
    });
    return;
  }

  await replyOrEdit(ctx, `📋 *Ваши заказы* (${total})`, {
    parse_mode: "Markdown",
    reply_markup: orderListKeyboard(orders, page, total),
  });
}

async function sendUploadMenuPanel(ctx: any, user: any) {
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
    await replyOrEdit(ctx, "📭 Нет активных заказов.", {
      reply_markup: withFrontendLink(mainMenuKeyboard(user.status, user.role)),
    });
    return;
  }

  const kb = new InlineKeyboard();
  for (const o of orders) kb.text(o.title.slice(0, 40), `upl_ord_${o.id}`).row();
  kb.text("🔙 Отмена", "back_menu");
  await replyOrEdit(ctx, "📎 *Загрузить файлы*\n\nВыберите заказ:", {
    parse_mode: "Markdown",
    reply_markup: kb,
  });
}

async function sendNotificationsPanel(ctx: any, user: any) {
  const notifs = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const unread = notifs.filter((n: any) => !n.isRead).length;
  let text = `🔔 *Уведомления*`;
  if (unread > 0) text += ` (${unread} новых)`;

  if (!notifs.length) {
    text += `\n\nУведомлений нет.`;
  } else {
    for (const n of notifs) {
      const dot = n.isRead ? "•" : "🔴";
      const date = new Date(n.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
      text += `\n\n${dot} _${date}_\n${esc(n.message)}`;
    }
  }

  const kb = new InlineKeyboard();
  if (unread > 0) kb.text("✅ Прочитать все", "notifs_read_all").row();
  kb.text("🔙 В меню", "back_menu");
  await replyOrEdit(ctx, text, { parse_mode: "Markdown", reply_markup: kb });
}

async function sendReportPanel(ctx: any, user: any) {
  const orders = await prisma.order.findMany({
    where: { creators: { some: { creatorId: user.id } }, status: { in: ["IN_PROGRESS", "ON_REVIEW"] } },
    select: { id: true, title: true },
  });

  if (orders.length === 0) {
    await replyOrEdit(ctx, "📭 Нет активных заказов для отчёта.", {
      reply_markup: withFrontendLink(mainMenuKeyboard(user.status, user.role)),
    });
    return;
  }

  if (orders.length === 1) {
    waitingForReport.set(ctx.from!.id, orders[0].id);
    await replyOrEdit(ctx, `📝 Отчёт по «${orders[0].title}»\n\nНапишите, что сделали сегодня:`, {
      reply_markup: new InlineKeyboard().text("🔙 В меню", "back_menu"),
    });
    return;
  }

  const kb = new InlineKeyboard();
  for (const o of orders) {
    kb.text(o.title.slice(0, 40), `rpt_${o.id}`).row();
  }
  kb.text("🔙 В меню", "back_menu");
  await replyOrEdit(ctx, "📝 Выберите заказ:", { reply_markup: kb });
}

async function sendFrontendLinkPanel(ctx: any, _user: any) {
  const kb = withFrontendLink(new InlineKeyboard().text("🔙 В меню", "back_menu"));
  await replyOrEdit(ctx, "🌐 Сайт открыт по кнопке ниже.", { reply_markup: kb });
}

async function getOrderGroupByChatId(chatId: number | string) {
  return prisma.order.findFirst({
    where: { telegramGroupChatId: BigInt(chatId.toString()) },
    select: { id: true, title: true, deadline: true, telegramGroupChatId: true },
  });
}

async function getOrderGroupChatId(orderId: string): Promise<string | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { telegramGroupChatId: true },
  });
  return order?.telegramGroupChatId ? order.telegramGroupChatId.toString() : null;
}

function groupFileTypeFromMessage(info: FileInfo, caption?: string | null): string {
  const text = `${caption || ""} ${info.fileName || ""}`.toLowerCase();
  if (text.includes("#tz") || text.includes(" тз") || text.startsWith("тз")) return "TZ";
  if (text.includes("договор") || text.includes("contract")) return "CONTRACT";
  if (text.includes("раскадров") || text.includes("storyboard")) return "STORYBOARD";
  if (text.includes("финал")) return "VIDEO_FINAL";
  if (text.includes("чернов")) return "VIDEO_DRAFT";
  return "OTHER";
}

function isGroupCommandMessage(ctx: any, text: string): boolean {
  const lower = text.trim().toLowerCase();
  if (!lower) return false;
  if (lower.startsWith("бот")) return true;
  if (BOT_USERNAME && lower.includes(`@${BOT_USERNAME}`)) return true;
  if (ctx.message.reply_to_message?.from?.id && BOT_SELF_ID && ctx.message.reply_to_message.from.id === BOT_SELF_ID) return true;
  return false;
}

async function parseGroupCommand(text: string, order: any): Promise<string> {
  const prompt = [
    "Определи действие по сообщению для CRM-бота в рабочей Telegram-группе заказа.",
    "Ответь только JSON вида {\"action\":\"SHOW_TZ|SHOW_DEADLINE|SHOW_STATUS|SHOW_FILES|SHOW_REPORTS|SHOW_STAGES|TAG_ALL|HELP|UNKNOWN\"}.",
    `Заказ: ${order.title}`,
    `Сообщение: ${text}`,
  ].join("\n");

  const parsed = await callJsonAi(
    prompt,
    "Ты помощник CRM-бота в рабочем чате заказа. Отвечай только валидным JSON с полем action."
  );
  const action = String(parsed?.action || "UNKNOWN").toUpperCase();
  return action;
}

async function handleGroupCommand(ctx: any, order: any, rawText: string) {
  const action = await parseGroupCommand(rawText, order);
  const fullOrder = await fetchOrderForBot(order.id);
  if (!fullOrder) {
    await ctx.reply("Не вижу заказ в CRM.");
    return;
  }

  if (action === "SHOW_TZ") {
    const tzFiles = getTzFiles(fullOrder);
    if (!tzFiles.length) {
      await ctx.reply("В заказе пока нет ТЗ.");
      return;
    }
    await ctx.reply(buildOrderFilesText(fullOrder, tzFiles, "📝 ТЗ", "ТЗ пока нет."), { parse_mode: "Markdown" });
    for (const file of tzFiles.slice(0, 3)) {
      await sendOrderFileToChat(ctx.chat!.id, file).catch(() => false);
    }
    return;
  }

  if (action === "SHOW_DEADLINE" || action === "SHOW_DEADLINES") {
    const deadlineText = fullOrder.deadline
      ? new Date(fullOrder.deadline).toLocaleDateString("ru-RU")
      : "не задан";
    await ctx.reply(`⏰ Дедлайн по заказу *${esc(fullOrder.title)}*: ${deadlineText}`, { parse_mode: "Markdown" });
    return;
  }

  if (action === "SHOW_STATUS") {
    await ctx.reply(await getOrderSummaryText(fullOrder), { parse_mode: "Markdown" });
    return;
  }

  if (action === "SHOW_FILES") {
    const files = getNonTzFiles(fullOrder);
    await ctx.reply(buildOrderFilesText(fullOrder, files, "📎 Файлы", "Обычных файлов пока нет."), { parse_mode: "Markdown" });
    return;
  }

  if (action === "SHOW_REPORTS") {
    let text = `📝 *Отчёты: ${esc(fullOrder.title)}*`;
    if (!fullOrder.reports?.length) {
      text += "\n\nОтчётов пока нет.";
    } else {
      for (const report of fullOrder.reports.slice(0, 5)) {
        text += `\n\n*${esc(report.creator.displayName)}* • ${new Date(report.reportDate).toLocaleDateString("ru-RU")}\n${esc(report.reportText)}`;
      }
    }
    await ctx.reply(text, { parse_mode: "Markdown" });
    return;
  }

  if (action === "SHOW_STAGES") {
    await ctx.reply(await getOrderStagesText(fullOrder), { parse_mode: "Markdown" });
    return;
  }

  if (action === "TAG_ALL") {
    const labels = [fullOrder.marketer, ...(fullOrder.creators || []).map((item: any) => item.creator)]
      .filter(Boolean)
      .map((member: any) => member.telegramUsername ? `@${member.telegramUsername}` : member.displayName);
    await ctx.reply(labels.length ? labels.join(" ") : "Не нашёл кого тегнуть.");
    return;
  }

  await ctx.reply("Я понимаю команды вроде: «бот, скинь ТЗ», «бот, покажи дедлайны», «бот, покажи статус», «бот, тегни всех».");
}

async function saveGroupComment(orderId: string, telegramUserId: number, text: string) {
  const author = await prisma.user.findUnique({
    where: { telegramId: BigInt(telegramUserId) },
    select: { id: true, displayName: true, status: true },
  });
  if (!author || author.status !== "APPROVED") return false;

  await prisma.orderComment.create({
    data: {
      orderId,
      authorId: author.id,
      text,
      source: "TELEGRAM",
    },
  });
  return true;
}

async function mirrorTextToOrderGroup(orderId: string, text: string) {
  const chatId = await getOrderGroupChatId(orderId);
  if (!chatId) return;
  await bot.api.sendMessage(chatId, text, { parse_mode: "Markdown" }).catch(() => {});
}

async function mirrorStorageMessageToOrderGroup(orderId: string, fromChatId: string, messageId: number) {
  const chatId = await getOrderGroupChatId(orderId);
  if (!chatId) return;
  await bot.api.copyMessage(chatId, fromChatId, messageId).catch(() => {});
}

function orderStatusEmoji(status: string): string {
  return {
    NEW: "🆕",
    IN_PROGRESS: "🔄",
    ON_REVIEW: "👀",
    DONE: "✅",
    ARCHIVED: "📦",
  }[status] || "📋";
}

function stageLabel(name: string): string {
  return {
    STORYBOARD: "Раскадровка",
    ANIMATION: "Анимация",
    EDITING: "Монтаж",
    REVIEW: "На правках",
    COMPLETED: "Видео готово",
  }[name] || name;
}

function stageEmoji(status: string): string {
  return {
    PENDING: "⬜",
    IN_PROGRESS: "🟡",
    DONE: "✅",
  }[status] || "⬜";
}

function fileTypeLabel(fileType: string): string {
  return {
    TZ: "ТЗ",
    CONTRACT: "Договор",
    STORYBOARD: "Раскадровка",
    VIDEO_DRAFT: "Черновик видео",
    VIDEO_FINAL: "Финальное видео",
    OTHER: "Файл",
  }[fileType] || fileType;
}

function getOrderScopeWhere(user: any): any {
  if (user.role === "ADMIN" || user.role === "HEAD_MARKETER" || user.role === "HEAD_CREATOR") {
    return { status: { not: "ARCHIVED" } };
  }
  if (user.role === "MARKETER") {
    return { marketerId: user.id, status: { not: "ARCHIVED" } };
  }
  return { creators: { some: { creatorId: user.id } }, status: { not: "ARCHIVED" } };
}

function getTzFiles(order: any): any[] {
  return (order.files ?? []).filter((file: any) => file.fileType === "TZ");
}

function getNonTzFiles(order: any): any[] {
  return (order.files ?? []).filter((file: any) => file.fileType !== "TZ");
}

function canManageOrder(user: any, order: any): boolean {
  return (
    user?.role === "ADMIN" ||
    user?.role === "HEAD_MARKETER" ||
    user?.role === "HEAD_CREATOR" ||
    order?.marketerId === user?.id
  );
}

function canAccessOrder(user: any, order: any): boolean {
  if (!user || !order) return false;
  if (canManageOrder(user, order)) return true;
  return !!order.creators?.some((creator: any) => creator.creatorId === user.id);
}

function canUploadToOrder(user: any, order: any): boolean {
  return canAccessOrder(user, order);
}

function canApproveReviewStage(user: any, order: any): boolean {
  if (!user || !order) return false;
  if (["ADMIN", "HEAD_MARKETER", "MARKETER"].includes(user.role)) return true;
  return !!order.creators?.some((creator: any) => creator.creatorId === user.id && creator.isLead);
}

function getCurrentRoundStages(stages: any[]): any[] {
  const maxRound = stages.length ? Math.max(...stages.map((stage: any) => stage.revisionRound ?? 0)) : 0;
  return stages
    .filter((stage: any) => (stage.revisionRound ?? 0) === maxRound)
    .sort((a: any, b: any) => a.sortOrder - b.sortOrder);
}

async function fetchOrderForBot(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: {
      marketer: { select: { id: true, displayName: true, telegramUsername: true, role: true } },
      creators: {
        include: {
          creator: { select: { id: true, displayName: true, telegramUsername: true, role: true } },
        },
      },
      stages: { orderBy: [{ revisionRound: "asc" }, { sortOrder: "asc" }] },
      reports: {
        include: { creator: { select: { id: true, displayName: true, telegramUsername: true } } },
        orderBy: { reportDate: "desc" },
        take: 10,
      },
      comments: {
        include: { author: { select: { id: true, displayName: true, telegramUsername: true, role: true } } },
        orderBy: { createdAt: "asc" },
        take: 10,
      },
      files: {
        select: {
          id: true,
          fileName: true,
          fileType: true,
          uploadedAt: true,
          uploadedById: true,
          mimeType: true,
          telegramFileId: true,
          telegramChatId: true,
          telegramMsgId: true,
        },
        orderBy: { uploadedAt: "desc" },
        take: 20,
      },
      _count: { select: { reports: true, comments: true, files: true } },
    },
  });
}

function orderListKeyboard(orders: any[], page: number, total: number): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const order of orders) {
    const title = order.title.length > 26 ? `${order.title.slice(0, 26)}…` : order.title;
    kb.text(`${orderStatusEmoji(order.status)} ${title}`, `ord_open_${order.id}`).row();
  }

  const totalPages = Math.max(1, Math.ceil(total / ORDER_PAGE_SIZE));
  if (page > 0) kb.text("← Назад", `ord_list_${page - 1}`);
  if (page + 1 < totalPages) kb.text("Вперёд →", `ord_list_${page + 1}`);
  if (page > 0 || page + 1 < totalPages) kb.row();
  kb.text("🔙 В меню", "back_menu");
  return kb;
}

function orderDetailKeyboardV2(order: any): InlineKeyboard {
  const tzCount = getTzFiles(order).length;
  const nonTzCount = getNonTzFiles(order).length;

  return new InlineKeyboard()
    .text("🎬 Этапы", `ord_stages_${order.id}`)
    .text(`📝 Отчёты (${order._count?.reports ?? 0})`, `ord_reports_${order.id}`).row()
    .text(`💬 Комментарии (${order._count?.comments ?? 0})`, `ord_comments_${order.id}`)
    .text(`📋 ТЗ (${tzCount})`, `ord_tz_${order.id}`).row()
    .text(`📎 Файлы (${nonTzCount})`, `ord_files_${order.id}`)
    .text("🔄 Обновить", `ord_open_${order.id}`).row()
    .text("🔙 К списку", "ord_list_0");
}

function fileTypePickerKeyboard(orderId: string, backCallback = "back_menu", includeTz = false): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (includeTz) kb.text("📝 ТЗ", `upl_type_${orderId}_TZ`).row();
  kb
    .text("🎞 Раскадровка", `upl_type_${orderId}_STORYBOARD`).row()
    .text("🎬 Черновик видео", `upl_type_${orderId}_VIDEO_DRAFT`).row()
    .text("✅ Финальное видео", `upl_type_${orderId}_VIDEO_FINAL`).row()
    .text("📄 Договор", `upl_type_${orderId}_CONTRACT`).row()
    .text("📎 Другое", `upl_type_${orderId}_OTHER`).row()
    .text("🔙 Назад", backCallback);
  return kb;
}

function buildOrderFilesText(order: any, files: any[], title: string, emptyText: string): string {
  let text = `${title}: *${esc(order.title)}*`;
  if (!files.length) return `${text}\n\n${emptyText}`;

  for (const file of files.slice(0, 10)) {
    const uploadedAt = new Date(file.uploadedAt).toLocaleDateString("ru-RU");
    text += `\n\n• *${esc(file.fileName)}*\nТип: ${esc(fileTypeLabel(file.fileType))}\nДата: ${uploadedAt}`;
  }

  if (files.length > 10) {
    text += `\n\nИ ещё ${files.length - 10} файлов.`;
  }

  return text;
}

function buildOrderFilesKeyboard(
  orderId: string,
  files: any[],
  addCallback: string,
  backCallback: string,
  extraTopButton?: { text: string; callback: string }
): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (extraTopButton) kb.text(extraTopButton.text, extraTopButton.callback).row();
  if (addCallback.startsWith("ord_tzadd_")) {
    kb.text("🎙 AI из голоса", `ord_tzvoice_${orderId}`)
      .text("📝 Текст в ТЗ", `ord_tztext_${orderId}`).row();
  }
  kb.text("➕ Добавить материал", addCallback).row();
  for (const file of files.slice(0, 8)) {
    const title = file.fileName.length > 28 ? `${file.fileName.slice(0, 28)}…` : file.fileName;
    kb.text(`📤 ${title}`, `ord_file_${file.id}`).row();
  }
  kb.text("🔙 Назад", backCallback);
  return kb;
}

async function sendOrderFileToChat(chatId: number, file: any) {
  if (file.mimeType === "text/plain") {
    await bot.api.sendMessage(chatId, file.fileName);
    return true;
  }

  if (file.telegramChatId && file.telegramMsgId) {
    await bot.api.copyMessage(chatId, file.telegramChatId, file.telegramMsgId);
    return true;
  }

  if (file.telegramFileId) {
    if (file.mimeType?.startsWith("image/")) {
      await bot.api.sendPhoto(chatId, file.telegramFileId, { caption: file.fileName });
    } else if (file.mimeType?.startsWith("video/")) {
      await bot.api.sendVideo(chatId, file.telegramFileId, { caption: file.fileName });
    } else {
      await bot.api.sendDocument(chatId, file.telegramFileId, { caption: file.fileName });
    }
    return true;
  }

  return false;
}

async function startOrderFileCollection(ctx: any, orderId: string, targetFileType: string, promptTitle: string) {
  collectingState.set(ctx.from!.id, { mode: "attach_files", orderId, targetFileType, items: [] });
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { title: true } });
  const canUseTzVoice = targetFileType === "TZ";
  await replyOrEdit(
    ctx,
    `${promptTitle}: *${order?.title || orderId}*\n\nОтправляйте файлы, фото, видео, голосовые или текст. Когда закончите — нажмите Готово.`,
    { parse_mode: "Markdown", reply_markup: collectingKeyboard({ tzVoice: canUseTzVoice }) }
  );
}

async function getOrderSummaryText(order: any): Promise<string> {
  const currentStages = getCurrentRoundStages(order.stages ?? []);
  const doneStages = currentStages.filter((stage: any) => stage.status !== "PENDING").length;
  const totalStages = currentStages.length;
  const bar = "▓".repeat(doneStages) + "░".repeat(Math.max(0, totalStages - doneStages));
  const creatorNames = order.creators?.map((creator: any) => creator.creator.displayName).join(", ") || "—";
  const deadlineText = order.deadline
    ? new Date(order.deadline).toLocaleDateString("ru-RU")
    : "не задан";

  let text =
    `${orderStatusEmoji(order.status)} *${esc(order.title)}*\n` +
    `Маркетолог: ${esc(order.marketer?.displayName || "—")}\n` +
    `Креаторы: ${esc(creatorNames)}\n` +
    `Дедлайн: ${deadlineText}\n` +
    `Прогресс: ${bar} (${doneStages}/${totalStages})`;

  if (order.description) text += `\n\n${esc(order.description)}`;
  return text;
}

async function getOrderStagesText(order: any): Promise<string> {
  const currentStages = getCurrentRoundStages(order.stages ?? []);
  const currentRound = currentStages.length ? (currentStages[0].revisionRound ?? 0) : 0;
  let text = `🎬 *Этапы: ${esc(order.title)}*\nТекущий раунд: ${currentRound === 0 ? "основной" : `правка #${currentRound}`}`;

  for (const stage of currentStages) {
    text += `\n\n${stageEmoji(stage.status)} *${stageLabel(stage.name)}*`;
    if (stage.awaitingClientApproval) text += `\nОжидает апрув заказчика`;
    if (stage.clientApprovedAt) text += `\nАпрув получен`;
    if (stage.clientApprovalSkipped) text += `\nАпрув пропущен`;
  }

  return text;
}

function orderStagesKeyboard(order: any, user: any): InlineKeyboard {
  const kb = new InlineKeyboard();
  const currentStages = getCurrentRoundStages(order.stages ?? []);
  const canManage = canManageOrder(user, order);
  const canApprove = canApproveReviewStage(user, order);

  for (const stage of currentStages) {
    if (stage.status === "PENDING" && canManage) {
      kb.text(`▶️ ${stageLabel(stage.name)}`, `ord_sstart_${stage.id}`).row();
    } else if (stage.status === "IN_PROGRESS") {
      if (stage.name === "REVIEW" ? canApprove : canManage || canApprove) {
        kb.text(`✅ ${stageLabel(stage.name)}`, `ord_sdone_${stage.id}`).row();
      }
      if (["STORYBOARD", "ANIMATION", "COMPLETED"].includes(stage.name)) {
        if (!stage.awaitingClientApproval && !stage.clientApprovedAt && !stage.clientApprovalSkipped && canManage) {
          kb.text(`📨 Апрув: ${stageLabel(stage.name)}`, `ord_careq_${stage.id}`).row();
        }
        if (stage.awaitingClientApproval && canApprove) {
          kb.text(`👍 Подтвердить апрув`, `ord_caok_${stage.id}`).row();
        }
        if (!stage.clientApprovedAt && !stage.clientApprovalSkipped && canManage) {
          kb.text(`⏭ Пропустить апрув`, `ord_caskip_${stage.id}`).row();
        }
      }
    } else if (stage.status === "DONE" && canManage) {
      kb.text(`↺ Откатить ${stageLabel(stage.name)}`, `ord_sreset_${stage.id}`).row();
    }
  }

  const currentRoundDone = currentStages.length > 0 && currentStages.every((stage: any) => stage.status === "DONE");
  if (currentRoundDone && canManage) {
    kb.text("🌀 Новый раунд правок", `ord_rev_${order.id}`).row();
  }

  kb.text("🔙 К заказу", `ord_open_${order.id}`);
  return kb;
}

async function syncOrderStatusBot(orderId: string) {
  const stages = await prisma.orderStage.findMany({
    where: { orderId },
    orderBy: [{ revisionRound: "asc" }, { sortOrder: "asc" }],
  });
  const currentStages = getCurrentRoundStages(stages);
  const allDone = currentStages.length > 0 && currentStages.every((stage: any) => stage.status === "DONE");
  const allPending = currentStages.length > 0 && currentStages.every((stage: any) => stage.status === "PENDING");
  const reviewStage = currentStages.find((stage: any) => stage.name === "REVIEW");

  let newStatus = "IN_PROGRESS";
  if (allDone) newStatus = "DONE";
  else if (allPending) newStatus = "NEW";
  else if (reviewStage?.status === "IN_PROGRESS") newStatus = "ON_REVIEW";

  await prisma.order.update({ where: { id: orderId }, data: { status: newStatus } });
}

// ==================== STT (Groq Whisper) ====================

const DEFAULT_TASK_PROMPT = `Голосовая заметка пользователя: "{{TEXT}}"

Создай структурированную задачу. Отвечай ТОЛЬКО валидным JSON без пояснений:
{
  "title": "краткое название задачи (до 80 символов)",
  "description": "подробное описание или null",
  "priority": "LOW|MEDIUM|HIGH",
  "subtasks": ["шаг 1", "шаг 2"]
}

Правила:
- title: ёмкое название на русском
- subtasks: 0-8 конкретных шагов из текста. Если шагов нет — []
- priority: HIGH если слова "срочно/сегодня/важно", LOW если не срочно, иначе MEDIUM
- Отвечай на русском`;

const DEFAULT_TZ_PROMPT = `Голосовая заметка заказчика: "{{TEXT}}"

Структурируй это как техническое задание для контент-создателей. Отвечай только структурированным текстом, без вводных слов и без JSON.

Используй только те разделы, которые реально есть в исходном тексте:
• Цель / задача
• Формат контента
• Целевая аудитория
• Ключевые тезисы
• Технические требования
• Что не делать
• Сроки
• Дополнительно

Правила:
- пиши кратко и конкретно
- не выдумывай детали, которых нет в голосе
- если раздел не упомянут — пропусти его
- отвечай на русском языке`;

async function getTelegramFileBuffer(fileUrl: string): Promise<Buffer | null> {
  try {
    const response = await nodeFetch(
      fileUrl,
      telegramProxyAgent ? ({ agent: telegramProxyAgent as any } as any) : undefined
    );
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}

async function getAppSettingValue(key: string): Promise<string | null> {
  try {
    const setting = await prisma.appSetting.findUnique({ where: { key } });
    return setting?.value ?? null;
  } catch {
    return null;
  }
}

async function callTaskAi(prompt: string): Promise<any | null> {
  const systemPrompt = "Ты помощник по управлению задачами. Отвечай только валидным JSON без markdown.";
  return callJsonAi(prompt, systemPrompt);
}

async function callJsonAi(prompt: string, systemPrompt: string): Promise<any | null> {
  const g4fUrl = process.env.G4F_API_URL?.trim();
  const g4fModel = process.env.G4F_MODEL?.trim() || "gpt-4o-mini";
  const groqKey = process.env.GROQ_API_KEY?.trim();

  if (g4fUrl) {
    try {
      const response = await fetch(`${g4fUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: g4fModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 800,
        }),
      });
      if (response.ok) {
        const data = await response.json() as any;
        return JSON.parse(data.choices[0].message.content);
      }
    } catch {}
  }

  if (groqKey) {
    try {
      const response = await nodeFetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0.3,
          max_tokens: 800,
        }),
        ...(telegramProxyAgent ? { agent: telegramProxyAgent as any } : {}),
      } as any);
      if (response.ok) {
        const data = await response.json() as any;
        return JSON.parse(data.choices[0].message.content);
      }
    } catch {}
  }

  return null;
}

async function callTextAi(prompt: string, systemPrompt: string): Promise<string | null> {
  const g4fUrl = process.env.G4F_API_URL?.trim();
  const g4fModel = process.env.G4F_MODEL?.trim() || "gpt-4o-mini";
  const groqKey = process.env.GROQ_API_KEY?.trim();

  if (g4fUrl) {
    try {
      const response = await fetch(`${g4fUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: g4fModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 1200,
        }),
      });
      if (response.ok) {
        const data = await response.json() as any;
        return String(data.choices?.[0]?.message?.content || "").trim() || null;
      }
    } catch {}
  }

  if (groqKey) {
    try {
      const response = await nodeFetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 1200,
        }),
        ...(telegramProxyAgent ? { agent: telegramProxyAgent as any } : {}),
      } as any);
      if (response.ok) {
        const data = await response.json() as any;
        return String(data.choices?.[0]?.message?.content || "").trim() || null;
      }
    } catch {}
  }

  return null;
}

async function transcribeVoiceGroq(fileId: string): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || !BOT_TOKEN) return null;
  try {
    const fileInfo = await bot.api.getFile(fileId);
    if (!fileInfo.file_path) return null;
    const audioUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileInfo.file_path}`;
    const buffer = await getTelegramFileBuffer(audioUrl);
    if (!buffer) return null;

    const form = new FormDataNode();
    form.append("file", buffer, { filename: "voice.ogg", contentType: "audio/ogg" });
    form.append("model", "whisper-large-v3");
    form.append("language", "ru");
    form.append("response_format", "text");

    const groqRes = await nodeFetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, ...form.getHeaders() },
      body: form,
      ...(telegramProxyAgent ? { agent: telegramProxyAgent as any } : {}),
    } as any);
    if (!groqRes.ok) return null;
    return (await groqRes.text()).trim() || null;
  } catch {
    return null;
  }
}

async function parseVoiceToTaskDraft(fileId: string): Promise<{
  title: string;
  description?: string;
  priority: TaskPriorityValue;
  subtasks: string[];
  rawText: string;
} | null> {
  const rawText = await transcribeVoiceGroq(fileId);
  if (!rawText) return null;

  const promptTemplate = (await getAppSettingValue("task_parse_prompt")) ?? DEFAULT_TASK_PROMPT;
  const prompt = promptTemplate.replace("{{TEXT}}", rawText);
  const parsed = await callTaskAi(prompt);

  if (!parsed) {
    return {
      title: rawText.slice(0, 80),
      priority: "MEDIUM",
      subtasks: [],
      rawText,
    };
  }

  return {
    title: String(parsed.title || rawText).slice(0, 80),
    description: parsed.description ? String(parsed.description) : undefined,
    priority: ["LOW", "MEDIUM", "HIGH"].includes(parsed.priority) ? parsed.priority : "MEDIUM",
    subtasks: Array.isArray(parsed.subtasks)
      ? parsed.subtasks.filter((item: unknown) => typeof item === "string").slice(0, 8)
      : [],
    rawText,
  };
}

async function parseVoiceToTzDraft(fileId: string): Promise<{ text: string; rawText: string } | null> {
  const rawText = await transcribeVoiceGroq(fileId);
  if (!rawText) return null;

  const promptTemplate = (await getAppSettingValue("tz_structure_prompt")) ?? DEFAULT_TZ_PROMPT;
  const prompt = promptTemplate.replace("{{TEXT}}", rawText);
  const structured = await callTextAi(
    prompt,
    "Ты помощник по созданию технических заданий. Отвечай только структурированным текстом на русском языке, без JSON и без лишних вводных слов."
  );

  return {
    text: structured || rawText,
    rawText,
  };
}

// Батч-сбор ТЗ / файлов
interface CollectedItem {
  fileName: string;
  fileSize: number;
  mimeType: string;     // "text/plain" для текстовых сообщений
  fileId?: string;      // для медиа
  storageMsgId?: number; // message_id в канале-хранилище (нет у текстовых заметок)
}
interface CollectingState {
  mode: "create_order" | "attach_files";
  title?: string;   // для create_order
  orderId?: string; // для attach_files
  targetFileType?: string;
  items: CollectedItem[];
}
const collectingState = new Map<number, CollectingState>();

function isTzCollectingState(state: CollectingState | undefined | null): boolean {
  if (!state) return false;
  return state.mode === "create_order" || state.targetFileType === "TZ";
}

function collectingKeyboard(options?: { tzVoice?: boolean }): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (options?.tzVoice) {
    kb.text("🎙 Голос → текст", "collect_voice_text")
      .text("🪄 AI из голоса", "collect_voice_ai")
      .row();
  }
  return kb
    .text("✅ Готово", "tz_done").row()
    .text("❌ Отмена", "tz_cancel");
}

bot.callbackQuery("send_report", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user || user.status !== "APPROVED") { await ctx.answerCallbackQuery("Недоступно"); return; }
  await ctx.answerCallbackQuery();
  await sendReportPanel(ctx, user);
});

bot.callbackQuery(/^rpt_(.+)$/, async (ctx) => {
  const orderId = ctx.match![1];
  waitingForReport.set(ctx.from!.id, orderId);
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { title: true } });
  await ctx.answerCallbackQuery();
  await replyOrEdit(ctx, `📝 Отчёт по «${order?.title}»\n\nНапишите, что сделали:`, {
    reply_markup: new InlineKeyboard().text("🔙 В меню", "back_menu"),
  });
});

// Редактирование имени
bot.callbackQuery("edit_name", async (ctx) => {
  waitingForName.add(ctx.from!.id);
  await ctx.answerCallbackQuery();
  await replyOrEdit(ctx, "✏️ Введите новое имя:", {
    reply_markup: new InlineKeyboard().text("🔙 В меню", "back_menu"),
  });
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
  await replyOrEdit(
    ctx,
    "➕ *Создание заказа*\n\nВведите название заказа:",
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("❌ Отмена", "tz_cancel") }
  );
});

// Готово / Отмена для батч-сбора
bot.callbackQuery("collect_voice_text", async (ctx) => {
  const state = collectingState.get(ctx.from!.id);
  if (!isTzCollectingState(state)) {
    await ctx.answerCallbackQuery("Нет активного ТЗ");
    return;
  }

  waitingForCollectVoiceAi.delete(ctx.from!.id);
  waitingForCollectVoiceText.add(ctx.from!.id);
  await ctx.answerCallbackQuery();
  await replyOrEdit(ctx, "🎙 Отправьте голосовое. Я расшифрую его и добавлю как текст в ТЗ.", {
    reply_markup: collectingKeyboard({ tzVoice: true }),
  });
});

bot.callbackQuery("collect_voice_ai", async (ctx) => {
  const state = collectingState.get(ctx.from!.id);
  if (!isTzCollectingState(state)) {
    await ctx.answerCallbackQuery("Нет активного ТЗ");
    return;
  }

  waitingForCollectVoiceText.delete(ctx.from!.id);
  waitingForCollectVoiceAi.add(ctx.from!.id);
  await ctx.answerCallbackQuery();
  await replyOrEdit(ctx, "🪄 Отправьте голосовое. AI соберёт из него аккуратное ТЗ и добавит к материалам.", {
    reply_markup: collectingKeyboard({ tzVoice: true }),
  });
});

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
  if (state.items.length > 0) {
    await prisma.orderFile.createMany({
      data: state.items.map((item) => ({
        orderId,
        uploadedById: user.id,
        fileType: (state.mode === "create_order" ? "TZ" : (state.targetFileType || "OTHER")) as any,
        fileName: item.fileName,
        fileSize: BigInt(item.fileSize),
        mimeType: item.mimeType,
        storagePath: "",
        telegramFileId: item.fileId ?? null,
        // Текстовые заметки (расшифровки) не имеют привязки к TG-хранилищу
        telegramChatId: item.storageMsgId ? STORAGE_CHAT_ID : null,
        telegramMsgId:  item.storageMsgId ?? null,
      })),
    });
  }

  const targetTypeLabel = fileTypeLabel(state.targetFileType || "OTHER");
  const what = state.mode === "create_order"
    ? `✅ Заказ *${orderTitle}* создан!`
    : state.targetFileType === "TZ"
      ? `✅ Материалы добавлены в ТЗ заказа *${orderTitle}*!`
      : `✅ Файлы типа *${targetTypeLabel}* добавлены к заказу *${orderTitle}*!`;

  await replyOrEdit(
    ctx,
    `${what}\n📎 Прикреплено: ${state.items.length} элем.`,
    { parse_mode: "Markdown", reply_markup: withFrontendLink(mainMenuKeyboard(user.status, user.role)) }
  );
});

bot.callbackQuery("tz_cancel", async (ctx) => {
  clearInteractiveState(ctx.from!.id);
  await ctx.answerCallbackQuery("Отменено");
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (user) await sendHomePanel(ctx, user);
});

// ==================== ЗАГРУЗКА ФАЙЛА ====================

bot.callbackQuery("upload_file_menu", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user || user.status !== "APPROVED") { await ctx.answerCallbackQuery("Недоступно"); return; }
  await ctx.answerCallbackQuery();
  await sendUploadMenuPanel(ctx, user);
});

bot.callbackQuery(/^upl_ord_(.+)$/, async (ctx) => {
  const orderId = ctx.match![1];
  await ctx.answerCallbackQuery();
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { title: true } });
  await replyOrEdit(ctx, `📎 Заказ: *${esc(order?.title || orderId)}*\n\nВыберите тип файла:`, {
    parse_mode: "Markdown",
    reply_markup: fileTypePickerKeyboard(orderId, "upload_file_menu", true),
  });
});

// ==================== ОБРАБОТКА ТЕКСТОВЫХ СООБЩЕНИЙ ====================

bot.callbackQuery(/^upl_type_(.+)_(TZ|CONTRACT|STORYBOARD|VIDEO_DRAFT|VIDEO_FINAL|OTHER)$/, async (ctx) => {
  const orderId = ctx.match![1];
  const fileType = ctx.match![2];
  await ctx.answerCallbackQuery();
  await startOrderFileCollection(
    ctx,
    orderId,
    fileType,
    fileType === "TZ" ? "📝 Добавление в ТЗ" : `📎 ${fileTypeLabel(fileType)}`
  );
});

bot.hears(Object.values(MENU_TEXT), async (ctx) => {
  if (ctx.chat?.type !== "private") return;

  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user) {
    await ctx.reply("Нажмите /start чтобы начать");
    return;
  }

  clearInteractiveState(ctx.from!.id);
  await ensureReplyKeyboard(ctx, user.status, user.role);

  switch (ctx.message?.text) {
    case MENU_TEXT.menu:
      await sendHomePanel(ctx, user);
      return;
    case MENU_TEXT.pin:
      await sendPinPanel(ctx, user);
      return;
    case MENU_TEXT.orders:
      if (user.status === "APPROVED") await sendOrdersPanel(ctx, user, 0);
      return;
    case MENU_TEXT.profile:
      if (user.status === "APPROVED") await sendProfilePanel(ctx, BigInt(ctx.from!.id));
      return;
    case MENU_TEXT.report:
      if (user.status === "APPROVED") await sendReportPanel(ctx, user);
      return;
    case MENU_TEXT.notifications:
      if (user.status === "APPROVED") await sendNotificationsPanel(ctx, user);
      return;
    case MENU_TEXT.tasks:
      if (user.status === "APPROVED") await sendTaskMenuPanel(ctx, user);
      return;
    case MENU_TEXT.createOrder:
      if (user.status === "APPROVED" && MARKETER_ROLES.includes(user.role)) {
        waitingForOrderTitle.set(ctx.from!.id, true);
        await replyOrEdit(ctx, "➕ *Создание заказа*\n\nВведите название заказа:", {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard().text("❌ Отмена", "tz_cancel"),
        });
      }
      return;
    case MENU_TEXT.upload:
      if (user.status === "APPROVED") await sendUploadMenuPanel(ctx, user);
      return;
    case MENU_TEXT.admin:
      if (user.status === "APPROVED" && ADMIN_ROLES.includes(user.role)) {
        await sendAdminPanel(ctx, user);
      }
      return;
    case MENU_TEXT.status:
      await sendStatusPanel(ctx, user);
      return;
    case MENU_TEXT.site:
      await sendFrontendLinkPanel(ctx, user);
      return;
  }
});

bot.on("message:text", async (ctx, next) => {
  const userId = ctx.from!.id;
  if (BOT_SELF_ID && userId === BOT_SELF_ID) return;

  const groupOrder = ctx.chat?.type !== "private" ? await getOrderGroupByChatId(ctx.chat!.id) : null;
  if (groupOrder) {
    const text = ctx.message.text.trim();
    if (!text) return;
    if (text.startsWith("/")) return next();

    if (isGroupCommandMessage(ctx, text)) {
      await handleGroupCommand(ctx, groupOrder, text);
      return;
    }

    await saveGroupComment(groupOrder.id, userId, text);
    return;
  }

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
  if (waitingForTaskTitle.has(userId)) {
    const title = ctx.message.text.trim();
    if (title.length < 2 || title.length > 120) {
      await ctx.reply("❌ Название задачи: от 2 до 120 символов. Попробуйте снова:");
      return;
    }

    waitingForTaskTitle.delete(userId);
    const user = await prisma.user.findUnique({ where: { telegramId: BigInt(userId) } });
    if (!user) return;

    const task = await prisma.task.create({
      data: {
        userId: user.id,
        title,
        priority: "MEDIUM",
      },
    });

    const text = await getTaskDetailText(task.id, user.id);
    const kb = await taskDetailKeyboard(task.id, user.id);
    if (text && kb) {
      await replyOrEdit(ctx, text, { parse_mode: "Markdown", reply_markup: kb });
    }
    return;
  }

  if (waitingForSubtaskForTask.has(userId)) {
    const title = ctx.message.text.trim();
    if (title.length < 1 || title.length > 120) {
      await ctx.reply("❌ Подзадача: от 1 до 120 символов. Попробуйте снова:");
      return;
    }

    const taskId = waitingForSubtaskForTask.get(userId)!;
    waitingForSubtaskForTask.delete(userId);
    const user = await prisma.user.findUnique({ where: { telegramId: BigInt(userId) } });
    if (!user) return;

    const task = await prisma.task.findFirst({
      where: { id: taskId, userId: user.id },
      include: { subtasks: true },
    });
    if (!task) {
      await ctx.reply("❌ Задача не найдена.");
      return;
    }

    await prisma.taskSubtask.create({
      data: {
        taskId: task.id,
        title,
        sortOrder: task.subtasks.length,
      },
    });

    const text = await getTaskDetailText(task.id, user.id);
    const kb = await taskDetailKeyboard(task.id, user.id);
    if (text && kb) {
      await replyOrEdit(ctx, text, { parse_mode: "Markdown", reply_markup: kb });
    }
    return;
  }

  if (waitingForOrderComment.has(userId)) {
    const text = ctx.message.text.trim();
    if (!text) {
      await ctx.reply("❌ Комментарий не может быть пустым.");
      return;
    }

    const orderId = waitingForOrderComment.get(userId)!;
    waitingForOrderComment.delete(userId);

    const user = await prisma.user.findUnique({ where: { telegramId: BigInt(userId) } });
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { creators: { select: { creatorId: true } } },
    });
    if (!user || !order) {
      await ctx.reply("❌ Заказ не найден.");
      return;
    }

    await prisma.orderComment.create({
      data: { orderId, authorId: user.id, text, source: "TELEGRAM" },
    });
    await mirrorTextToOrderGroup(orderId, `💬 *${esc(user.displayName)}*\n${esc(text)}`);

    const recipientIds = [...new Set([order.marketerId, ...order.creators.map((c: any) => c.creatorId)])]
      .filter((id) => id !== user.id);
    const preview = text.length > 80 ? `${text.slice(0, 77)}...` : text;
    if (recipientIds.length) {
      await prisma.notification.createMany({
        data: recipientIds.map((recipientId) => ({
          userId: recipientId,
          orderId: order.id,
          type: "COMMENT_ADDED",
          message: `💬 ${user.displayName} → «${order.title}»${preview ? `:\n${preview}` : ""}`,
        })),
      });
    }

    const refreshedOrder = await fetchOrderForBot(orderId);
    if (!refreshedOrder) {
      await ctx.reply("✅ Комментарий сохранён.");
      return;
    }

    let commentsText = `💬 *Комментарии: ${esc(refreshedOrder.title)}*`;
    if (!refreshedOrder.comments?.length) {
      commentsText += `\n\nКомментариев пока нет.`;
    } else {
      for (const comment of refreshedOrder.comments.slice(-8)) {
        commentsText += `\n\n*${esc(comment.author.displayName)}*:\n${esc(comment.text)}`;
      }
    }

    const kb = new InlineKeyboard()
      .text("✍️ Написать", `ord_cadd_${refreshedOrder.id}`).row()
      .text("🔙 К заказу", `ord_open_${refreshedOrder.id}`);
    await replyOrEdit(ctx, commentsText, { parse_mode: "Markdown", reply_markup: kb });
    return;
  }

  if (waitingForTzNote.has(userId)) {
    const text = ctx.message.text.trim();
    if (!text) {
      await ctx.reply("❌ Текст не может быть пустым.");
      return;
    }

    const orderId = waitingForTzNote.get(userId)!;
    waitingForTzNote.delete(userId);
    const user = await prisma.user.findUnique({ where: { telegramId: BigInt(userId) } });
    if (!user) return;

    await prisma.orderFile.create({
      data: {
        orderId,
        uploadedById: user.id,
        fileType: "TZ",
        fileName: text.slice(0, 500),
        fileSize: BigInt(Buffer.byteLength(text, "utf8")),
        mimeType: "text/plain",
        storagePath: "",
        telegramFileId: null,
        telegramChatId: null,
        telegramMsgId: null,
      },
    });
    await mirrorTextToOrderGroup(orderId, `📝 ТЗ от *${esc(user.displayName)}*\n${esc(text.slice(0, 500))}`);

    const order = await fetchOrderForBot(orderId);
    if (!order) {
      await ctx.reply("✅ Текст добавлен в ТЗ.");
      return;
    }
    const tzFiles = getTzFiles(order);
    await replyOrEdit(ctx, buildOrderFilesText(order, tzFiles, "📋 *ТЗ*", "Материалов ТЗ пока нет."), {
      parse_mode: "Markdown",
      reply_markup: buildOrderFilesKeyboard(
        order.id,
        tzFiles,
        `ord_tzadd_${order.id}`,
        `ord_open_${order.id}`,
        { text: "📨 Отправить всё ТЗ", callback: `ord_tzsend_${order.id}` }
      ),
    });
    return;
  }

  if (waitingForOrderTitle.has(userId)) {
    const title = ctx.message.text.trim();
    if (title.length < 2 || title.length > 100) {
      await ctx.reply("❌ Название: от 2 до 100 символов. Попробуйте снова:");
      return;
    }
    waitingForOrderTitle.delete(userId);
    collectingState.set(userId, { mode: "create_order", title, items: [] });
    await replyOrEdit(
      ctx,
      [
        `Название заказа: ${title}`,
        "",
        "Теперь пришлите всё, что относится к ТЗ:",
        "1. Текстовые сообщения",
        "2. Файлы, фото или видео",
        "3. Пересланные сообщения",
        "",
        "Можно отправлять несколько сообщений подряд.",
        "Когда закончите, нажмите «Готово».",
        "Если ТЗ пока не нужно, тоже можно сразу нажать «Готово».",
      ].join("\n"),
      { reply_markup: collectingKeyboard({ tzVoice: true }) }
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
      await replyOrEdit(
        ctx,
        `📩 Добавлено (${state.items.length} эл.). Продолжайте или нажмите Готово:`,
        { reply_markup: collectingKeyboard({ tzVoice: isTzCollectingState(state) }) }
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

    await replyOrEdit(ctx, "✅ Отчёт сохранён! 💪", {
      reply_markup: new InlineKeyboard().text("🔙 Меню", "back_menu"),
    });
    return;
  }

  // Неизвестное сообщение — предлагаем меню
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(userId) } });
  if (user) {
    await sendHomePanel(ctx, user);
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
    if (ctx.chat?.type === "private") {
      await mirrorStorageMessageToOrderGroup(orderId, String(STORAGE_CHAT_ID), fwd.message_id);
    }
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
  if (BOT_SELF_ID && userId === BOT_SELF_ID) return;

  const groupOrder = ctx.chat?.type !== "private" ? await getOrderGroupByChatId(ctx.chat!.id) : null;
  if (groupOrder) {
    const user = await prisma.user.findUnique({ where: { telegramId: BigInt(userId) } });
    if (!user || user.status !== "APPROVED") return;

    const saved = await saveBotFile(
      ctx,
      groupOrder.id,
      user.id,
      groupFileTypeFromMessage(info, ctx.message.caption || null),
      info.fileId,
      info.fileName,
      info.fileSize,
      info.mimeType
    );

    if (saved) {
      await ctx.reply("Файл сохранён в CRM.");
    }
    return;
  }

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

      // Для голосовых — пробуем расшифровать и добавить текст в коллекцию
      if (info.mimeType === "audio/ogg" && process.env.GROQ_API_KEY) {
        const transcription = await transcribeVoiceGroq(info.fileId).catch(() => null);
        if (transcription) {
          state.items.push({
            fileName:  transcription,
            fileSize:  0,
            mimeType:  "text/plain",
          });
          await replyOrEdit(
            ctx,
            `🎙 Голосовое добавлено (${state.items.length - 1} эл.)\n\n📝 Расшифровка:\n_${esc(transcription)}_\n\nПродолжайте или нажмите Готово:`,
            { parse_mode: "Markdown", reply_markup: collectingKeyboard({ tzVoice: isTzCollectingState(state) }) }
          );
          return;
        }
      }

      const typeLabel = info.mimeType === "audio/ogg" ? "🎙 Голосовое" : "📎 Файл";
      await replyOrEdit(
        ctx,
        `${typeLabel} добавлен (${state.items.length} эл.). Продолжайте или нажмите Готово:`,
        { reply_markup: collectingKeyboard({ tzVoice: isTzCollectingState(state) }) }
      );
    } catch (e: any) {
      await ctx.reply("❌ Ошибка сохранения: " + e.message);
    }
    return;
  }

  // Нет активного состояния — подсказываем
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(userId) } });
  if (user) {
    await replyOrEdit(
      ctx,
      "Чтобы прикрепить файл к заказу, используйте кнопку 📎 Загрузить файл:",
      { reply_markup: withFrontendLink(mainMenuKeyboard(user.status, user.role)) }
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

  if (waitingForCollectVoiceText.has(ctx.from!.id)) {
    {
      waitingForCollectVoiceText.delete(ctx.from!.id);
      const collectState = collectingState.get(ctx.from!.id);
      if (!collectState || !isTzCollectingState(collectState)) {
        await ctx.reply("❌ Сессия добавления ТЗ не найдена.");
        return;
      }

      await ctx.reply("⏳ Расшифровываю голос в текст...");
      await replyOrEdit(ctx, "⏳ Расшифровываю голос в текст...", {
        reply_markup: collectingKeyboard({ tzVoice: true }),
      });
      const transcribedText = await transcribeVoiceGroq(voice.file_id).catch(() => null);
      if (!transcribedText) {
        await replyOrEdit(ctx, "❌ Не удалось расшифровать голос. Попробуйте ещё раз.", {
          reply_markup: collectingKeyboard({ tzVoice: true }),
        });
        return;
      }

      collectState.items.push({
        fileName: transcribedText.slice(0, 500),
        fileSize: 0,
        mimeType: "text/plain",
      });
      await replyOrEdit(
        ctx,
        `🎙 Голос расшифрован и добавлен в ТЗ (${collectState.items.length} эл.).\n\n📝 _${esc(transcribedText)}_\n\nПродолжайте или нажмите Готово:`,
        { parse_mode: "Markdown", reply_markup: collectingKeyboard({ tzVoice: true }) }
      );
      return;
    }
  }

  if (waitingForCollectVoiceAi.has(ctx.from!.id)) {
    {
      waitingForCollectVoiceAi.delete(ctx.from!.id);
      const collectState = collectingState.get(ctx.from!.id);
      if (!collectState || !isTzCollectingState(collectState)) {
        await ctx.reply("❌ Сессия добавления ТЗ не найдена.");
        return;
      }

      await ctx.reply("⏳ AI собирает ТЗ из вашего голоса...");
      await replyOrEdit(ctx, "⏳ AI собирает ТЗ из вашего голоса...", {
        reply_markup: collectingKeyboard({ tzVoice: true }),
      });
      const tzDraft = await parseVoiceToTzDraft(voice.file_id);
      if (!tzDraft) {
        await replyOrEdit(ctx, "❌ Не удалось обработать голос AI-ом. Попробуйте ещё раз.", {
          reply_markup: collectingKeyboard({ tzVoice: true }),
        });
        return;
      }

      collectState.items.push({
        fileName: tzDraft.text.slice(0, 500),
        fileSize: 0,
        mimeType: "text/plain",
      });
      await replyOrEdit(
        ctx,
        `🪄 AI добавил структурированное ТЗ (${collectState.items.length} эл.).\n\n${esc(tzDraft.text)}\n\n*Расшифровка:*\n_${esc(tzDraft.rawText)}_\n\nПродолжайте или нажмите Готово:`,
        { parse_mode: "Markdown", reply_markup: collectingKeyboard({ tzVoice: true }) }
      );
      return;
    }
  }

  if (waitingForTzVoice.has(ctx.from!.id)) {
    {
      const orderId = waitingForTzVoice.get(ctx.from!.id);
      waitingForTzVoice.delete(ctx.from!.id);
      await replyOrEdit(ctx, "⏳ Превращаю голос в структурированное ТЗ...", {
        reply_markup: new InlineKeyboard().text("🔙 К заказу", `ord_open_${orderId}`),
      });

      const tzDraft = await parseVoiceToTzDraft(voice.file_id);
      if (!tzDraft || !orderId) {
        await ctx.reply("❌ Не удалось обработать голосовое сообщение.");
        return;
      }

      tzVoiceDraft.set(ctx.from!.id, {
        orderId,
        text: tzDraft.text,
        rawText: tzDraft.rawText,
      });

      let preview = `🎙 *Черновик ТЗ из голоса*\n\n${esc(tzDraft.text)}`;
      preview += `\n\n*Расшифровка:*\n_${esc(tzDraft.rawText)}_`;

      await replyOrEdit(ctx, preview, {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard()
          .text("✅ Сохранить в ТЗ", "tz_vdraft_ok")
          .text("❌ Отмена", "tz_vdraft_cancel"),
      });
      return;
    }
  }

  if (waitingForTaskVoice.has(ctx.from!.id)) {
    waitingForTaskVoice.delete(ctx.from!.id);
    await replyOrEdit(ctx, "⏳ Разбираю голос в задачу...", {
      reply_markup: new InlineKeyboard().text("❌ Отмена", "tsk_voice_cancel"),
    });

    const draft = await parseVoiceToTaskDraft(voice.file_id);
    if (!draft) {
      await ctx.reply("❌ Не удалось обработать голосовое сообщение. Проверьте GROQ_API_KEY и попробуйте ещё раз.");
      return;
    }

    taskVoiceDraft.set(ctx.from!.id, draft);

    let preview =
      `🎙 *Черновик задачи из голоса*\n\n` +
      `*${esc(draft.title)}*\n` +
      `Приоритет: ${taskPriorityEmoji(draft.priority)} ${taskPriorityLabel(draft.priority)}`;

    if (draft.description) preview += `\n\n${esc(draft.description)}`;
    if (draft.subtasks.length > 0) {
      preview += "\n\n*Подзадачи:*";
      for (const subtask of draft.subtasks) preview += `\n• ${esc(subtask)}`;
    }
    preview += `\n\n*Расшифровка:*\n_${esc(draft.rawText)}_`;

    await replyOrEdit(ctx, preview, {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard()
        .text("✅ Создать", "tsk_voice_ok")
        .text("❌ Отмена", "tsk_voice_cancel"),
    });
    return;
  }

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
  await replyOrEdit(ctx,
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

// Список заявок — единое сообщение со списком
bot.callbackQuery("adm_pending", async (ctx) => {
  const admin = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!admin || !ADMIN_ROLES.includes(admin.role)) { await ctx.answerCallbackQuery("Нет доступа"); return; }
  await ctx.answerCallbackQuery();

  const roleFilter = getRoleFilter(admin.role);
  const pending = await prisma.user.findMany({
    where: { status: "PENDING", ...roleFilter },
    orderBy: { createdAt: "asc" },
    take: 15,
    select: { id: true, displayName: true, role: true, telegramUsername: true, createdAt: true },
  });

  if (pending.length === 0) {
    await replyOrEdit(ctx, "✅ *Заявок нет.*", {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text("🔙 Назад", "adm_back"),
    });
    return;
  }

  let text = `📋 *Заявки на апрув* (${pending.length}):\n\n`;
  const kb = new InlineKeyboard();
  for (const u of pending) {
    text += `• ${esc(u.displayName)} (@${u.telegramUsername || "—"}) — ${formatRole(u.role)}\n`;
    kb.text(u.displayName.slice(0, 28), `adm_preq_${u.id}`).row();
  }
  kb.text("🔙 Назад", "adm_back");
  await replyOrEdit(ctx, text, { parse_mode: "Markdown", reply_markup: kb });
});

// Просмотр отдельной заявки
bot.callbackQuery(/^adm_preq_(.+)$/, async (ctx) => {
  const admin = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!admin || !ADMIN_ROLES.includes(admin.role)) { await ctx.answerCallbackQuery("Нет доступа"); return; }
  await ctx.answerCallbackQuery();

  const targetId = ctx.match![1];
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) { await ctx.answerCallbackQuery("Не найден"); return; }

  const kb = new InlineKeyboard()
    .text("✅ Одобрить", `adm_approve_${target.id}`)
    .text("❌ Отклонить", `adm_reject_${target.id}`).row()
    .text("🔙 К заявкам", "adm_pending");

  await replyOrEdit(ctx,
    `👤 *${esc(target.displayName)}*\n` +
    `📱 @${target.telegramUsername || "—"}\n` +
    `📋 Роль: ${formatRole(target.role)}\n` +
    `📅 ${target.createdAt.toLocaleDateString("ru-RU")}`,
    { parse_mode: "Markdown", reply_markup: kb }
  );
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

  const pin = await generateUniquePin();

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
  await replyOrEdit(ctx,
    `✅ *${esc(target.displayName)}* одобрен!\nPIN: \`${pin}\``,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 К заявкам", "adm_pending") }
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
  await replyOrEdit(ctx, `❌ *${esc(target.displayName)}* отклонён.`, {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard().text("🔙 К заявкам", "adm_pending"),
  });
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
    text += `• ${esc(u.displayName)}${blocked} — ${formatRole(u.role)}\n`;
    kb.text(`${u.displayName.slice(0, 20)}${blocked}`, `adm_user_${u.id}`).row();
  }

  // Навигация — добавляем к тому же kb (пустая строка от loop .row() уже есть)
  if (page > 0)              kb.text("← Назад",  `adm_users_${page - 1}`);
  if (page + 1 < totalPages) kb.text("Вперёд →", `adm_users_${page + 1}`);
  if (page > 0 || page + 1 < totalPages) kb.row();
  kb.text("🔙 Меню", "adm_back");

  await replyOrEdit(ctx, text, { parse_mode: "Markdown", reply_markup: kb });
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
  const teamLead = await prisma.user.findUnique({
    where: { id: target.teamLeadId ?? "" },
    select: { displayName: true },
  }).catch(() => null);

  let text = `👤 *${esc(target.displayName)}*\n`;
  text += `📱 @${target.telegramUsername || "—"}\n`;
  text += `🎭 ${formatRole(target.role)}\n`;
  text += `📊 Статус: ${blocked ? "🚫 Заблокирован" : "✅ Активен"}\n`;
  if (teamLead) text += `👨‍💼 Тимлид: ${esc(teamLead.displayName)}\n`;
  text += `📋 Заказов: ${target._count.createdOrders}, назначений: ${target._count.assignments}`;

  const kb = new InlineKeyboard();

  // Смена роли
  if (canAdminApprove(admin.role, target.role) || admin.role === UserRole.ADMIN) {
    kb.text("🎭 Изменить роль", `adm_role_${targetId}`).row();
  }

  // Назначить тимлида (для креаторов)
  const canSetLead = admin.role === UserRole.ADMIN ||
    (admin.role === UserRole.HEAD_CREATOR && ["CREATOR", "LEAD_CREATOR"].includes(target.role));
  if (canSetLead && target.id !== admin.id) {
    kb.text("👨‍💼 Тимлид", `adm_setlead_${targetId}`).row();
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

  await replyOrEdit(ctx, text, { parse_mode: "Markdown", reply_markup: kb });
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

  await replyOrEdit(ctx, `Текущая роль: ${formatRole(target.role)}\nВыберите новую роль:`, { reply_markup: kb });
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
  await replyOrEdit(ctx, `✅ Роль изменена: ${formatRole(newRole)}`, {
    reply_markup: new InlineKeyboard().text("🔙 К пользователю", `adm_user_${targetId}`),
  });
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
  await replyOrEdit(ctx, `🚫 *${esc(target.displayName)}* заблокирован.`, {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard().text("🔙 К пользователю", `adm_user_${targetId}`),
  });
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
  await replyOrEdit(ctx, `✅ *${esc(target.displayName)}* восстановлен.`, {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard().text("🔙 К пользователю", `adm_user_${targetId}`),
  });
});

// ==================== НАЗНАЧЕНИЕ ТИМЛИДА ====================

bot.callbackQuery(/^adm_setlead_(.+)$/, async (ctx) => {
  const admin = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!admin || !ADMIN_ROLES.includes(admin.role)) { await ctx.answerCallbackQuery("Нет доступа"); return; }
  await ctx.answerCallbackQuery();

  const targetId = ctx.match![1];
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) { await ctx.answerCallbackQuery("Не найден"); return; }

  const eligibleRoles = ["CREATOR", "LEAD_CREATOR"].includes(target.role)
    ? [UserRole.HEAD_CREATOR, UserRole.LEAD_CREATOR]
    : [UserRole.HEAD_MARKETER];

  const leads = await prisma.user.findMany({
    where: { status: "APPROVED", role: { in: eligibleRoles } },
    select: { id: true, displayName: true, role: true },
    orderBy: { displayName: "asc" },
    take: 15,
  });

  const currentLeadName = target.teamLeadId
    ? (await prisma.user.findUnique({ where: { id: target.teamLeadId }, select: { displayName: true } }))?.displayName || "—"
    : "не назначен";

  const kb = new InlineKeyboard();
  for (const lead of leads) {
    const isCurrent = target.teamLeadId === lead.id;
    kb.text(`${isCurrent ? "✓ " : ""}${lead.displayName.slice(0, 28)}`, `adm_leadset_${targetId}_${lead.id}`).row();
  }
  if (target.teamLeadId) kb.text("🗑 Убрать тимлида", `adm_leadclear_${targetId}`).row();
  kb.text("🔙 К пользователю", `adm_user_${targetId}`);

  await replyOrEdit(ctx,
    `👨‍💼 *Тимлид: ${esc(target.displayName)}*\n\nТекущий: ${esc(currentLeadName)}\n\nВыберите тимлида:`,
    { parse_mode: "Markdown", reply_markup: kb }
  );
});

bot.callbackQuery(/^adm_leadset_(.+)_(.+)$/, async (ctx) => {
  const admin = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!admin || !ADMIN_ROLES.includes(admin.role)) { await ctx.answerCallbackQuery("Нет доступа"); return; }

  const targetId = ctx.match![1];
  const leadId = ctx.match![2];
  const [target, lead] = await Promise.all([
    prisma.user.findUnique({ where: { id: targetId } }),
    prisma.user.findUnique({ where: { id: leadId } }),
  ]);
  if (!target || !lead) { await ctx.answerCallbackQuery("Не найден"); return; }

  await prisma.user.update({ where: { id: targetId }, data: { teamLeadId: leadId } });
  await ctx.answerCallbackQuery("✅ Тимлид назначен");
  await replyOrEdit(ctx,
    `✅ Тимлид *${esc(lead.displayName)}* назначен для *${esc(target.displayName)}*.`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 К пользователю", `adm_user_${targetId}`) }
  );
});

bot.callbackQuery(/^adm_leadclear_(.+)$/, async (ctx) => {
  const admin = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!admin || !ADMIN_ROLES.includes(admin.role)) { await ctx.answerCallbackQuery("Нет доступа"); return; }

  const targetId = ctx.match![1];
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) { await ctx.answerCallbackQuery("Не найден"); return; }

  await prisma.user.update({ where: { id: targetId }, data: { teamLeadId: null } });
  await ctx.answerCallbackQuery("Тимлид убран");
  await replyOrEdit(ctx,
    `✅ Тимлид убран у *${esc(target.displayName)}*.`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔙 К пользователю", `adm_user_${targetId}`) }
  );
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
  await ensureReplyKeyboard(ctx, user.status, user.role);
  await sendPinPanel(ctx, user);
});

bot.command("menu", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user) { await ctx.reply("Нажмите /start"); return; }
  await sendHomePanel(ctx, user);
});

bot.command("profile", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user || user.status !== "APPROVED") { await ctx.reply("Нажмите /start чтобы начать"); return; }
  await ensureReplyKeyboard(ctx, user.status, user.role);
  await sendProfilePanel(ctx, BigInt(ctx.from!.id));
});

// ==================== ОТПРАВКА УВЕДОМЛЕНИЙ ИЗ ОЧЕРЕДИ ====================

bot.command("tasks", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user || user.status !== "APPROVED") {
    await ctx.reply("Нажмите /start чтобы начать");
    return;
  }
  await ensureReplyKeyboard(ctx, user.status, user.role);
  await sendTaskMenuPanel(ctx, user);
});

bot.command("orders", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user || user.status !== "APPROVED") { await ctx.reply("Нажмите /start чтобы начать"); return; }
  await ensureReplyKeyboard(ctx, user.status, user.role);
  await sendOrdersPanel(ctx, user, 0);
});

bot.command("report", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user || user.status !== "APPROVED") { await ctx.reply("Нажмите /start чтобы начать"); return; }
  await ensureReplyKeyboard(ctx, user.status, user.role);
  await sendReportPanel(ctx, user);
});

bot.command("notifs", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user || user.status !== "APPROVED") { await ctx.reply("Нажмите /start чтобы начать"); return; }
  await ensureReplyKeyboard(ctx, user.status, user.role);
  await sendNotificationsPanel(ctx, user);
});

bot.command("upload", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user || user.status !== "APPROVED") { await ctx.reply("Нажмите /start чтобы начать"); return; }
  await ensureReplyKeyboard(ctx, user.status, user.role);
  await sendUploadMenuPanel(ctx, user);
});

bot.command("createorder", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user || user.status !== "APPROVED") { await ctx.reply("Нажмите /start чтобы начать"); return; }
  if (!MARKETER_ROLES.includes(user.role)) {
    await ctx.reply("❌ У вас нет доступа к созданию заказов.");
    return;
  }
  clearInteractiveState(ctx.from!.id);
  waitingForOrderTitle.set(ctx.from!.id, true);
  await replyOrEdit(ctx, "➕ *Создание заказа*\n\nВведите название заказа:", {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard().text("❌ Отмена", "tz_cancel"),
  });
});

bot.command("status", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user) { await ctx.reply("Нажмите /start"); return; }
  await sendStatusPanel(ctx, user);
});

bot.command("site", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user) { await ctx.reply("Нажмите /start"); return; }
  await sendFrontendLinkPanel(ctx, user);
});

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
    const byPin = await prisma.user.findFirst({
      where: { pinCode: { equals: "adm1", mode: "insensitive" } },
    });
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


async function startTelegramBot() {
  try {
    if (TELEGRAM_PROXY_URL) {
      console.log(`Telegram proxy enabled: ${maskEndpoint(TELEGRAM_PROXY_URL)}`);
    }
    console.log("Checking Telegram bot token...");
    const me = await bot.api.getMe();
    BOT_SELF_ID = me.id;
    console.log(`Telegram auth OK: @${me.username}`);
    console.log("Starting Telegram polling...");

    await bot.api.setMyCommands([
      { command: "start",       description: "Старт и вход" },
      { command: "menu",        description: "Главное меню" },
      { command: "orders",      description: "Мои заказы" },
      { command: "tasks",       description: "Мои задачи" },
      { command: "profile",     description: "Мой профиль" },
      { command: "report",      description: "Отправить отчёт" },
      { command: "notifs",      description: "Уведомления" },
      { command: "pin",         description: "Показать PIN для сайта" },
      { command: "upload",      description: "Загрузить файл в заказ" },
      { command: "createorder", description: "Создать заказ" },
      { command: "status",      description: "Статус заявки" },
      { command: "site",        description: "Открыть сайт" },
      { command: "admin",       description: "Панель управления" },
    ]);

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
