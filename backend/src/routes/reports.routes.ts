import { FastifyInstance } from "fastify";
import { PrismaClient, UserRole } from "@prisma/client";
import { requireRole } from "../middleware/role.middleware";

const prisma = new PrismaClient();

export async function reportsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // GET /api/orders/:orderId/reports — все отчёты по заказу
  app.get<{
    Params: { orderId: string };
    Querystring: { creatorId?: string };
  }>("/", async (request) => {
    const where: any = { orderId: request.params.orderId };

    if (request.query.creatorId) {
      where.creatorId = request.query.creatorId;
    }

    return prisma.dailyReport.findMany({
      where,
      include: {
        creator: {
          select: {
            id: true,
            displayName: true,
            telegramUsername: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { reportDate: "desc" },
    });
  });

  // POST /api/orders/:orderId/reports — отправить отчёт
  app.post<{
    Params: { orderId: string };
    Body: { reportText: string; reportDate?: string };
  }>(
    "/",
    {
      preHandler: [
        requireRole(UserRole.CREATOR, UserRole.LEAD_CREATOR, UserRole.ADMIN),
      ],
    },
    async (request, reply) => {
      const { orderId } = request.params;
      const { reportText, reportDate } = request.body;

      if (!reportText || reportText.trim().length === 0) {
        return reply.status(400).send({ error: "Текст отчёта обязателен" });
      }

      // Проверяем что креатор назначен на заказ
      const assignment = await prisma.orderCreator.findFirst({
        where: {
          orderId,
          creatorId: request.currentUser.id,
        },
      });

      if (!assignment && request.currentUser.role !== "ADMIN") {
        return reply
          .status(403)
          .send({ error: "Вы не назначены на этот заказ" });
      }

      const date = reportDate ? new Date(reportDate) : new Date();
      date.setHours(0, 0, 0, 0);

      try {
        const report = await prisma.dailyReport.upsert({
          where: {
            orderId_creatorId_reportDate: {
              orderId,
              creatorId: request.currentUser.id,
              reportDate: date,
            },
          },
          update: {
            reportText: reportText.trim(),
            submittedAt: new Date(),
          },
          create: {
            orderId,
            creatorId: request.currentUser.id,
            reportText: reportText.trim(),
            reportDate: date,
          },
          include: {
            creator: {
              select: {
                id: true,
                displayName: true,
                telegramUsername: true,
                avatarUrl: true,
              },
            },
          },
        });

        return reply.status(201).send(report);
      } catch (err: any) {
        return reply
          .status(err.statusCode || 500)
          .send({ error: err.message || "Ошибка при сохранении отчёта" });
      }
    }
  );
}
