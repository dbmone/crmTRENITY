import dotenv from "dotenv";
dotenv.config({ path: "../.env" });

// Fallback: also try local .env
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "3000"),
  host: process.env.HOST || "0.0.0.0",
  nodeEnv: process.env.NODE_ENV || "development",

  jwt: {
    secret: process.env.JWT_SECRET || "dev-secret-change-me",
    expiresIn: "7d",
  },

  minio: {
    endPoint:  process.env.MINIO_ENDPOINT || "localhost",
    port:      parseInt(process.env.MINIO_PORT || "9000"),
    accessKey: process.env.MINIO_USER || "minioadmin",
    secretKey: process.env.MINIO_PASSWORD || "minioadmin",
    bucket:    process.env.MINIO_BUCKET || "crm-files",
    region:    process.env.MINIO_REGION || "us-east-1",
    useSSL:    false,
  },

  bot: {
    token: process.env.BOT_TOKEN || "",
    // ID приватного канала/группы-хранилища для файлов
    storageChatId: process.env.TELEGRAM_STORAGE_CHAT_ID || "",
    // Если true — файлы хранятся в Telegram вместо S3
    useAsTFileStorage: process.env.USE_TELEGRAM_STORAGE === "true",
    proxyUrl: process.env.TELEGRAM_PROXY_URL || "",
    username: (process.env.BOT_USERNAME || "").replace(/^@/, ""),
    apiBaseUrl: process.env.TELEGRAM_BOT_API_BASE_URL || "https://api.telegram.org",
  },

  telegramUserbot: {
    apiId: parseInt(process.env.TELEGRAM_USERBOT_API_ID || "0"),
    apiHash: process.env.TELEGRAM_USERBOT_API_HASH || "",
    session: process.env.TELEGRAM_USERBOT_SESSION || "",
    phone: process.env.TELEGRAM_USERBOT_PHONE || "",
  },

  admin: {
    password: process.env.ADMIN_PASSWORD || "qwaszx12\\",
  },

  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
};
