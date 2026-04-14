import { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function usersRoutes(app: FastifyInstance) {
  // Все роуты требуют авторизации
  app.addHook("preHandler", app.authenticate);

  // GET /api/users — список всех пользователей
  app.get("/", async (request, reply) => {
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        displayName: true,
        telegramUsername: true,
        role: true,
        avatarUrl: true,
      },
      orderBy: { displayName: "asc" },
    });
    return users;
  });

  // GET /api/users/:id — профиль пользователя
  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.params.id },
      select: {
        id: true,
        displayName: true,
        telegramUsername: true,
        role: true,
        avatarUrl: true,
        createdAt: true,
        _count: {
          select: {
            createdOrders: true,
            assignments: true,
          },
        },
      },
    });

    if (!user) {
      return reply.status(404).send({ error: "Пользователь не найден" });
    }

    return user;
  });

  // PUT /api/users/:id — обновить профиль
  app.put<{
    Params: { id: string };
    Body: { displayName?: string; avatarUrl?: string };
  }>("/:id", async (request, reply) => {
    const { id } = request.params;
    const { displayName, avatarUrl } = request.body;

    // Можно редактировать только свой профиль (или админ)
    if (
      request.currentUser.id !== id &&
      request.currentUser.role !== "ADMIN"
    ) {
      return reply.status(403).send({ error: "Можно редактировать только свой профиль" });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(displayName && { displayName }),
        ...(avatarUrl !== undefined && { avatarUrl }),
      },
      select: {
        id: true,
        displayName: true,
        telegramUsername: true,
        role: true,
        avatarUrl: true,
      },
    });

    return updated;
  });
}
