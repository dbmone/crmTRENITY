import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";

// BigInt не сериализуется в JSON стандартно — конвертируем в строку
(BigInt.prototype as any).toJSON = function () { return this.toString(); };
import { config } from "./config";
import { authMiddleware } from "./middleware/auth.middleware";
import { initBucket } from "./services/file.service";
import { startScheduler } from "./services/scheduler.service";

import { authRoutes } from "./routes/auth.routes";
import { usersRoutes } from "./routes/users.routes";
import { ordersRoutes } from "./routes/orders.routes";
import { stagesRoutes } from "./routes/stages.routes";
import { filesRoutes, filesGlobalRoutes } from "./routes/files.routes";
import { reportsRoutes } from "./routes/reports.routes";
import { commentsRoutes } from "./routes/comments.routes";
import { notificationsRoutes } from "./routes/notifications.routes";
import { dashboardRoutes } from "./routes/dashboard.routes";

const app = Fastify({
  logger: {
    level: config.nodeEnv === "development" ? "info" : "warn",
    transport: config.nodeEnv === "development"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
  },
});

// ==================== ПЛАГИНЫ ====================

app.register(cors, {
  origin: [config.frontendUrl, "http://localhost:5173", "http://localhost:3000"],
  credentials: true,
});

app.register(jwt, { secret: config.jwt.secret });
app.decorate("authenticate", authMiddleware);
app.register(multipart, { limits: { fileSize: 100 * 1024 * 1024 } });

// ==================== РОУТЫ ====================

app.register(authRoutes, { prefix: "/api/auth" });
app.register(usersRoutes, { prefix: "/api/users" });
app.register(ordersRoutes, { prefix: "/api/orders" });
app.register(notificationsRoutes, { prefix: "/api/notifications" });
app.register(dashboardRoutes, { prefix: "/api/dashboard" });
app.register(filesGlobalRoutes, { prefix: "/api/files" });

// Вложенные под /api/orders/:orderId/
app.register(async (instance) => {
  instance.register(stagesRoutes, { prefix: "/:orderId/stages" });
  instance.register(filesRoutes, { prefix: "/:orderId/files" });
  instance.register(reportsRoutes, { prefix: "/:orderId/reports" });
  instance.register(commentsRoutes, { prefix: "/:orderId/comments" });
}, { prefix: "/api/orders" });

// Health check
app.get("/api/health", async () => ({
  status: "ok",
  timestamp: new Date().toISOString(),
  version: "2.0.0",
  name: "TRENITY CRM",
}));

// ==================== ТИПЫ ====================

declare module "fastify" {
  interface FastifyInstance {
    authenticate: typeof authMiddleware;
  }
}

// ==================== ЗАПУСК ====================

async function start() {
  try {
    try {
      await initBucket();
      console.log("✅ MinIO connected");
    } catch (err) {
      console.warn("⚠️  MinIO unavailable:", (err as Error).message);
    }

    startScheduler();

    await app.listen({ port: config.port, host: config.host });
    console.log(`\n🚀 TRENITY CRM API v2.0`);
    console.log(`   http://localhost:${config.port}/api/health`);
    console.log(`   CLI: npm run admin -- <password> <command>\n`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
