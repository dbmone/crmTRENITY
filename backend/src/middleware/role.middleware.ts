import { FastifyRequest, FastifyReply } from "fastify";
import { UserRole } from "@prisma/client";

export function requireRole(...roles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userRole = request.currentUser?.role as UserRole;

    if (!userRole) {
      return reply.status(401).send({ error: "Не авторизован" });
    }

    // ADMIN имеет доступ всюду
    if (userRole === UserRole.ADMIN) return;

    if (!roles.includes(userRole)) {
      return reply.status(403).send({
        error: "Нет доступа",
        required: roles,
        current: userRole,
      });
    }
  };
}

/**
 * Проверяет, может ли пользователь утверждать заказ (REVIEW → COMPLETED).
 * Только MARKETER (создатель заказа), LEAD_CREATOR, или ADMIN.
 */
export function canApprove(userRole: UserRole): boolean {
  return [UserRole.MARKETER, UserRole.LEAD_CREATOR, UserRole.ADMIN].includes(
    userRole
  );
}
