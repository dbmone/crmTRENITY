import { PrismaClient } from "@prisma/client";
import { FastifyInstance } from "fastify";

const prisma = new PrismaClient();

export async function loginByPin(pin: string, app: FastifyInstance) {
  const user = await prisma.user.findUnique({
    where: { pinCode: pin },
    select: {
      id: true,
      displayName: true,
      telegramUsername: true,
      role: true,
      avatarUrl: true,
      isActive: true,
    },
  });

  if (!user) {
    throw { statusCode: 401, message: "Неверный PIN-код" };
  }

  if (!user.isActive) {
    throw { statusCode: 403, message: "Аккаунт деактивирован" };
  }

  const token = app.jwt.sign(
    {
      id: user.id,
      role: user.role,
      telegramUsername: user.telegramUsername,
    },
    { expiresIn: "7d" }
  );

  return { token, user };
}
