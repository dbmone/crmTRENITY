#!/usr/bin/env tsx
/**
 * CLI-админка для TRENITY CRM
 *
 * Использование:
 *   npm run admin -- <command> [args]
 *
 * Примеры:
 *   npm run admin -- list-users
 *   npm run admin -- approve <userId>
 *   npm run admin -- set-role <userId> ADMIN
 *   npm run admin -- set-role <userId> HEAD_MARKETER
 *   npm run admin -- set-team-lead <userId> <teamLeadId>
 *   npm run admin -- block <userId>
 *   npm run admin -- unblock <userId>
 *   npm run admin -- pending
 *   npm run admin -- reset-pin <userId>
 *   npm run admin -- stats
 *   npm run admin -- find-user <telegram_username>
 */

import { PrismaClient, UserRole, UserStatus } from "@prisma/client";
import { config } from "../config";
import { generateUniquePin } from "../utils/pin";

const prisma = new PrismaClient();
const ADMIN_PASSWORD = config.admin.password;

async function main() {
  const args = process.argv.slice(2);

  // Пароль — первый аргумент
  const password = args[0];
  if (password !== ADMIN_PASSWORD) {
    console.error("❌ Неверный пароль. Использование: npm run admin -- <password> <command> [args]");
    process.exit(1);
  }

  const command = args[1];
  const commandArgs = args.slice(2);

  switch (command) {
    case "list-users":
    case "users": {
      const users = await prisma.user.findMany({
        select: { id: true, displayName: true, telegramUsername: true, role: true, status: true, pinCode: true, teamLeadId: true },
        orderBy: { createdAt: "desc" },
      });
      console.log("\n👥 Все пользователи:\n");
      console.log("ID".padEnd(38) + "Имя".padEnd(25) + "TG".padEnd(20) + "Роль".padEnd(16) + "Статус".padEnd(12) + "PIN");
      console.log("─".repeat(130));
      for (const u of users) {
        console.log(
          u.id.padEnd(38) +
          u.displayName.padEnd(25) +
          (`@${u.telegramUsername || "—"}`).padEnd(20) +
          u.role.padEnd(16) +
          u.status.padEnd(12) +
          (u.pinCode || "—")
        );
      }
      console.log(`\nВсего: ${users.length}`);
      break;
    }

    case "pending": {
      const pending = await prisma.user.findMany({
        where: { status: UserStatus.PENDING },
        select: { id: true, displayName: true, telegramUsername: true, role: true, createdAt: true },
      });
      if (pending.length === 0) {
        console.log("✅ Нет заявок на рассмотрении");
        break;
      }
      console.log(`\n📥 Заявки (${pending.length}):\n`);
      for (const u of pending) {
        console.log(`  ${u.id} — ${u.displayName} (@${u.telegramUsername}) — ${u.role} — ${u.createdAt.toLocaleDateString("ru-RU")}`);
      }
      console.log("\nОдобрить: npm run admin -- <password> approve <userId>");
      break;
    }

    case "approve": {
      const userId = commandArgs[0];
      if (!userId) { console.error("Укажите userId"); break; }
      const pin = await generateUniquePin(prisma);
      const user = await prisma.user.update({
        where: { id: userId },
        data: { status: UserStatus.APPROVED, pinCode: pin },
      });
      console.log(`✅ ${user.displayName} одобрен! PIN: ${pin}`);
      break;
    }

    case "reject": {
      const userId = commandArgs[0];
      if (!userId) { console.error("Укажите userId"); break; }
      await prisma.user.update({ where: { id: userId }, data: { status: UserStatus.REJECTED } });
      console.log("❌ Заявка отклонена");
      break;
    }

    case "set-role": {
      const userId = commandArgs[0];
      const role = commandArgs[1] as UserRole;
      if (!userId || !role) { console.error("Укажите: set-role <userId> <ROLE>"); break; }
      if (!Object.values(UserRole).includes(role)) {
        console.error(`Доступные роли: ${Object.values(UserRole).join(", ")}`);
        break;
      }
      const user = await prisma.user.update({ where: { id: userId }, data: { role } });
      console.log(`✅ ${user.displayName} теперь ${role}`);
      break;
    }

    case "set-team-lead": {
      const userId = commandArgs[0];
      const leadId = commandArgs[1];
      if (!userId) { console.error("Укажите userId"); break; }
      await prisma.user.update({ where: { id: userId }, data: { teamLeadId: leadId || null } });
      console.log(leadId ? `✅ Тимлид назначен` : `✅ Тимлид убран`);
      break;
    }

    case "block": {
      const userId = commandArgs[0];
      if (!userId) { console.error("Укажите userId"); break; }
      await prisma.user.update({ where: { id: userId }, data: { status: UserStatus.BLOCKED, isActive: false } });
      console.log("🚫 Пользователь заблокирован");
      break;
    }

    case "unblock": {
      const userId = commandArgs[0];
      if (!userId) { console.error("Укажите userId"); break; }
      await prisma.user.update({ where: { id: userId }, data: { status: UserStatus.APPROVED, isActive: true } });
      console.log("✅ Пользователь разблокирован");
      break;
    }

    case "reset-pin": {
      const userId = commandArgs[0];
      if (!userId) { console.error("Укажите userId"); break; }
      const pin = await generateUniquePin(prisma);
      await prisma.user.update({ where: { id: userId }, data: { pinCode: pin } });
      console.log(`🔑 Новый PIN: ${pin}`);
      break;
    }

    case "find-user":
    case "find": {
      const query = commandArgs[0];
      if (!query) { console.error("Укажите username или имя"); break; }
      const users = await prisma.user.findMany({
        where: {
          OR: [
            { telegramUsername: { contains: query, mode: "insensitive" } },
            { displayName: { contains: query, mode: "insensitive" } },
          ],
        },
        select: { id: true, displayName: true, telegramUsername: true, role: true, status: true, pinCode: true },
      });
      if (users.length === 0) { console.log("Не найдено"); break; }
      for (const u of users) {
        console.log(`${u.id} — ${u.displayName} (@${u.telegramUsername}) — ${u.role} — ${u.status} — PIN: ${u.pinCode || "—"}`);
      }
      break;
    }

    case "stats": {
      const [users, orders, reports] = await Promise.all([
        prisma.user.groupBy({ by: ["status"], _count: { id: true } }),
        prisma.order.groupBy({ by: ["status"], _count: { id: true } }),
        prisma.dailyReport.count(),
      ]);
      console.log("\n📊 Статистика:\n");
      console.log("Пользователи:", users.map((u) => `${u.status}: ${u._count.id}`).join(", "));
      console.log("Заказы:", orders.map((o) => `${o.status}: ${o._count.id}`).join(", "));
      console.log("Отчётов:", reports);
      break;
    }

    default:
      console.log(`
TRENITY CRM — CLI Admin Tool

Использование: npm run admin -- <password> <command> [args]

Команды:
  users / list-users          Список всех пользователей
  pending                     Заявки на рассмотрении
  approve <userId>            Одобрить заявку
  reject <userId>             Отклонить заявку
  set-role <userId> <ROLE>    Сменить роль (ADMIN, HEAD_MARKETER, MARKETER, LEAD_CREATOR, CREATOR)
  set-team-lead <uid> <lid>   Назначить тимлида
  block <userId>              Заблокировать
  unblock <userId>            Разблокировать
  reset-pin <userId>          Сбросить PIN
  find <query>                Найти по username/имени
  stats                       Статистика
      `);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
