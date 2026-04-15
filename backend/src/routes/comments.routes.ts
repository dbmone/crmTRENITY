import { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { notifyComment } from "../services/notification.service";

const prisma = new PrismaClient();

export async function commentsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // GET /api/orders/:orderId/comments
  app.get<{ Params: { orderId: string } }>("/", async (req) => {
    return prisma.orderComment.findMany({
      where: { orderId: req.params.orderId },
      include: {
        author: {
          select: { id: true, displayName: true, telegramUsername: true, avatarUrl: true, role: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });
  });

  // POST /api/orders/:orderId/comments
  app.post<{ Params: { orderId: string }; Body: { text: string } }>("/", async (req, reply) => {
    const { text } = req.body;
    if (!text?.trim()) return reply.status(400).send({ error: "Текст комментария обязателен" });

    const order = await prisma.order.findUnique({
      where: { id: req.params.orderId },
      include: { creators: { select: { creatorId: true } } },
    });
    if (!order) return reply.status(404).send({ error: "Заказ не найден" });

    const comment = await prisma.orderComment.create({
      data: { orderId: req.params.orderId, authorId: req.currentUser.id, text: text.trim() },
      include: {
        author: { select: { id: true, displayName: true, telegramUsername: true, avatarUrl: true, role: true } },
      },
    });

    // Уведомляем всех участников (кроме автора)
    const author = await prisma.user.findUnique({ where: { id: req.currentUser.id }, select: { displayName: true } });
    const recipientIds = [order.marketerId, ...order.creators.map((c) => c.creatorId)]
      .filter((id) => id !== req.currentUser.id);

    await notifyComment(order.id, order.title, author?.displayName || "Кто-то", [...new Set(recipientIds)], text.trim());

    return reply.status(201).send(comment);
  });
}
