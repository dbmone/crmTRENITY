import { PrismaClient, UserRole, UserStatus, StageName } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding TRENITY CRM...");

  // ==================== ADMIN (@Dbm0ne) ====================
  const admin = await prisma.user.upsert({
    where: { telegramId: BigInt(1) },
    update: { role: UserRole.ADMIN, status: UserStatus.APPROVED },
    create: {
      telegramId: BigInt(1), // Заменить на реальный telegram ID
      telegramUsername: "Dbm0ne",
      displayName: "Admin",
      role: UserRole.ADMIN,
      status: UserStatus.APPROVED,
      pinCode: "adm1",
      chatId: BigInt(1),
    },
  });

  // ==================== Тестовые пользователи ====================
  const anna = await prisma.user.upsert({
    where: { telegramId: BigInt(100001) },
    update: {},
    create: {
      telegramId: BigInt(100001),
      telegramUsername: "anna_mk",
      displayName: "Анна Маркетолог",
      role: UserRole.HEAD_MARKETER,
      status: UserStatus.APPROVED,
      pinCode: "a1b2",
      // chatId null — тестовый пользователь без реального Telegram чата
    },
  });

  const sergey = await prisma.user.upsert({
    where: { telegramId: BigInt(100002) },
    update: {},
    create: {
      telegramId: BigInt(100002),
      telegramUsername: "sergey_pm",
      displayName: "Сергей PM",
      role: UserRole.MARKETER,
      status: UserStatus.APPROVED,
      pinCode: "c3d4",
    },
  });

  const dima = await prisma.user.upsert({
    where: { telegramId: BigInt(100003) },
    update: {},
    create: {
      telegramId: BigInt(100003),
      telegramUsername: "dima_video",
      displayName: "Дима Видеомейкер",
      role: UserRole.LEAD_CREATOR,
      status: UserStatus.APPROVED,
      pinCode: "e5f6",
    },
  });

  const kate = await prisma.user.upsert({
    where: { telegramId: BigInt(100004) },
    update: {},
    create: {
      telegramId: BigInt(100004),
      telegramUsername: "kate_edit",
      displayName: "Катя Монтажёр",
      role: UserRole.CREATOR,
      status: UserStatus.APPROVED,
      pinCode: "g7h8",
      teamLeadId: dima.id,
    },
  });

  const max = await prisma.user.upsert({
    where: { telegramId: BigInt(100005) },
    update: {},
    create: {
      telegramId: BigInt(100005),
      telegramUsername: "max_cr",
      displayName: "Макс Креатор",
      role: UserRole.CREATOR,
      status: UserStatus.APPROVED,
      pinCode: "j9k0",
      teamLeadId: dima.id,
    },
  });

  // Тестовый юзер с PENDING статусом
  await prisma.user.upsert({
    where: { telegramId: BigInt(100006) },
    update: {},
    create: {
      telegramId: BigInt(100006),
      telegramUsername: "newbie_test",
      displayName: "Новичок Тест",
      role: UserRole.CREATOR,
      status: UserStatus.PENDING,
    },
  });

  console.log("✅ Users created");

  // ==================== Тестовые заказы ====================
  await prisma.order.create({
    data: {
      title: "Рилс для Ozon — весенняя коллекция",
      description: "AI-видео для весенней коллекции. Стиль: минимализм, пастельные тона. 30 сек.",
      status: "IN_PROGRESS",
      deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      reminderDays: 2,
      marketerId: anna.id,
      creators: {
        create: [
          { creatorId: dima.id, addedById: anna.id, isLead: true },
          { creatorId: kate.id, addedById: anna.id },
        ],
      },
      stages: {
        create: [
          { name: StageName.STORYBOARD, status: "DONE", sortOrder: 1, startedAt: new Date(Date.now() - 3 * 86400000), completedAt: new Date(Date.now() - 2 * 86400000) },
          { name: StageName.ANIMATION, status: "IN_PROGRESS", sortOrder: 2, startedAt: new Date(Date.now() - 1 * 86400000) },
          { name: StageName.EDITING, status: "PENDING", sortOrder: 3 },
          { name: StageName.REVIEW, status: "PENDING", sortOrder: 4 },
          { name: StageName.COMPLETED, status: "PENDING", sortOrder: 5 },
        ],
      },
    },
  });

  await prisma.order.create({
    data: {
      title: "Обзор нового продукта для YouTube",
      description: "AI-обзор нового гаджета. Раскадровка + анимация + монтаж.",
      status: "NEW",
      deadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      reminderDays: 3,
      marketerId: sergey.id,
      stages: {
        create: [
          { name: StageName.STORYBOARD, status: "PENDING", sortOrder: 1 },
          { name: StageName.ANIMATION, status: "PENDING", sortOrder: 2 },
          { name: StageName.EDITING, status: "PENDING", sortOrder: 3 },
          { name: StageName.REVIEW, status: "PENDING", sortOrder: 4 },
          { name: StageName.COMPLETED, status: "PENDING", sortOrder: 5 },
        ],
      },
    },
  });

  await prisma.order.create({
    data: {
      title: "Промо-ролик для VK Clips",
      description: "Короткий AI-ролик 15 сек. Динамичный монтаж.",
      status: "ON_REVIEW",
      deadline: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
      reminderDays: 1,
      marketerId: anna.id,
      creators: {
        create: [{ creatorId: max.id, addedById: anna.id }],
      },
      stages: {
        create: [
          { name: StageName.STORYBOARD, status: "DONE", sortOrder: 1, startedAt: new Date(Date.now() - 5 * 86400000), completedAt: new Date(Date.now() - 4 * 86400000) },
          { name: StageName.ANIMATION, status: "DONE", sortOrder: 2, startedAt: new Date(Date.now() - 4 * 86400000), completedAt: new Date(Date.now() - 3 * 86400000) },
          { name: StageName.EDITING, status: "DONE", sortOrder: 3, startedAt: new Date(Date.now() - 3 * 86400000), completedAt: new Date(Date.now() - 1 * 86400000) },
          { name: StageName.REVIEW, status: "IN_PROGRESS", sortOrder: 4, startedAt: new Date() },
          { name: StageName.COMPLETED, status: "PENDING", sortOrder: 5 },
        ],
      },
    },
  });

  console.log("✅ Orders created");
  console.log("\n🎉 Seed complete!\n");
  console.log("PIN-коды:");
  console.log("  Admin (@Dbm0ne):         adm1");
  console.log("  Анна (глав.маркетолог):  a1b2");
  console.log("  Сергей (маркетолог):     c3d4");
  console.log("  Дима (лид-креатор):      e5f6");
  console.log("  Катя (креатор):          g7h8");
  console.log("  Макс (креатор):          j9k0");
  console.log("\nCLI-админка: npm run admin -- qwaszx12\\ <command>");
}

main()
  .catch((e) => { console.error("❌ Seed error:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
