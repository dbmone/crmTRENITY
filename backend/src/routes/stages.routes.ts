import { FastifyInstance } from "fastify";
import { StageStatus, UserRole } from "@prisma/client";
import { getStages, updateStage } from "../services/stage.service";
import { notifyStageChanged, notifyReviewRequest, notifyOrderApproved } from "../services/notification.service";
import { getOrderById } from "../services/order.service";

export async function stagesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // GET /api/orders/:orderId/stages — все этапы заказа
  app.get<{ Params: { orderId: string } }>(
    "/",
    async (request) => {
      return getStages(request.params.orderId);
    }
  );

  // PUT /api/orders/:orderId/stages/:stageId — обновить статус этапа
  app.put<{
    Params: { orderId: string; stageId: string };
    Body: { status: StageStatus };
  }>(
    "/:stageId",
    async (request, reply) => {
      const { orderId, stageId } = request.params;
      const { status } = request.body;

      if (!Object.values(StageStatus).includes(status)) {
        return reply.status(400).send({ error: "Неверный статус этапа" });
      }

      try {
        const updated = await updateStage(
          orderId,
          stageId,
          status,
          request.currentUser.id,
          request.currentUser.role as UserRole
        );

        // Отправляем уведомления
        const order = await getOrderById(orderId);
        const recipientIds = [
          order.marketerId,
          ...order.creators.map((c) => c.creator.id),
        ];

        // Убираем текущего пользователя из получателей
        const filtered = recipientIds.filter(
          (id) => id !== request.currentUser.id
        );

        const stageNames: Record<string, string> = {
          STORYBOARD: "Раскадровка",
          ANIMATION: "Анимация",
          EDITING: "Монтаж",
          REVIEW: "На правках",
          COMPLETED: "Видео готово",
        };

        await notifyStageChanged(
          orderId,
          order.title,
          stageNames[updated.name] || updated.name,
          filtered
        );

        // Если этап REVIEW перешёл в IN_PROGRESS — уведомляем маркетолога
        if (updated.name === "REVIEW" && status === StageStatus.IN_PROGRESS) {
          await notifyReviewRequest(orderId, order.title, order.marketerId);

          // И лид-креатора если есть
          const leadCreator = order.creators.find((c) => c.isLead);
          if (leadCreator) {
            await notifyReviewRequest(
              orderId,
              order.title,
              leadCreator.creator.id
            );
          }
        }

        // Если COMPLETED стал DONE — уведомляем всех креаторов
        if (updated.name === "COMPLETED" && status === StageStatus.DONE) {
          const creatorIds = order.creators.map((c) => c.creator.id);
          await notifyOrderApproved(orderId, order.title, creatorIds);
        }

        return updated;
      } catch (err: any) {
        return reply
          .status(err.statusCode || 500)
          .send({ error: err.message });
      }
    }
  );
}
