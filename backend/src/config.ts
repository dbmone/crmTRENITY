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
    endPoint: process.env.MINIO_ENDPOINT || "localhost",
    port: parseInt(process.env.MINIO_PORT || "9000"),
    accessKey: process.env.MINIO_USER || "minioadmin",
    secretKey: process.env.MINIO_PASSWORD || "minioadmin",
    bucket: process.env.MINIO_BUCKET || "crm-files",
    useSSL: false,
  },

  bot: {
    token: process.env.BOT_TOKEN || "",
  },

  admin: {
    password: process.env.ADMIN_PASSWORD || "qwaszx12\\",
  },

  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
};
