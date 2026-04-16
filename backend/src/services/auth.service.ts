import { PrismaClient } from "@prisma/client";
import { FastifyInstance } from "fastify";
import { normalizePin } from "../utils/pin";

const prisma = new PrismaClient();

export async function loginByPin(pin: string, app: FastifyInstance) {
  const normalizedPin = normalizePin(pin);

  const user = await prisma.user.findFirst({
    where: { pinCode: { equals: normalizedPin, mode: "insensitive" } },
    select: {
      id: true,
      displayName: true,
      telegramUsername: true,
      role: true,
      status: true,
      avatarUrl: true,
      isActive: true,
      teamLeadId: true,
      guideSeenAt: true,
    },
  });

  if (!user) {
    throw { statusCode: 401, message: "Неверный PIN-код" };
  }

  if (!user.isActive) {
    throw { statusCode: 403, message: "Аккаунт деактивирован" };
  }

  if (user.status === "BLOCKED") {
    throw { statusCode: 403, message: "Аккаунт заблокирован" };
  }

  if (user.status === "REJECTED") {
    throw { statusCode: 403, message: "Заявка на регистрацию отклонена" };
  }

  if (user.status === "PENDING") {
    throw { statusCode: 403, message: "Заявка на регистрацию ещё не одобрена. Дождитесь подтверждения." };
  }

  const token = app.jwt.sign(
    {
      id: user.id,
      role: user.role,
      status: user.status,
      telegramUsername: user.telegramUsername,
    },
    { expiresIn: "7d" }
  );

  return { token, user };
}
