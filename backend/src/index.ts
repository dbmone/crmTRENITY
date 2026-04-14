import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import { config } from "./config";
import { authMiddleware } from "./middleware/auth.middleware";
import { initBucket } from "./services/file.service";
import { startScheduler } from "./services/scheduler.service";

// Routes
import { authRoutes } from "./routes/auth.routes";
import { usersRoutes } from "./routes/users.routes";
import { ordersRoutes } from "./routes/orders.routes";
import { stagesRoutes } from "./routes/stages.routes";
import { filesRoutes } from "./routes/files.routes";
import { reportsRoutes } from "./routes/reports.routes";

const app = Fastify({
  logger: {
    level: config.nodeEnv === "development" ? "info" : "warn",
    transport:
      config.nodeEnv === "development"
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
  },
});

// ==================== ПЛАГИНЫ ====================

// CORS
app.register(cors, {
  origin: [config.frontendUrl, "http://localhost:5173", "http://localhost:3000"],
  credentials: true,
});

// JWT
app.register(jwt, {
  secret: config.jwt.secret,
});

// Декоратор для удобной авторизации в роутах
app.decorate("authenticate", authMiddleware);

// Multipart для загрузки файлов (макс. 100 МБ)
app.register(multipart, {
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
});

// ==================== РОУТЫ ====================

app.register(authRoutes, { prefix: "/api/auth" });
app.register(usersRoutes, { prefix: "/api/users" });
app.register(ordersRoutes, { prefix: "/api/orders" });

// Вложенные роуты: /api/orders/:orderId/stages
app.register(
  async (instance) => {
    instance.register(stagesRoutes, { prefix: "/:orderId/stages" });
    instance.register(filesRoutes, { prefix: "/:orderId/files" });
    instance.register(reportsRoutes, { prefix: "/:orderId/reports" });
  },
  { prefix: "/api/orders" }
);

// Роут скачивания файлов (вне контекста заказа)
app.register(
  async (instance) => {
    instance.addHook("preHandler", authMiddleware);

    instance.get<{ Params: { fileId: string } }>(
      "/:fileId/download",
      async (request, reply) => {
        const { getDownloadUrl } = await import("./services/file.service");
        try {
          const url = await getDownloadUrl(request.params.fileId);
          return { url };
        } catch (err: any) {
          return reply
            .status(err.statusCode || 500)
            .send({ error: err.message });
        }
      }
    );
  },
  { prefix: "/api/files" }
);

// Health check
app.get("/api/health", async () => ({
  status: "ok",
  timestamp: new Date().toISOString(),
  version: "1.0.0",
}));

// ==================== ТИПЫ ДЛЯ FASTIFY ====================

declare module "fastify" {
  interface FastifyInstance {
    authenticate: typeof authMiddleware;
  }
}

// ==================== ЗАПУСК ====================

async function start() {
  try {
    // Инициализация MinIO бакета
    try {
      await initBucket();
      console.log("✅ MinIO connected");
    } catch (err) {
      console.warn("⚠️  MinIO not available, file uploads disabled:", (err as Error).message);
    }

    // Запуск планировщика уведомлений
    startScheduler();

    // Запуск сервера
    await app.listen({ port: config.port, host: config.host });
    console.log(`🚀 Server running at http://${config.host}:${config.port}`);
    console.log(`📋 API docs: http://localhost:${config.port}/api/health`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
