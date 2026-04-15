const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const count = await prisma.user.count();
  if (count > 0) {
    console.log("✅ Users exist, skipping seed");
    return;
  }

  const admin = await prisma.user.create({
    data: {
      telegramId: "0",
      telegramUsername: "admin",
      displayName: "Администратор",
      role: "ADMIN",
      status: "APPROVED",
      isActive: true,
      pinCode: "Adm1",
    },
  });

  console.log("🔑 Admin created, PIN: Adm1");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
