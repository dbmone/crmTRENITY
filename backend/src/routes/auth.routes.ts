import { FastifyInstance } from "fastify";
import { PrismaClient, UserRole } from "@prisma/client";
import { loginByPin } from "../services/auth.service";
import { getUserEffectivePermissions } from "../services/permissions.service";
import { normalizePin } from "../utils/pin";

const prisma = new PrismaClient();

export async function authRoutes(app: FastifyInstance) {
  // POST /api/auth/login
  app.post<{ Body: { pin: string } }>("/login", async (request, reply) => {
    const normalizedPin = normalizePin(request.body.pin || "");
    if (!normalizedPin || normalizedPin.length !== 4) {
      return reply.status(400).send({ error: "PIN должен быть 4 символа" });
    }
    try {
      return await loginByPin(normalizedPin, app);
    } catch (err: any) {
      return reply.status(err.statusCode || 500).send({ error: err.message || "Ошибка авторизации" });
    }
  });

  // GET /api/auth/me — профиль + эффективные права
  app.get("/me", { preHandler: [app.authenticate] }, async (request) => {
    const user = await prisma.user.findUnique({
      where: { id: request.currentUser.id },
      select: {
        id: true, displayName: true, telegramUsername: true, role: true,
        status: true, avatarUrl: true, isActive: true, createdAt: true,
        guideSeenAt: true,
        teamLeadId: true,
        teamLead: { select: { id: true, displayName: true, telegramUsername: true, role: true, avatarUrl: true } },
      },
    });
    if (!user) return null;
    const permissions = await getUserEffectivePermissions(user.id, user.role as UserRole);
    return { ...user, permissions };
  });
}
