import { FileType, UserRole } from "@prisma/client";
import { FastifyInstance } from "fastify";
import { config } from "../config";
import {
  addTzTextNote,
  deleteFile,
  getDownloadUrl,
  getFileContentStream,
  getOrderFiles,
  sendFileToUserTelegram,
  sendTzBundleToTelegram,
  uploadFile,
} from "../services/file.service";
import { transcribeAudio } from "../services/stt.service";
import { structureToTz } from "../services/task.service";

const FILE_TYPE_ALIASES: Record<string, FileType> = {
  TZ: FileType.TZ,
  CONTRACT: FileType.CONTRACT,
  STORYBOARD: FileType.STORYBOARD,
  VIDEO: FileType.VIDEO_FINAL,
  VIDEO_DRAFT: FileType.VIDEO_DRAFT,
  VIDEO_FINAL: FileType.VIDEO_FINAL,
  OTHER: FileType.OTHER,
};

function normalizeFileType(raw?: string): FileType {
  if (!raw) return FileType.OTHER;
  const normalized = raw.trim().toUpperCase();
  return FILE_TYPE_ALIASES[normalized] ?? FileType.OTHER;
}

export async function filesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get<{ Params: { orderId: string } }>("/", async (req) => getOrderFiles(req.params.orderId));

  app.post<{ Params: { orderId: string } }>("/tz-to-tg", async (req, reply) => {
    try {
      const result = await sendTzBundleToTelegram(req.params.orderId, req.currentUser.id);
      return { success: true, sent: result.sent };
    } catch (err: any) {
      return reply.status(err.statusCode || 500).send({ error: err.message });
    }
  });

  app.post<{ Params: { orderId: string }; Body: { text: string } }>("/tz-note", async (req, reply) => {
    const { text } = req.body;
    if (!text?.trim()) return reply.status(400).send({ error: "Текст не может быть пустым" });

    try {
      const file = await addTzTextNote(req.params.orderId, req.currentUser.id, text.trim());
      return reply.status(201).send(file);
    } catch (err: any) {
      return reply.status(err.statusCode || 500).send({ error: err.message });
    }
  });

  app.post<{ Params: { orderId: string } }>("/tz-voice-structure", async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: "Аудиофайл не прикреплён" });

    const chunks: Buffer[] = [];
    for await (const chunk of data.file) chunks.push(chunk);

    try {
      const rawText = await transcribeAudio(Buffer.concat(chunks), data.filename || "voice.ogg");
      const text = await structureToTz(rawText);
      return { text, rawText };
    } catch (err: any) {
      return reply.status(err.statusCode || 500).send({ error: err.message });
    }
  });

  app.post<{ Params: { orderId: string } }>("/tz-transcribe", async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: "Аудиофайл не прикреплён" });

    const chunks: Buffer[] = [];
    for await (const chunk of data.file) chunks.push(chunk);

    try {
      const text = await transcribeAudio(Buffer.concat(chunks), data.filename || "voice.ogg");
      return reply.status(200).send({ text });
    } catch (err: any) {
      return reply.status(err.statusCode || 500).send({ error: err.message });
    }
  });

  app.post<{ Params: { orderId: string } }>("/", async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: "Файл не прикреплён" });

    const fileTypeField = data.fields?.fileType;
    const fileType =
      fileTypeField && "value" in fileTypeField
        ? normalizeFileType(fileTypeField.value as string)
        : FileType.OTHER;

    const chunks: Buffer[] = [];
    for await (const chunk of data.file) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

    try {
      const file = await uploadFile(
        req.params.orderId,
        req.currentUser.id,
        fileType,
        data.filename,
        buffer,
        data.mimetype
      );
      return reply.status(201).send(file);
    } catch (err: any) {
      return reply.status(err.statusCode || 500).send({ error: err.message });
    }
  });
}

