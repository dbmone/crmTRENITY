import { FastifyInstance } from "fastify";
import { OrderStatus, UserRole } from "@prisma/client";
import {
  getOrders,
  getOrderById,
  createOrder,
  updateOrder,
  deleteOrder,
  updateOrderStatus,
  addCreator,
  removeCreator,
} from "../services/order.service";
import {
  notifyNewOrder,
  notifyAssigned,
} from "../services/notification.service";
import { requireRole } from "../middleware/role.middleware";

export async function ordersRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // GET /api/orders — список заказов с фильтрами
  app.get<{
    Querystring: {
      status?: OrderStatus;
      marketerId?: string;
      creatorId?: string;
    };
  }>("/", async (request) => {
    return getOrders({
      status: request.query.status,
      marketerId: request.query.marketerId,
      creatorId: request.query.creatorId,
    });
  });

  // GET /api/orders/:id — детали заказа
  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    try {
      return await getOrderById(request.params.id);
    } catch (err: any) {
      return reply.status(err.statusCode || 500).send({ error: err.message });
    }
  });

  // POST /api/orders — создать заказ (только маркетолог / админ)
  app.post<{
    Body: {
      title: string;
      description?: string;
      deadline?: string;
      reminderDays?: number;
    };
  }>(
    "/",
    {
      preHandler: [requireRole(UserRole.MARKETER, UserRole.ADMIN)],
    },
    async (request, reply) => {
      const { title, description, deadline, reminderDays } = request.body;

      if (!title || title.trim().length === 0) {
        return reply.status(400).send({ error: "Название заказа обязательно" });
      }

      const order = await createOrder(
        { title: title.trim(), description, deadline, reminderDays },
        request.currentUser.id
      );

      // Уведомляем креаторов о новом заказе
      await notifyNewOrder(order.id, order.title);

      return reply.status(201).send(order);
    }
  );

  // PUT /api/orders/:id — обновить заказ
  app.put<{
    Params: { id: string };
    Body: {
      title?: string;
      description?: string;
      deadline?: string;
      reminderDays?: number;
    };
  }>("/:id", async (request, reply) => {
    try {
      return await updateOrder(
        request.params.id,
        request.body,
        request.currentUser.id,
        request.currentUser.role as UserRole
      );
    } catch (err: any) {
      return reply.status(err.statusCode || 500).send({ error: err.message });
    }
  });

  // DELETE /api/orders/:id — удалить заказ
  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    try {
      await deleteOrder(
        request.params.id,
        request.currentUser.id,
        request.currentUser.role as UserRole
      );
      return { success: true };
    } catch (err: any) {
      return reply.status(err.statusCode || 500).send({ error: err.message });
    }
  });

  // PUT /api/orders/:id/status — сменить статус (канбан drag & drop)
  app.put<{
    Params: { id: string };
    Body: { status: OrderStatus };
  }>("/:id/status", async (request, reply) => {
    const { status } = request.body;

    if (!Object.values(OrderStatus).includes(status)) {
      return reply.status(400).send({ error: "Неверный статус" });
    }

    try {
      return await updateOrderStatus(
        request.params.id,
        status,
        request.currentUser.id,
        request.currentUser.role as UserRole
      );
    } catch (err: any) {
      return reply.status(err.statusCode || 500).send({ error: err.message });
    }
  });

  // ==================== КРЕАТОРЫ НА ЗАКАЗЕ ====================

  // POST /api/orders/:id/creators — добавить креатора
  app.post<{
    Params: { id: string };
    Body: { creatorId: string; isLead?: boolean };
  }>("/:id/creators", async (request, reply) => {
    const { creatorId, isLead } = request.body;

    if (!creatorId) {
      return reply.status(400).send({ error: "creatorId обязателен" });
    }

    try {
      const assignment = await addCreator(
        request.params.id,
        creatorId,
        request.currentUser.id,
        request.currentUser.role as UserRole,
        isLead || false
      );

      // Уведомляем креатора
      const order = await getOrderById(request.params.id);
      await notifyAssigned(order.id, creatorId, order.title);

      return reply.status(201).send(assignment);
    } catch (err: any) {
      return reply.status(err.statusCode || 500).send({ error: err.message });
    }
  });

  // DELETE /api/orders/:id/creators/:creatorId — удалить креатора
  app.delete<{
    Params: { id: string; creatorId: string };
  }>("/:id/creators/:creatorId", async (request, reply) => {
    try {
      await removeCreator(
        request.params.id,
        request.params.creatorId,
        request.currentUser.id,
        request.currentUser.role as UserRole
      );
      return { success: true };
    } catch (err: any) {
      return reply.status(err.statusCode || 500).send({ error: err.message });
    }
  });
}
