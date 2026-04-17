import crypto from "crypto";
import { FastifyInstance } from "fastify";
import { PrismaClient, UserRole } from "@prisma/client";
import { loginByPin } from "../services/auth.service";
import { getUserEffectivePermissions } from "../services/permissions.service";
import { normalizePin } from "../utils/pin";
import { config } from "../config";

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

  // POST /api/auth/telegram-webapp — вход через Telegram Mini App (initData)
  app.post<{ Body: { initData: string } }>("/telegram-webapp", async (request, reply) => {
    const { initData } = request.body ?? {};
    if (!initData) return reply.status(400).send({ error: "initData required" });

    const botToken = config.bot.token;
    if (!botToken) return reply.status(500).send({ error: "Bot not configured" });

    // Validate HMAC-SHA256
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return reply.status(401).send({ error: "No hash in initData" });
    params.delete("hash");

    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");

    const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
    const expectedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

    if (expectedHash !== hash) return reply.status(401).send({ error: "Invalid initData" });

    // Allow up to 1 hour old
    const authDate = parseInt(params.get("auth_date") ?? "0");
    if (Date.now() / 1000 - authDate > 3600) return reply.status(401).send({ error: "initData expired" });

    let tgUser: { id: number };
    try { tgUser = JSON.parse(params.get("user") ?? "{}"); }
    catch { return reply.status(401).send({ error: "Bad user data" }); }

    if (!tgUser?.id) return reply.status(401).send({ error: "No user id in initData" });

    const user = await prisma.user.findFirst({
      where: { telegramId: BigInt(tgUser.id) },
      select: {
        id: true, displayName: true, telegramUsername: true, role: true,
        status: true, avatarUrl: true, isActive: true, teamLeadId: true, guideSeenAt: true,
      },
    });

    if (!user) return reply.status(404).send({ error: "not_registered" });
    if (!user.isActive || user.status === "BLOCKED") return reply.status(403).send({ error: "blocked" });
    if (user.status === "PENDING") return reply.status(403).send({ error: "pending" });
    if (user.status !== "APPROVED") return reply.status(403).send({ error: "not_approved" });

    const token = app.jwt.sign(
      { id: user.id, role: user.role, status: user.status, telegramUsername: user.telegramUsername },
      { expiresIn: "7d" }
    );
    return { token, user };
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