export async function filesGlobalRoutes(app: FastifyInstance) {
  // ── Streaming endpoint для видео/аудио (без addHook — своя auth через query token) ──
  app.get<{ Params: { fileId: string }; Querystring: { token?: string } }>(
    "/:fileId/stream",
    { preHandler: [] },          // override — не применяем app.authenticate
    async (req, reply) => {
      // Аутентификация через query-параметр (нужно для <video src="...">)
      const token = (req.query as any).token as string | undefined;
      if (!token) return reply.status(401).send({ error: "Не авторизован" });
      try {
        const payload = await (app as any).jwt.verify(token) as { status: string };
        if (payload.status !== "APPROVED") {
          return reply.status(403).send({ error: "Доступ запрещён" });
        }
      } catch {
        return reply.status(401).send({ error: "Недействительный токен" });
      }

      try {
        const file = await getFileContentStream(req.params.fileId);
        const totalSize = file.fileSize !== null && file.fileSize !== undefined
          ? Number(file.fileSize)
          : null;

        reply.header("Content-Type", file.mimeType);
        reply.header("Accept-Ranges", "bytes");
        reply.header("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);

        const rangeHeader = req.headers.range;
        if (rangeHeader && totalSize) {
          // Парсим Range: bytes=start-end
          const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
          if (match) {
            const start = parseInt(match[1], 10);
            const end   = match[2] ? parseInt(match[2], 10) : Math.min(start + 1024 * 1024 - 1, totalSize - 1);
            const chunkSize = end - start + 1;

            reply.status(206);
            reply.header("Content-Range",  `bytes ${start}-${end}/${totalSize}`);
            reply.header("Content-Length", String(chunkSize));

            // Для TG файлов нельзя сделать partial — скачиваем весь файл и режем
            // Для S3 в идеале использовать Range-запрос к S3, но для совместимости делаем так же
            const chunks: Buffer[] = [];
            for await (const chunk of file.stream as AsyncIterable<Buffer>) {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }
            const fullBuffer = Buffer.concat(chunks);
            return reply.send(fullBuffer.slice(start, end + 1));
          }
        }

        if (totalSize) reply.header("Content-Length", String(totalSize));
        return reply.send(file.stream);
      } catch (err: any) {
        return reply.status(err.statusCode || 500).send({ error: err.message });
      }
    }
  );

  app.get<{ Params: { fileId: string } }>("/:fileId/content", { preHandler: app.authenticate }, async (req, reply) => {
    try {
      const file = await getFileContentStream(req.params.fileId);
      reply.header("Content-Type", file.mimeType);
      reply.header("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
      if (file.fileSize !== null && file.fileSize !== undefined) {
        reply.header("Content-Length", String(file.fileSize));
      }
      return reply.send(file.stream);
    } catch (err: any) {
      return reply.status(err.statusCode || 500).send({ error: err.message });
    }
  });

  app.get<{ Params: { fileId: string } }>("/:fileId/download", { preHandler: app.authenticate }, async (req, reply) => {
    try {
      const url = await getDownloadUrl(req.params.fileId);
      return { url };
    } catch (err: any) {
      if (err.message === "TG_FILE") {
        return reply.status(400).send({
          error: "TG_FILE",
          message: "Этот файл хранится в Telegram. Используйте кнопку отправки в Telegram.",
        });
      }
      return reply.status(err.statusCode || 500).send({ error: err.message });
    }
  });

  app.post<{ Params: { fileId: string } }>("/:fileId/send-to-tg", { preHandler: app.authenticate }, async (req, reply) => {
    try {
      await sendFileToUserTelegram(req.params.fileId, req.currentUser.id);
      return { success: true, message: "Файл отправлен в ваш Telegram" };
    } catch (err: any) {
      return reply.status(err.statusCode || 500).send({ error: err.message });
    }
  });

  app.delete<{ Params: { fileId: string } }>("/:fileId", { preHandler: app.authenticate }, async (req, reply) => {
    try {
      return await deleteFile(req.params.fileId, req.currentUser.id, req.currentUser.role as UserRole);
    } catch (err: any) {
      return reply.status(err.statusCode || 500).send({ error: err.message });
    }
  });
}
