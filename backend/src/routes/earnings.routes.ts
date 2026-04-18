import { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { calculateUserEarnings, getPercentageSettings } from "../services/earnings.service";
import { upsertSetting, getSetting } from "../services/settings.service";

const prisma = new PrismaClient();

const ADMIN_ROLES = ["ADMIN", "HEAD_CREATOR", "HEAD_MARKETER"];

export async function earningsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // GET /api/earnings — заработок текущего пользователя
  app.get("/", async (req) => {
    return calculateUserEarnings(req.currentUser.id);
  });

  // GET /api/earnings/user/:userId — заработок конкретного пользователя (только админы)
  app.get<{ Params: { userId: string } }>("/user/:userId", async (req, reply) => {
    if (!ADMIN_ROLES.includes(req.currentUser.role)) {
      return reply.status(403).send({ error: "Нет доступа" });
    }
    return calculateUserEarnings(req.params.userId);
  });

  // GET /api/earnings/all — сводка по всем пользователям (только ADMIN)
  app.get("/all", async (req, reply) => {
    if (req.currentUser.role !== "ADMIN") {
      return reply.status(403).send({ error: "Только для администраторов" });
    }
    const users = await prisma.user.findMany({
      where: { status: "APPROVED" },
      select: { id: true, displayName: true, role: true },
    });
    const results = await Promise.all(
      users.map(async (u) => {
        const entries = await calculateUserEarnings(u.id);
        const total = entries.reduce((s, e) => s + e.amount, 0);
        return { user: u, total: Math.round(total * 100) / 100, entries };
      })
    );
    return results;
  });

  // GET /api/earnings/percentage-settings — получить настройки процентов
  app.get("/percentage-settings", async () => {
    return getPercentageSettings();
  });

  // PUT /api/earnings/percentage-settings — обновить настройки процентов (ADMIN)
  app.put<{ Body: Record<string, number> }>("/percentage-settings", async (req, reply) => {
    if (req.currentUser.role !== "ADMIN") {
      return reply.status(403).send({ error: "Только для администраторов" });
    }
    const current = await getPercentageSettings();
    const updated = { ...current, ...req.body };
    await upsertSetting("percentage_settings", JSON.stringify(updated), req.currentUser.id);
    return updated;
  });

  // GET /api/earnings/action-permissions — права на действия
  app.get("/action-permissions", async () => {
    try {
      const raw = await getSetting("action_permissions");
      if (!raw) return getDefaultActionPermissions();
      return JSON.parse(raw);
    } catch {
      return getDefaultActionPermissions();
    }
  });

  // PUT /api/earnings/action-permissions — обновить права (ADMIN)
  app.put<{ Body: Record<string, string[]> }>("/action-permissions", async (req, reply) => {
    if (req.currentUser.role !== "ADMIN") {
      return reply.status(403).send({ error: "Только для администраторов" });
    }
    const current = await (async () => {
      try {
        const raw = await getSetting("action_permissions");
        return raw ? JSON.parse(raw) : getDefaultActionPermissions();
      } catch { return getDefaultActionPermissions(); }
    })();
    const updated = { ...current, ...req.body };
    await upsertSetting("action_permissions", JSON.stringify(updated), req.currentUser.id);
    return updated;
  });
}

function getDefaultActionPermissions() {
  return {
    set_order_price:    ["ADMIN", "HEAD_CREATOR", "HEAD_MARKETER", "MARKETER"],
    set_order_tax:      ["ADMIN", "HEAD_CREATOR", "HEAD_MARKETER", "MARKETER"],
    set_creator_results: ["ADMIN", "HEAD_CREATOR", "HEAD_LEAD_CREATOR", "LEAD_CREATOR"],
  };
}
