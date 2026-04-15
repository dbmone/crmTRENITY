import { FastifyInstance } from "fastify";
import { PrismaClient, UserRole, UserStatus } from "@prisma/client";
import { requireRole, canManageUser, assignableRoles } from "../middleware/role.middleware";
import { generateUniquePin } from "../utils/pin";
import { notifyRegistrationResult } from "../services/notification.service";

const prisma = new PrismaClient();

export async function usersRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // GET /api/users — все одобренные пользователи
  app.get<{ Querystring: { includeAll?: string } }>("/", async (request) => {
    const showAll = request.query.includeAll === "true" && ((): boolean => {
      const allowed: UserRole[] = [UserRole.ADMIN, UserRole.HEAD_MARKETER, UserRole.HEAD_CREATOR, UserRole.LEAD_CREATOR];
      return allowed.includes(request.currentUser.role as UserRole);
    })();

    return prisma.user.findMany({
      where: showAll ? {} : { status: UserStatus.APPROVED, isActive: true },
      select: {
        id: true, displayName: true, telegramUsername: true, role: true,
        status: true, avatarUrl: true, teamLeadId: true, createdAt: true,
        teamLead: { select: { id: true, displayName: true, telegramUsername: true, role: true } },
        _count: { select: { createdOrders: true, assignments: true, subordinates: true } },
      },
      orderBy: { displayName: "asc" },
    });
  });

  // GET /api/users/pending — заявки на регистрацию
  app.get("/pending", {
    preHandler: [requireRole(UserRole.ADMIN, UserRole.HEAD_MARKETER, UserRole.HEAD_CREATOR, UserRole.LEAD_CREATOR)],
  }, async (request) => {
    const userRole = request.currentUser.role as UserRole;

    // Lead Creator видит только заявки креаторов
    const where: any = { status: UserStatus.PENDING };
    if (userRole === UserRole.LEAD_CREATOR) {
      where.role = UserRole.CREATOR;
    }

    return prisma.user.findMany({
      where,
      select: {
        id: true, displayName: true, telegramUsername: true, role: true,
        status: true, createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  });

  // GET /api/users/:id — профиль
  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.params.id },
      select: {
        id: true, displayName: true, telegramUsername: true, role: true,
        status: true, avatarUrl: true, createdAt: true, teamLeadId: true,
        teamLead: { select: { id: true, displayName: true, telegramUsername: true, role: true, avatarUrl: true } },
        subordinates: { select: { id: true, displayName: true, telegramUsername: true, role: true, avatarUrl: true } },
        _count: { select: { createdOrders: true, assignments: true } },
      },
    });
    if (!user) return reply.status(404).send({ error: "Пользователь не найден" });
    return user;
  });

  // PUT /api/users/:id — обновить профиль
  app.put<{ Params: { id: string }; Body: { displayName?: string; avatarUrl?: string } }>("/:id", async (request, reply) => {
    const { id } = request.params;
    if (request.currentUser.id !== id && request.currentUser.role !== "ADMIN") {
      return reply.status(403).send({ error: "Можно редактировать только свой профиль" });
    }
    return prisma.user.update({
      where: { id },
      data: {
        ...(request.body.displayName && { displayName: request.body.displayName }),
        ...(request.body.avatarUrl !== undefined && { avatarUrl: request.body.avatarUrl }),
      },
      select: { id: true, displayName: true, telegramUsername: true, role: true, avatarUrl: true },
    });
  });

  // POST /api/users/:id/approve — одобрить заявку (опционально сменить роль)
  app.post<{ Params: { id: string }; Body: { role?: UserRole } }>("/:id/approve", {
    preHandler: [requireRole(UserRole.ADMIN, UserRole.HEAD_MARKETER, UserRole.HEAD_CREATOR, UserRole.LEAD_CREATOR)],
  }, async (request, reply) => {
    const target = await prisma.user.findUnique({ where: { id: request.params.id } });
    if (!target) return reply.status(404).send({ error: "Не найден" });

    const managerRole = request.currentUser.role as UserRole;
    const finalRole   = request.body?.role ?? target.role;

    if (!canManageUser(managerRole, finalRole)) {
      return reply.status(403).send({ error: "Вы не можете одобрить пользователя с этой ролью" });
    }

    const pin = await generateUniquePin(prisma);
    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { status: UserStatus.APPROVED, pinCode: pin, approvedById: request.currentUser.id, role: finalRole },
    });

    await notifyRegistrationResult(target.id, true);
    return { ...updated, pinCode: pin };
  });

  // POST /api/users/:id/reject — отклонить
  app.post<{ Params: { id: string } }>("/:id/reject", {
    preHandler: [requireRole(UserRole.ADMIN, UserRole.HEAD_MARKETER, UserRole.HEAD_CREATOR, UserRole.LEAD_CREATOR)],
  }, async (request, reply) => {
    const target = await prisma.user.findUnique({ where: { id: request.params.id } });
    if (!target) return reply.status(404).send({ error: "Не найден" });

    await prisma.user.update({
      where: { id: target.id },
      data: { status: UserStatus.REJECTED },
    });

    await notifyRegistrationResult(target.id, false);
    return { success: true };
  });

  // PUT /api/users/:id/role — сменить роль
  app.put<{ Params: { id: string }; Body: { role: UserRole } }>("/:id/role", {
    preHandler: [requireRole(UserRole.ADMIN, UserRole.HEAD_MARKETER, UserRole.HEAD_CREATOR, UserRole.LEAD_CREATOR)],
  }, async (request, reply) => {
    const { role } = request.body;
    const managerRole = request.currentUser.role as UserRole;

    const allowed = assignableRoles(managerRole);
    if (!allowed.includes(role)) {
      return reply.status(403).send({ error: `Вы не можете назначить роль ${role}`, allowed });
    }

    return prisma.user.update({
      where: { id: request.params.id },
      data: { role },
      select: { id: true, displayName: true, role: true },
    });
  });

  // PUT /api/users/:id/team-lead — назначить тимлида
  app.put<{ Params: { id: string }; Body: { teamLeadId: string | null } }>("/:id/team-lead", {
    preHandler: [requireRole(UserRole.ADMIN, UserRole.HEAD_CREATOR, UserRole.HEAD_MARKETER, UserRole.LEAD_CREATOR)],
  }, async (request, reply) => {
    return prisma.user.update({
      where: { id: request.params.id },
      data: { teamLeadId: request.body.teamLeadId },
      select: { id: true, displayName: true, teamLeadId: true },
    });
  });

  // POST /api/users/:id/block — заблокировать
  app.post<{ Params: { id: string } }>("/:id/block", {
    preHandler: [requireRole(UserRole.ADMIN)],
  }, async (request) => {
    return prisma.user.update({
      where: { id: request.params.id },
      data: { status: UserStatus.BLOCKED, isActive: false },
    });
  });
}
