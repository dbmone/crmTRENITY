import { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { getSetting } from "../services/settings.service";

const prisma = new PrismaClient();

const CHECKBOX_FIELDS = ["didStoryboard", "didAnimation", "didEditing", "didScenario"] as const;
const HELPER_FIELDS = {
  didStoryboard: "helperStoryboardId",
  didAnimation:  "helperAnimationId",
  didEditing:    "helperEditingId",
  didScenario:   "helperScenarioId",
} as const;

// Проверяем право выставлять галочки через action_permissions
async function canSetResults(role: string): Promise<boolean> {
  try {
    const raw = await getSetting("action_permissions");
    if (!raw) return ["ADMIN", "HEAD_CREATOR", "HEAD_LEAD_CREATOR", "LEAD_CREATOR"].includes(role);
    const cfg = JSON.parse(raw) as Record<string, string[]>;
    return (cfg.set_creator_results ?? []).includes(role);
  } catch {
    return false;
  }
}

export async function creatorResultsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // GET /api/orders/:orderId/creator-results
  app.get<{ Params: { orderId: string } }>("/", async (req, reply) => {
    const { orderId } = req.params;
    const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true } });
    if (!order) return reply.status(404).send({ error: "Заказ не найден" });

    const results = await prisma.orderCreatorResult.findMany({
      where: { orderId },
      include: {
        creator:          { select: { id: true, displayName: true, role: true } },
        setBy:            { select: { id: true, displayName: true } },
        helperStoryboard: { select: { id: true, displayName: true } },
        helperAnimation:  { select: { id: true, displayName: true } },
        helperEditing:    { select: { id: true, displayName: true } },
        helperScenario:   { select: { id: true, displayName: true } },
      },
    });
    return results;
  });

  // PUT /api/orders/:orderId/creator-results/:creatorId
  app.put<{
    Params: { orderId: string; creatorId: string };
    Body: {
      didStoryboard: boolean;
      didAnimation:  boolean;
      didEditing:    boolean;
      didScenario:   boolean;
      helperStoryboardId?: string | null;
      helperAnimationId?:  string | null;
      helperEditingId?:    string | null;
      helperScenarioId?:   string | null;
    };
  }>("/:creatorId", async (req, reply) => {
    const { orderId, creatorId } = req.params;
    const currentUser = req.currentUser;

    if (!(await canSetResults(currentUser.role))) {
      return reply.status(403).send({ error: "Нет прав для выставления галочек" });
    }

    const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true } });
    if (!order) return reply.status(404).send({ error: "Заказ не найден" });

    const { didStoryboard, didAnimation, didEditing, didScenario,
            helperStoryboardId, helperAnimationId, helperEditingId, helperScenarioId } = req.body;

    const result = await prisma.orderCreatorResult.upsert({
      where: { orderId_creatorId: { orderId, creatorId } },
      update: {
        didStoryboard, didAnimation, didEditing, didScenario,
        helperStoryboardId: helperStoryboardId ?? null,
        helperAnimationId:  helperAnimationId ?? null,
        helperEditingId:    helperEditingId ?? null,
        helperScenarioId:   helperScenarioId ?? null,
        setByUserId: currentUser.id,
        setAt: new Date(),
      },
      create: {
        orderId, creatorId,
        didStoryboard, didAnimation, didEditing, didScenario,
        helperStoryboardId: helperStoryboardId ?? null,
        helperAnimationId:  helperAnimationId ?? null,
        helperEditingId:    helperEditingId ?? null,
        helperScenarioId:   helperScenarioId ?? null,
        setByUserId: currentUser.id,
        setAt: new Date(),
      },
      include: {
        creator:          { select: { id: true, displayName: true, role: true } },
        helperStoryboard: { select: { id: true, displayName: true } },
        helperAnimation:  { select: { id: true, displayName: true } },
        helperEditing:    { select: { id: true, displayName: true } },
        helperScenario:   { select: { id: true, displayName: true } },
      },
    });

    // Уведомить креатора что галочки выставлены
    try {
      const creator = await prisma.user.findUnique({ where: { id: creatorId }, select: { id: true } });
      if (creator) {
        await prisma.notification.create({
          data: {
            userId:  creatorId,
            orderId,
            type:    "CHECKBOXES_SET",
            message: `По заказу выставлены итоговые галочки`,
          },
        });
      }
    } catch { /* не критично */ }

    return result;
  });
}
