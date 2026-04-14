import { FastifyInstance } from "fastify";
import { getUserNotifications, markAsRead, markAllAsRead } from "../services/notification.service";

export async function notificationsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // GET /api/notifications — лента уведомлений
  app.get<{ Querystring: { page?: string; limit?: string } }>("/", async (req) => {
    return getUserNotifications(
      req.currentUser.id,
      req.query.page ? parseInt(req.query.page) : 1,
      req.query.limit ? parseInt(req.query.limit) : 20
    );
  });

  // PUT /api/notifications/:id/read
  app.put<{ Params: { id: string } }>("/:id/read", async (req) => {
    return markAsRead(req.params.id, req.currentUser.id);
  });

  // PUT /api/notifications/read-all
  app.put("/read-all", async (req) => {
    await markAllAsRead(req.currentUser.id);
    return { success: true };
  });
}
