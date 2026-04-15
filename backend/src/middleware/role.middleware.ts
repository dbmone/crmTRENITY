import { FastifyRequest, FastifyReply } from "fastify";
import { UserRole } from "@prisma/client";

/**
 * Иерархия ролей:
 * ADMIN — может всё
 * HEAD_MARKETER — главный маркетолог
 * MARKETER — создаёт заказы
 * HEAD_CREATOR — главный креатор, выше тимлидов
 * LEAD_CREATOR — тимлид, управляет своей командой CREATOR
 * CREATOR — выполняет заказы
 */

const ROLE_HIERARCHY: Record<UserRole, number> = {
  ADMIN: 100,
  HEAD_MARKETER: 80,
  HEAD_CREATOR: 70,
  MARKETER: 40,
  LEAD_CREATOR: 30,
  CREATOR: 10,
};

export function requireRole(...roles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userRole = request.currentUser?.role as UserRole;
    if (!userRole) {
      return reply.status(401).send({ error: "Не авторизован" });
    }
    if (userRole === UserRole.ADMIN) return;
    if (!roles.includes(userRole)) {
      return reply.status(403).send({ error: "Нет доступа", required: roles, current: userRole });
    }
  };
}

export function canManageUser(managerRole: UserRole, targetRole: UserRole): boolean {
  if (managerRole === UserRole.ADMIN) return true;
  const managerLevel = ROLE_HIERARCHY[managerRole] || 0;
  const targetLevel  = ROLE_HIERARCHY[targetRole]  || 0;
  return managerLevel > targetLevel;
}

export function assignableRoles(managerRole: UserRole): UserRole[] {
  switch (managerRole) {
    case UserRole.ADMIN:
      return [UserRole.ADMIN, UserRole.HEAD_MARKETER, UserRole.HEAD_CREATOR, UserRole.LEAD_CREATOR, UserRole.MARKETER, UserRole.CREATOR];
    case UserRole.HEAD_MARKETER:
      return [UserRole.MARKETER, UserRole.LEAD_CREATOR, UserRole.CREATOR];
    case UserRole.HEAD_CREATOR:
      return [UserRole.LEAD_CREATOR, UserRole.CREATOR];
    case UserRole.LEAD_CREATOR:
      return [UserRole.CREATOR];
    default:
      return [];
  }
}

export function canApproveOrder(userRole: UserRole): boolean {
  const approvers: UserRole[] = [UserRole.ADMIN, UserRole.HEAD_MARKETER, UserRole.MARKETER, UserRole.HEAD_CREATOR, UserRole.LEAD_CREATOR];
  return approvers.includes(userRole);
}
