import { FastifyInstance } from "fastify";
import { StageStatus, UserRole } from "@prisma/client";
import { getStages, updateStage } from "../services/stage.service";
import { getOrderById } from "../services/order.service";
import { notifyStageChanged, notifyReviewRequest, notifyOrderApproved } from "../services/notification.service";

const STAGE_NAMES: Record<string, string> = {
  STORYBOARD: "Раскадровка", ANIMATION: "Анимация", EDITING: "Монтаж",
  REVIEW: "На правках", COMPLETED: "Видео готово",
};

export async function stagesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get<{ Params: { orderId: string } }>("/", async (req) => getStages(req.params.orderId));

  app.put<{ Params: { orderId: string; stageId: string }; Body: { status: StageStatus } }>("/:stageId", async (req, reply) => {
    if (!Object.values(StageStatus).includes(req.body.status)) {
      return reply.status(400).send({ error: "Неверный статус" });
    }
    try {
      const updated = await updateStage(req.params.orderId, req.params.stageId, req.body.status, req.currentUser.id, req.currentUser.role as UserRole);
      const order = await getOrderById(req.params.orderId);
      const recipients = [order.marketerId, ...order.creators.map((c: any) => c.creator.id)].filter((id) => id !== req.currentUser.id);

      await notifyStageChanged(order.id, order.title, STAGE_NAMES[updated.name] || updated.name, [...new Set(recipients)]);

      if (updated.name === "REVIEW" && req.body.status === StageStatus.IN_PROGRESS) {
        await notifyReviewRequest(order.id, order.title, order.marketerId);
        const lead = order.creators.find((c: any) => c.isLead);
        if (lead) await notifyReviewRequest(order.id, order.title, lead.creator.id);
      }
      if (updated.name === "COMPLETED" && req.body.status === StageStatus.DONE) {
        await notifyOrderApproved(order.id, order.title, order.creators.map((c: any) => c.creator.id));
      }
      return updated;
    } catch (err: any) { return reply.status(err.statusCode || 500).send({ error: err.message }); }
  });
}
