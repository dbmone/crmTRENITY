import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log("Поиск системного администратора...");

  // Ищем системного админа (старый seed создавал его с telegramId = 1 и pinCode = "adm1")
  const admin = await prisma.user.findFirst({
    where: { 
      telegramId: 1n, 
      pinCode: 'adm1' 
    }
  });

  if (admin) {
    console.log(`Нашёлся системный админ: ID ${admin.id}, Ник: @${admin.telegramUsername}`);
    
    // Обновляем ник и telegramId, чтобы он не конфликтовал с вашим настоящим аккаунтом
    const updated = await prisma.user.update({
      where: { id: admin.id },
      data: {
        telegramId: 999999n, // Новый системный ID (не пересекается с реальными пользователями Telegram)
        telegramUsername: "system_admin",
        displayName: "System Admin",
        chatId: 999999n
      }
    });

    console.log(`✅ Системный админ успешно обновлен! (Новый ник: @${updated.telegramUsername}, ID: ${updated.telegramId})`);
    console.log(`🔑 Пароль (пин-код) "adm1" сохранен без изменений.`);
  } else {
    console.log("❌ Системный админ (с telegramId=1 и pinCode='adm1') не найден в базе данных.");
    console.log("Возможно, он уже был обновлен ранее или имеет другие параметры.");
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
