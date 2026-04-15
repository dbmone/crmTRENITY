import { FastifyInstance } from "fastify";
import { PrismaClient, UserRole } from "@prisma/client";
import { requireRole } from "../middleware/role.middleware";
import {
  getAllPermissionsConfig,
  invalidateCache,
  loadPermissions,
  PERMISSION_KEYS,
  PermissionKey,
} from "../services/permissions.service";

const prisma = new PrismaClient();

export async function permissionsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // GET /api/permissions — все права (для UI редактора)
  app.get("/", {
    preHandler: [requireRole(UserRole.ADMIN)],
  }, async () => {
    return getAllPermissionsConfig();
  });

  // PUT /api/permissions/:key — обновить список ролей для права
  app.put<{ Params: { key: string }; Body: { roles: UserRole[] } }>("/:key", {
    preHandler: [requireRole(UserRole.ADMIN)],
  }, async (request, reply) => {
    const { key } = request.params;
    const { roles } = request.body;

    if (!PERMISSION_KEYS.includes(key as PermissionKey)) {
      return reply.status(400).send({ error: `Неизвестный ключ права: ${key}` });
    }

    // Валидация ролей
    const validRoles = Object.values(UserRole);
    const invalidRoles = roles.filter((r) => !validRoles.includes(r));
    if (invalidRoles.length > 0) {
      return reply.status(400).send({ error: `Недопустимые роли: ${invalidRoles.join(", ")}` });
    }

    await prisma.permission.upsert({
      where: { key },
      update: { roles },
      create: { key, label: key, roles },
    });

    invalidateCache();
    await loadPermissions();

    return getAllPermissionsConfig();
  });

  // DELETE /api/permissions/:key — сбросить право к дефолту
  app.delete<{ Params: { key: string } }>("/:key", {
    preHandler: [requireRole(UserRole.ADMIN)],
  }, async (request, reply) => {
    const { key } = request.params;
    if (!PERMISSION_KEYS.includes(key as PermissionKey)) {
      return reply.status(400).send({ error: `Неизвестный ключ права: ${key}` });
    }

    await prisma.permission.deleteMany({ where: { key } });
    invalidateCache();
    await loadPermissions();

    return getAllPermissionsConfig();
  });

  // GET /api/permissions/users/:userId — индивидуальные overrides
  app.get<{ Params: { userId: string } }>("/users/:userId", {
    preHandler: [requireRole(UserRole.ADMIN)],
  }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.params.userId },
      select: { id: true, displayName: true, role: true },
    });
    if (!user) return reply.status(404).send({ error: "Пользователь не найден" });

    const overrides = await prisma.userPermission.findMany({
      where: { userId: request.params.userId },
    });

    return { user, overrides };
  });

  // PUT /api/permissions/users/:userId/:key — установить override для пользователя
  app.put<{
    Params: { userId: string; key: string };
    Body: { granted: boolean };
  }>("/users/:userId/:key", {
    preHandler: [requireRole(UserRole.ADMIN)],
  }, async (request, reply) => {
    const { userId, key } = request.params;
    const { granted } = request.body;

    if (!PERMISSION_KEYS.includes(key as PermissionKey)) {
      return reply.status(400).send({ error: `Неизвестный ключ права: ${key}` });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return reply.status(404).send({ error: "Пользователь не найден" });

    const result = await prisma.userPermission.upsert({
      where: { userId_permission: { userId, permission: key } },
      update: { granted },
      create: { userId, permission: key, granted },
    });

    return result;
  });

  // DELETE /api/permissions/users/:userId/:key — убрать override (вернуть к роли)
  app.delete<{ Params: { userId: string; key: string } }>("/users/:userId/:key", {
    preHandler: [requireRole(UserRole.ADMIN)],
  }, async (request, reply) => {
    const { userId, key } = request.params;

    await prisma.userPermission.deleteMany({
      where: { userId, permission: key },
    });

    return { success: true };
  });
}
