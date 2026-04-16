import { PrismaClient } from "@prisma/client";
import { sendTextToChat } from "./telegram.service";
import { generateUniquePin, normalizePin } from "../utils/pin";

export async function sendPinCodeToTelegram(
  chatId: bigint | null | undefined,
  pin: string,
  reason: "approved" | "normalized" = "approved"
) {
  if (!chatId) return false;

  const intro =
    reason === "approved"
      ? "✅ Ваша заявка одобрена!"
      : "🔄 Ваш PIN-код для входа обновлён.";

  const hint =
    reason === "approved"
      ? "Используйте его для входа на сайт."
      : "Теперь он сохранён в нижнем регистре. Вводить можно маленькими буквами, регистр не важен.";

  await sendTextToChat(
    chatId.toString(),
    `${intro}\n\n🔑 PIN для входа на сайт: \`${pin}\`\n${hint}`
  );

  return true;
}

export async function normalizeExistingPins(prisma: PrismaClient) {
  const users = await prisma.user.findMany({
    where: { pinCode: { not: null } },
    select: {
      id: true,
      displayName: true,
      pinCode: true,
      chatId: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const reservedPins = new Set<string>();
  const changedUsers: Array<{ displayName: string; pinCode: string; chatId: bigint | null }> = [];

  for (const user of users) {
    const currentPin = user.pinCode ?? "";
    let nextPin = normalizePin(currentPin);

    const invalid = nextPin.length !== 4 || /[^a-z0-9]/.test(nextPin);
    if (invalid || reservedPins.has(nextPin)) {
      nextPin = await generateUniquePin(prisma, user.id, reservedPins);
    }

    reservedPins.add(nextPin);

    if (nextPin === currentPin) continue;

    await prisma.user.update({
      where: { id: user.id },
      data: { pinCode: nextPin },
    });

    changedUsers.push({
      displayName: user.displayName,
      pinCode: nextPin,
      chatId: user.chatId,
    });
  }

  let notified = 0;
  for (const user of changedUsers) {
    try {
      if (await sendPinCodeToTelegram(user.chatId, user.pinCode, "normalized")) {
        notified++;
      }
    } catch (err) {
      console.warn(`PIN sync: failed to notify ${user.displayName}:`, (err as Error).message);
    }
  }

  return { updated: changedUsers.length, notified };
}
