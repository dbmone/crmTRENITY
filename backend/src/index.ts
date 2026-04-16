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

function maskEndpoint(value: string): string {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ""}`;
  } catch {
    return "configured";
  }
}

// Применяем SQL-миграции вручную (идемпотентно, безопасно для перезапуска)
async function runSql(label: string, sql: string) {
  try {
    await prisma.$executeRawUnsafe(sql);
    console.log(`  ✔ ${label}`);
  } catch (err: any) {
    console.error(`  ✘ ${label}: ${err.message}`);
  }
}

async function ensureSchema() {
  console.log("🔧 Applying schema migrations...");

  // 1. Колонки order_stages
  await runSql("order_stages columns", `
    ALTER TABLE "order_stages"
      ADD COLUMN IF NOT EXISTS "revision_round"           INTEGER      NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "awaiting_client_approval" BOOLEAN      NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "client_approval_skipped"  BOOLEAN      NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "client_approved_at"       TIMESTAMP(3)
  `);

  // 2. Удалить старый constraint (IF EXISTS — безопасно, не требует DO-блока)
  await runSql("drop old constraint order_stages_order_id_name_key",
    `ALTER TABLE "order_stages" DROP CONSTRAINT IF EXISTS "order_stages_order_id_name_key"`
  );

  // 2b. Удалить как индекс (на случай если остался отдельно)
  await runSql("drop old index order_stages_order_id_name_key",
    `DROP INDEX IF EXISTS "order_stages_order_id_name_key"`
  );

  // 3. Создать новый уникальный индекс (IF NOT EXISTS — идемпотентно)
  await runSql("create unique index (order_id, name, revision_round)",
    `CREATE UNIQUE INDEX IF NOT EXISTS "order_stages_order_id_name_revision_round_key"
     ON "order_stages" ("order_id", "name", "revision_round")`
  );

  // 4. Колонки order_files для TG-хранилища
  await runSql("order_files telegram columns", `
    ALTER TABLE "order_files"
      ADD COLUMN IF NOT EXISTS "telegram_file_id" TEXT,
      ADD COLUMN IF NOT EXISTS "telegram_chat_id" TEXT,
      ADD COLUMN IF NOT EXISTS "telegram_msg_id"  INTEGER
  `);

  // 5. Default для storage_path
  await runSql("order_files storage_path default", `
    ALTER TABLE "order_files" ALTER COLUMN "storage_path" SET DEFAULT ''
  `);

  console.log("✅ Schema migrations done");
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
    if (config.bot.proxyUrl && /^https?:\/\//i.test(config.bot.proxyUrl)) {
      console.log(`Telegram proxy enabled: ${maskEndpoint(config.bot.proxyUrl)}`);
    } else if (config.bot.proxyUrl) {
      console.log("Telegram proxy is set but backend supports only http/https proxy URLs");
    }
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
