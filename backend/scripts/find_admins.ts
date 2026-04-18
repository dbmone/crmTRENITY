import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: { OR: [{ role: 'ADMIN' }, { telegramUsername: 'Dbm0ne' }] },
  });
  console.log(users.map(u => ({
    id: u.id,
    telegramId: u.telegramId.toString(),
    telegramUsername: u.telegramUsername,
    displayName: u.displayName,
    role: u.role,
    isActive: u.isActive,
    pinCode: u.pinCode
  })));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });