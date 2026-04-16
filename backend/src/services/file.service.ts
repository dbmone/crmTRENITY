import { PrismaClient, FileType, UserRole } from "@prisma/client";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config";
import { randomUUID } from "crypto";
import { uploadFileToStorage, forwardFileToUser } from "./telegram.service";

const prisma = new PrismaClient();

// ─── S3/MinIO client ─────────────────────────────────────────────────────────

let s3Client: S3Client | null = null;

function buildEndpoint(): string {
  const raw = config.minio.endPoint.trim();
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  const proto = config.minio.useSSL ? "https" : "http";
  return `${proto}://${raw}:${config.minio.port}`;
}

function getS3Client(): S3Client {
  if (!s3Client) {
    const endpoint = buildEndpoint();
    const isSupabase = endpoint.includes("supabase.co");
    const region = isSupabase ? "auto" : (config.minio.region || "us-east-1");

    s3Client = new S3Client({
      endpoint,
      region,
      credentials: {
        accessKeyId:     config.minio.accessKey,
        secretAccessKey: config.minio.secretKey,
      },
      forcePathStyle: true,
    });
  }
  return s3Client;
}

export async function initBucket() {
  if (config.bot.useAsTFileStorage) {
    console.log("📱 Using Telegram as file storage — S3 bucket init skipped");
    return;
  }
  const client = getS3Client();
  const bucket  = config.minio.bucket;

  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (err: any) {
    if (err.name === "NoSuchBucket" || err.$metadata?.httpStatusCode === 404) {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
      console.log(`✅ S3 bucket "${bucket}" created`);
    } else {
      console.warn(`⚠️  Bucket check skipped: ${err.message}`);
    }
  }
}

// ─── UPLOAD ─────────────────────────────────────────────────────────────────

export async function uploadFile(
  orderId: string,
  uploadedById: string,
  fileType: FileType,
  fileName: string,
  fileBuffer: Buffer,
  mimeType: string
) {
  // Используем Telegram как хранилище если настроено
  if (config.bot.useAsTFileStorage && config.bot.storageChatId) {
    return uploadFileViaTelegram(orderId, uploadedById, fileType, fileName, fileBuffer, mimeType);
  }
  return uploadFileViaS3(orderId, uploadedById, fileType, fileName, fileBuffer, mimeType);
}

async function uploadFileViaTelegram(
  orderId: string,
  uploadedById: string,
  fileType: FileType,
  fileName: string,
  fileBuffer: Buffer,
  mimeType: string
) {
  if (fileBuffer.length > 50 * 1024 * 1024) {
    throw { statusCode: 413, message: "Telegram поддерживает файлы до 50 МБ через сайт. Загрузите файл через Telegram-бот." };
  }

  const caption = `📁 ${fileName}\n🗂 Заказ: ${orderId}\n👤 ${uploadedById}`;
  const tg = await uploadFileToStorage(fileBuffer, fileName, mimeType, caption);

  return prisma.orderFile.create({
    data: {
      orderId,
      uploadedById,
      fileType,
      fileName,
      fileSize:       BigInt(fileBuffer.length),
      mimeType,
      storagePath:    "",            // пустой — файл в TG
      telegramFileId: tg.fileId,
      telegramChatId: tg.chatId,
      telegramMsgId:  tg.messageId,
    },
    include: {
      uploadedBy: { select: { id: true, displayName: true, telegramUsername: true } },
    },
  });
}

async function uploadFileViaS3(
  orderId: string,
  uploadedById: string,
  fileType: FileType,
  fileName: string,
  fileBuffer: Buffer,
  mimeType: string
) {
  const client = getS3Client();
  const ext = fileName.split(".").pop() || "bin";
  const storagePath = `orders/${orderId}/${randomUUID()}.${ext}`;

  await client.send(new PutObjectCommand({
    Bucket: config.minio.bucket,
    Key:    storagePath,
    Body:   fileBuffer,
    ContentType: mimeType,
    Metadata: { "original-name": encodeURIComponent(fileName) },
  }));

  return prisma.orderFile.create({
    data: { orderId, uploadedById, fileType, fileName, fileSize: BigInt(fileBuffer.length), mimeType, storagePath },
    include: {
      uploadedBy: { select: { id: true, displayName: true, telegramUsername: true } },
    },
  });
}

// ─── DOWNLOAD / SEND ─────────────────────────────────────────────────────────

