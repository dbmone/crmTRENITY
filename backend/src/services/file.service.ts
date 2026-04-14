import { PrismaClient, FileType, UserRole } from "@prisma/client";
import * as Minio from "minio";
import { config } from "../config";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();
let minioClient: Minio.Client;

export function getMinioClient(): Minio.Client {
  if (!minioClient) {
    minioClient = new Minio.Client({
      endPoint: config.minio.endPoint,
      port: config.minio.port,
      useSSL: config.minio.useSSL,
      accessKey: config.minio.accessKey,
      secretKey: config.minio.secretKey,
    });
  }
  return minioClient;
}

export async function initBucket() {
  const client = getMinioClient();
  const exists = await client.bucketExists(config.minio.bucket);
  if (!exists) {
    await client.makeBucket(config.minio.bucket);
    console.log(`✅ MinIO bucket "${config.minio.bucket}" created`);
  }
}

export async function uploadFile(
  orderId: string,
  uploadedById: string,
  fileType: FileType,
  fileName: string,
  fileBuffer: Buffer,
  mimeType: string
) {
  const client = getMinioClient();
  const ext = fileName.split(".").pop() || "bin";
  const storagePath = `orders/${orderId}/${randomUUID()}.${ext}`;

  await client.putObject(config.minio.bucket, storagePath, fileBuffer, fileBuffer.length, {
    "Content-Type": mimeType,
    "X-Original-Name": encodeURIComponent(fileName),
  });

  return prisma.orderFile.create({
    data: { orderId, uploadedById, fileType, fileName, fileSize: BigInt(fileBuffer.length), mimeType, storagePath },
    include: {
      uploadedBy: { select: { id: true, displayName: true, telegramUsername: true } },
    },
  });
}

export async function getDownloadUrl(fileId: string): Promise<string> {
  const file = await prisma.orderFile.findUnique({ where: { id: fileId } });
  if (!file) throw { statusCode: 404, message: "Файл не найден" };
  const client = getMinioClient();
  return client.presignedGetObject(config.minio.bucket, file.storagePath, 3600);
}

export async function deleteFile(fileId: string, userId: string, userRole: UserRole) {
  const file = await prisma.orderFile.findUnique({ where: { id: fileId } });
  if (!file) throw { statusCode: 404, message: "Файл не найден" };
  if (userRole !== UserRole.ADMIN && file.uploadedById !== userId) {
    throw { statusCode: 403, message: "Вы можете удалять только свои файлы" };
  }
  const client = getMinioClient();
  await client.removeObject(config.minio.bucket, file.storagePath);
  await prisma.orderFile.delete({ where: { id: fileId } });
  return { success: true };
}

export async function getOrderFiles(orderId: string) {
  return prisma.orderFile.findMany({
    where: { orderId },
    include: { uploadedBy: { select: { id: true, displayName: true, telegramUsername: true } } },
    orderBy: { uploadedAt: "desc" },
  });
}
