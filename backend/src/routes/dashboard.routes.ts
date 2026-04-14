import { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function dashboardRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // GET /api/dashboard/stats
  app.get("/stats", async () => {
    const [totalOrders, byStatus, totalUsers, byRole, recentReports, avgCompletionTime] = await Promise.all([
      prisma.order.count(),
      prisma.order.groupBy({ by: ["status"], _count: { id: true } }),
      prisma.user.count({ where: { status: "APPROVED" } }),
      prisma.user.groupBy({ by: ["role"], _count: { id: true }, where: { status: "APPROVED" } }),
      prisma.dailyReport.count({ where: { reportDate: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } }),
      // Среднее время выполнения (заказы со статусом DONE)
      prisma.$queryRaw`
        SELECT AVG(EXTRACT(EPOCH FROM ("updated_at" - "created_at")) / 86400)::numeric(10,1) as avg_days
        FROM orders WHERE status = 'DONE'
      ` as Promise<{ avg_days: string }[]>,
    ]);

    const statusMap = Object.fromEntries(byStatus.map((s) => [s.status, s._count.id]));
    const roleMap = Object.fromEntries(byRole.map((r) => [r.role, r._count.id]));

    return {
      orders: {
        total: totalOrders,
        new: statusMap.NEW || 0,
        inProgress: statusMap.IN_PROGRESS || 0,
        onReview: statusMap.ON_REVIEW || 0,
        done: statusMap.DONE || 0,
        archived: statusMap.ARCHIVED || 0,
      },
      users: { total: totalUsers, ...roleMap },
      reportsLastWeek: recentReports,
      avgCompletionDays: avgCompletionTime[0]?.avg_days || null,
    };
  });

  // GET /api/dashboard/activity — последняя активность
  app.get("/activity", async () => {
    const [recentOrders, recentComments, recentReports] = await Promise.all([
      prisma.order.findMany({
        orderBy: { updatedAt: "desc" },
        take: 10,
        select: { id: true, title: true, status: true, updatedAt: true, marketer: { select: { displayName: true } } },
      }),
      prisma.orderComment.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true, text: true, createdAt: true,
          author: { select: { displayName: true } },
          order: { select: { id: true, title: true } },
        },
      }),
      prisma.dailyReport.findMany({
        orderBy: { submittedAt: "desc" },
        take: 10,
        select: {
          id: true, reportText: true, reportDate: true, submittedAt: true,
          creator: { select: { displayName: true } },
          order: { select: { id: true, title: true } },
        },
      }),
    ]);

    return { recentOrders, recentComments, recentReports };
  });
}