export async function getDownloadUrl(fileId: string): Promise<string> {
  const file = await prisma.orderFile.findUnique({ where: { id: fileId } });
  if (!file) throw { statusCode: 404, message: "Файл не найден" };
  if (file.telegramFileId) throw { statusCode: 400, message: "TG_FILE" }; // нужна sendToTelegram

  const client = getS3Client();
  const command = new GetObjectCommand({ Bucket: config.minio.bucket, Key: file.storagePath });
  return getSignedUrl(client, command, { expiresIn: 3600 });
}

// Отправить файл пользователю в Telegram
export async function sendFileToUserTelegram(fileId: string, userId: string): Promise<void> {
  const file = await prisma.orderFile.findUnique({
    where: { id: fileId },
    include: {
      order:      { select: { title: true } },
      uploadedBy: { select: { displayName: true, telegramUsername: true } },
    },
  });
  if (!file) throw { statusCode: 404, message: "Файл не найден" };

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.chatId) {
    throw { statusCode: 400, message: "Чат с ботом не найден. Напишите боту /start." };
  }

  const orderTitle   = (file as any).order?.title || file.orderId;
  const uploaderName = (file as any).uploadedBy?.displayName
    || (file as any).uploadedBy?.telegramUsername
    || "неизвестно";

  const { sendMessageToUser } = await import("./telegram.service");

  if (file.mimeType === "text/plain" && !file.telegramChatId && !file.telegramMsgId) {
    // Текстовая заметка ТЗ, добавленная с сайта — шлём текстом
    await sendMessageToUser(
      user.chatId.toString(),
      `📋 Заказ: *${orderTitle}*\n👤 От: ${uploaderName}\n\n${file.fileName}`
    );
    return;
  }

  if (file.telegramChatId && file.telegramMsgId) {
    // Файл в TG-хранилище — сначала подпись, потом сам файл
    const isText = file.mimeType === "text/plain";
    if (!isText) {
      await sendMessageToUser(
        user.chatId.toString(),
        `📋 Заказ: *${orderTitle}*\n👤 От: ${uploaderName}\n📎 ${file.fileName}`
      );
    }
    await forwardFileToUser(user.chatId.toString(), file.telegramChatId, file.telegramMsgId);
  } else if (file.storagePath) {
    // Файл в S3 — шлём presigned-ссылку
    const client = getS3Client();
    const command = new GetObjectCommand({ Bucket: config.minio.bucket, Key: file.storagePath });
    const presigned = await getSignedUrl(client, command, { expiresIn: 300 });
    await sendMessageToUser(
      user.chatId.toString(),
      `📋 Заказ: *${orderTitle}*\n👤 От: ${uploaderName}\n📎 *${file.fileName}*\n\nСкачать: [ссылка](${presigned})\n_Ссылка действует 5 минут_`
    );
  } else {
    throw { statusCode: 500, message: "Файл недоступен" };
  }
}

// ─── DELETE ──────────────────────────────────────────────────────────────────

export async function deleteFile(fileId: string, userId: string, userRole: UserRole) {
  const file = await prisma.orderFile.findUnique({ where: { id: fileId } });
  if (!file) throw { statusCode: 404, message: "Файл не найден" };
  if (userRole !== UserRole.ADMIN && file.uploadedById !== userId) {
    throw { statusCode: 403, message: "Вы можете удалять только свои файлы" };
  }

  // Удаляем из S3 только если файл там хранится
  if (file.storagePath && !file.telegramFileId) {
    const client = getS3Client();
    await client.send(new DeleteObjectCommand({ Bucket: config.minio.bucket, Key: file.storagePath }));
  }

  await prisma.orderFile.delete({ where: { id: file.id } });
  return { success: true };
}

export async function getOrderFiles(orderId: string) {
  return prisma.orderFile.findMany({
    where: { orderId },
    include: { uploadedBy: { select: { id: true, displayName: true, telegramUsername: true } } },
    orderBy: { uploadedAt: "desc" },
  });
}

// Создать запись файла из TG (бот загрузил напрямую)
export async function createTelegramFile(
  orderId: string,
  uploadedById: string,
  fileType: FileType,
  fileName: string,
  fileSize: number,
  mimeType: string,
  telegramFileId: string,
  telegramChatId: string,
  telegramMsgId: number
) {
  return prisma.orderFile.create({
    data: {
      orderId, uploadedById, fileType, fileName,
      fileSize: BigInt(fileSize), mimeType, storagePath: "",
      telegramFileId, telegramChatId, telegramMsgId,
    },
    include: {
      uploadedBy: { select: { id: true, displayName: true, telegramUsername: true } },
    },
  });
}

