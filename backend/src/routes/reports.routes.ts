import { FastifyInstance } from "fastify";
import { PrismaClient, UserRole } from "@prisma/client";
import { requireRole } from "../middleware/role.middleware";

const prisma = new PrismaClient();

export async function reportsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get<{ Params: { orderId: string }; Querystring: { creatorId?: string } }>("/", async (req) => {
    const where: any = { orderId: req.params.orderId };
    if (req.query.creatorId) where.creatorId = req.query.creatorId;

    return prisma.dailyReport.findMany({
      where,
      include: {
        creator: { select: { id: true, displayName: true, telegramUsername: true, avatarUrl: true } },
      },
      orderBy: { reportDate: "desc" },
    });
  });

  app.post<{ Params: { orderId: string }; Body: { reportText: string; reportDate?: string } }>(
    "/",
    { preHandler: [requireRole(UserRole.CREATOR, UserRole.LEAD_CREATOR, UserRole.ADMIN)] },
    async (req, reply) => {
      const { orderId } = req.params;
      const { reportText, reportDate } = req.body;
      if (!reportText?.trim()) return reply.status(400).send({ error: "Текст отчёта обязателен" });

      const assignment = await prisma.orderCreator.findFirst({
        where: { orderId, creatorId: req.currentUser.id },
      });
      if (!assignment && req.currentUser.role !== "ADMIN") {
        return reply.status(403).send({ error: "Вы не назначены на этот заказ" });
      }

      const date = reportDate ? new Date(reportDate) : new Date();
      date.setHours(0, 0, 0, 0);

      try {
        const report = await prisma.dailyReport.upsert({
          where: { orderId_creatorId_reportDate: { orderId, creatorId: req.currentUser.id, reportDate: date } },
          update: { reportText: reportText.trim(), submittedAt: new Date() },
          create: { orderId, creatorId: req.currentUser.id, reportText: reportText.trim(), reportDate: date },
          include: { creator: { select: { id: true, displayName: true, telegramUsername: true, avatarUrl: true } } },
        });
        return reply.status(201).send(report);
      } catch (err: any) { return reply.status(500).send({ error: err.message }); }
    }
  );
}
