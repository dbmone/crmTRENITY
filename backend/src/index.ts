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
import { permissionsRoutes } from "./routes/permissions.routes";
import { loadPermissions } from "./services/permissions.service";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Применяем SQL-миграции вручную (идемпотентно, безопасно для перезапуска)
async function ensureSchema() {
  try {
    // 1. Добавить колонки к order_stages если нет
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "order_stages"
        ADD COLUMN IF NOT EXISTS "revision_round"          INTEGER   NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "awaiting_client_approval" BOOLEAN   NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "client_approval_skipped"  BOOLEAN   NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "client_approved_at"       TIMESTAMP(3)
    `);

    // 2. Удалить ВСЕ старые unique-constraints на order_stages кроме нужного
    await prisma.$executeRawUnsafe(`
      DO $$
      DECLARE cname text;
      BEGIN
        FOR cname IN
          SELECT conname FROM pg_constraint
          WHERE conrelid = 'order_stages'::regclass
            AND contype = 'u'
            AND conname != 'order_stages_order_id_name_revision_round_key'
        LOOP
          EXECUTE 'ALTER TABLE "order_stages" DROP CONSTRAINT IF EXISTS "' || cname || '"';
        END LOOP;
      END $$
    `);

    // 3. Создать новый индекс (order_id, name, revision_round) если нет
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'order_stages_order_id_name_revision_round_key'
        ) THEN
          ALTER TABLE "order_stages"
            ADD CONSTRAINT "order_stages_order_id_name_revision_round_key"
            UNIQUE ("order_id", "name", "revision_round");
        END IF;
      END $$
    `);

    // 4. Добавить колонки к order_files если нет
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "order_files"
        ADD COLUMN IF NOT EXISTS "telegram_file_id" TEXT,
        ADD COLUMN IF NOT EXISTS "telegram_chat_id"  TEXT,
        ADD COLUMN IF NOT EXISTS "telegram_msg_id"   INTEGER
    `);

    // 5. Убрать NOT NULL с storage_path чтобы TG-файлы могли иметь пустую строку
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "order_files" ALTER COLUMN "storage_path" SET DEFAULT ''
    `);

    console.log("✅ Schema migrations applied");
  } catch (err: any) {
    console.error("⚠️  Schema migration error:", err.message);
  }
}

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
app.register(permissionsRoutes, { prefix: "/api/permissions" });
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
    await ensureSchema();

    try {
      await initBucket();
      console.log("✅ MinIO connected");
    } catch (err) {
      console.warn("⚠️  MinIO unavailable:", (err as Error).message);
    }

    startScheduler();
    await loadPermissions();
    console.log("✅ Permissions loaded");

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