// Добавить текстовую заметку к ТЗ (без TG-хранилища, только в БД)
export async function addTzTextNote(orderId: string, uploadedById: string, text: string) {
  return prisma.orderFile.create({
    data: {
      orderId,
      uploadedById,
      fileType: FileType.TZ,
      fileName: text,          // текст хранится в fileName
      fileSize: BigInt(0),
      mimeType: "text/plain",
      storagePath: "",
    },
    include: {
      uploadedBy: { select: { id: true, displayName: true, telegramUsername: true } },
    },
  });
}

// Отправить всё ТЗ заказа пачкой в Telegram пользователя
export async function sendTzBundleToTelegram(orderId: string, userId: string): Promise<{ sent: number }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.chatId) {
    throw { statusCode: 400, message: "Чат с ботом не найден. Напишите боту /start." };
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { marketer: { select: { displayName: true, telegramUsername: true } } },
  });
  if (!order) throw { statusCode: 404, message: "Заказ не найден" };

  const tzFiles = await prisma.orderFile.findMany({
    where: { orderId, OR: [{ fileType: "TZ" }, { mimeType: "text/plain" }] },
    include: { uploadedBy: { select: { displayName: true, telegramUsername: true } } },
    orderBy: { uploadedAt: "asc" },
  });

  const { sendMessageToUser } = await import("./telegram.service");
  const marketerName = (order as any).marketer?.displayName
    || (order as any).marketer?.telegramUsername
    || "неизвестно";

  // Заголовочное сообщение
  const headerLines = [
    `📋 *${order.title}*`,
    `👤 Маркетолог: ${marketerName}`,
  ];
  if (order.description) headerLines.push(`\n${order.description}`);
  if (tzFiles.length > 0) headerLines.push(`\n📎 Вложений: ${tzFiles.length}`);

  await sendMessageToUser(user.chatId.toString(), headerLines.join("\n"));

  // Отправляем каждый элемент ТЗ
  let sent = 0;
  for (const file of tzFiles) {
    try {
      const uploaderName = (file as any).uploadedBy?.displayName
        || (file as any).uploadedBy?.telegramUsername || "";

      if (file.mimeType === "text/plain") {
        // Текстовая заметка
        const prefix = uploaderName ? `👤 ${uploaderName}:\n` : "";
        await sendMessageToUser(user.chatId.toString(), `${prefix}${file.fileName}`);
      } else if (file.telegramChatId && file.telegramMsgId) {
        // Файл из TG-хранилища
        if (uploaderName) {
          await sendMessageToUser(user.chatId.toString(), `👤 ${uploaderName}: 📎 ${file.fileName}`);
        }
        await forwardFileToUser(user.chatId.toString(), file.telegramChatId, file.telegramMsgId);
      }
      sent++;
    } catch {}
  }

  return { sent };
}

export async function cleanupArchivedFiles(): Promise<{ deleted: number; freedBytes: bigint }> {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const archivedOrders = await prisma.order.findMany({
    where: { status: "ARCHIVED", updatedAt: { lt: cutoff } },
    select: { id: true },
  });
  if (archivedOrders.length === 0) return { deleted: 0, freedBytes: BigInt(0) };

  const orderIds = archivedOrders.map((o) => o.id);
  const files = await prisma.orderFile.findMany({
    where: { orderId: { in: orderIds } },
    select: { id: true, storagePath: true, fileSize: true, telegramFileId: true },
  });
  if (files.length === 0) return { deleted: 0, freedBytes: BigInt(0) };

  const client = getS3Client();
  let deleted = 0;
  let freedBytes = BigInt(0);

  for (const file of files) {
    try {
      // Удаляем из S3 только если не TG-файл
      if (file.storagePath && !file.telegramFileId) {
        await client.send(new DeleteObjectCommand({ Bucket: config.minio.bucket, Key: file.storagePath }));
      }
      await prisma.orderFile.delete({ where: { id: file.id } });
      deleted++;
      freedBytes += file.fileSize;
    } catch (err: any) {
      if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
        await prisma.orderFile.delete({ where: { id: file.id } });
        deleted++;
      } else {
        console.error(`Cleanup failed for file ${file.id}:`, err.message);
      }
    }
  }

  return { deleted, freedBytes };
}
