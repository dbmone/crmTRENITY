import { FastifyInstance } from "fastify";
import { loginByPin } from "../services/auth.service";

export async function authRoutes(app: FastifyInstance) {
  // POST /api/auth/login
  app.post<{ Body: { pin: string } }>("/login", async (request, reply) => {
    const { pin } = request.body;

    if (!pin || pin.length !== 4) {
      return reply.status(400).send({ error: "PIN должен быть 4 символа" });
    }

    try {
      const result = await loginByPin(pin, app);
      return result;
    } catch (err: any) {
      return reply
        .status(err.statusCode || 500)
        .send({ error: err.message || "Ошибка авторизации" });
    }
  });

  // GET /api/auth/me — текущий пользователь
  app.get(
    "/me",
    { preHandler: [app.authenticate] },
    async (request) => {
      const { PrismaClient } = await import("@prisma/client");
      const prisma = new PrismaClient();

      const user = await prisma.user.findUnique({
        where: { id: request.currentUser.id },
        select: {
          id: true,
          displayName: true,
          telegramUsername: true,
          role: true,
          avatarUrl: true,
          isActive: true,
          createdAt: true,
        },
      });

      return user;
    }
  );
}
