import { FastifyInstance } from "fastify";
import { OrderStatus, UserRole } from "@prisma/client";
import * as svc from "../services/order.service";
import { notifyNewOrder, notifyAssigned } from "../services/notification.service";
import { requirePermission } from "../middleware/role.middleware";
import { getSetting } from "../services/settings.service";

async function checkActionPermission(key: string, role: string): Promise<boolean> {
  try {
    const raw = await getSetting("action_permissions");
    if (!raw) return true;
    const cfg = JSON.parse(raw) as Record<string, string[]>;
    return (cfg[key] ?? []).includes(role);
  } catch { return true; }
}

export async function ordersRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // GET /api/orders
  app.get<{
    Querystring: {
      status?: OrderStatus; marketerId?: string; creatorId?: string;
      search?: string; page?: string; limit?: string; includeArchived?: string;
    };
  }>("/", async (request) => {
    return svc.getOrders({
      status: request.query.status,
      marketerId: request.query.marketerId,
      creatorId: request.query.creatorId,
      search: request.query.search,
      page: request.query.page ? parseInt(request.query.page) : undefined,
      limit: request.query.limit ? parseInt(request.query.limit) : undefined,
      includeArchived: request.query.includeArchived === "true",
    });
  });

  // GET /api/orders/:id
  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    try { return await svc.getOrderById(request.params.id); }
    catch (err: any) { return reply.status(err.statusCode || 500).send({ error: err.message }); }
  });

  // POST /api/orders
  app.post<{ Body: { title: string; description?: string; deadline?: string; reminderDays?: number } }>(
    "/",
    { preHandler: [requirePermission("create_order")] },
    async (request, reply) => {
      const { title, description, deadline, reminderDays } = request.body;
      if (!title?.trim()) return reply.status(400).send({ error: "Название обязательно" });

      const order = await svc.createOrder(
        { title: title.trim(), description, deadline, reminderDays },
        request.currentUser.id
      );
      await notifyNewOrder(order.id, order.title);
      return reply.status(201).send(order);
    }
  );

  // PUT /api/orders/:id
  app.put<{ Params: { id: string }; Body: { title?: string; description?: string; deadline?: string; reminderDays?: number; price?: number | null; hasTax?: boolean } }>(
    "/:id",
    async (request, reply) => {
      try {
        // Проверяем право на изменение цены/НДС
        const { price, hasTax, ...rest } = request.body;
        const canSetPrice = await checkActionPermission("set_order_price", request.currentUser.role);
        const canSetTax   = await checkActionPermission("set_order_tax", request.currentUser.role);
        const updateData: any = { ...rest };
        if (price !== undefined && canSetPrice) updateData.price = price;
        if (hasTax !== undefined && canSetTax)  updateData.hasTax = hasTax;
        return await svc.updateOrder(request.params.id, updateData, request.currentUser.id, request.currentUser.role as UserRole);
      } catch (err: any) { return reply.status(err.statusCode || 500).send({ error: err.message }); }
    }
  );

  // DELETE /api/orders/:id
  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    try {
      await svc.deleteOrder(request.params.id, request.currentUser.id, request.currentUser.role as UserRole);
      return { success: true };
    } catch (err: any) { return reply.status(err.statusCode || 500).send({ error: err.message }); }
  });

  // PUT /api/orders/:id/status
  app.put<{ Params: { id: string }; Body: { status: OrderStatus } }>("/:id/status", async (request, reply) => {
    if (!Object.values(OrderStatus).includes(request.body.status)) {
      return reply.status(400).send({ error: "Неверный статус" });
    }
    try {
      return await svc.updateOrderStatus(request.params.id, request.body.status, request.currentUser.id, request.currentUser.role as UserRole);
    } catch (err: any) { return reply.status(err.statusCode || 500).send({ error: err.message }); }
  });

  // PUT /api/orders/:id/archive
  app.put<{ Params: { id: string } }>("/:id/archive", async (request, reply) => {
    try { return await svc.archiveOrder(request.params.id, request.currentUser.id, request.currentUser.role as UserRole); }
    catch (err: any) { return reply.status(err.statusCode || 500).send({ error: err.message }); }
  });

  // POST /api/orders/:id/creators
  app.post<{ Params: { id: string }; Body: { creatorId: string; isLead?: boolean } }>("/:id/creators", async (request, reply) => {
    try {
      const a = await svc.addCreator(
        request.params.id, request.body.creatorId, request.currentUser.id,
        request.currentUser.role as UserRole, request.body.isLead || false
      );
      const order = await svc.getOrderById(request.params.id);
      await notifyAssigned(order.id, request.body.creatorId, order.title);
      return reply.status(201).send(a);
    } catch (err: any) { return reply.status(err.statusCode || 500).send({ error: err.message }); }
  });

  // DELETE /api/orders/:id/creators/:creatorId
  app.delete<{ Params: { id: string; creatorId: string } }>("/:id/creators/:creatorId", async (request, reply) => {
    try {
      await svc.removeCreator(request.params.id, request.params.creatorId, request.currentUser.id, request.currentUser.role as UserRole);
      return { success: true };
    } catch (err: any) { return reply.status(err.statusCode || 500).send({ error: err.message }); }
  });
}
