import { FastifyInstance } from "fastify";
import { FileType, UserRole } from "@prisma/client";
import { uploadFile, getDownloadUrl, deleteFile, getOrderFiles, sendFileToUserTelegram, addTzTextNote } from "../services/file.service";
import { config } from "../config";

export async function filesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get<{ Params: { orderId: string } }>("/", async (req) => getOrderFiles(req.params.orderId));

  // Добавить текстовую заметку к ТЗ (с сайта)
  app.post<{ Params: { orderId: string }; Body: { text: string } }>("/tz-note", async (req, reply) => {
    const { text } = req.body;
    if (!text?.trim()) return reply.status(400).send({ error: "Текст не может быть пустым" });
    try {
      const file = await addTzTextNote(req.params.orderId, req.currentUser.id, text.trim());
      return reply.status(201).send(file);
    } catch (err: any) { return reply.status(err.statusCode || 500).send({ error: err.message }); }
  });

  // STT-заглушка: расшифровка голосового сообщения в текст
  // TODO: подключить реальный STT (см. CLAUDE.md раздел LLM/STT)
  app.post<{ Params: { orderId: string } }>("/tz-transcribe", async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: "Аудиофайл не прикреплён" });
    const chunks: Buffer[] = [];
    for await (const chunk of data.file) chunks.push(chunk);
    // TODO: отправить chunks в Whisper API / Vosk / Yandex SpeechKit
    // Пример: const text = await transcribeAudio(Buffer.concat(chunks), "ru");
    return reply.status(501).send({
      error: "STT_NOT_CONFIGURED",
      message: "Расшифровка голоса не настроена. Добавьте WHISPER_API_KEY в переменные окружения.",
      hint: "Рекомендуется: OpenAI Whisper API (хорошая поддержка русского) или Yandex SpeechKit"
    });
  });

  app.post<{ Params: { orderId: string } }>("/", async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: "Файл не прикреплён" });

    const fileTypeField = data.fields?.fileType;
    let fileType: FileType = FileType.OTHER;
    if (fileTypeField && "value" in fileTypeField) {
      const val = fileTypeField.value as string;
      if (Object.values(FileType).includes(val as FileType)) fileType = val as FileType;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of data.file) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

    const maxSize = config.bot.useAsTFileStorage ? 50 * 1024 * 1024 : 100 * 1024 * 1024;
    if (buffer.length > maxSize) {
      return reply.status(413).send({
        error: config.bot.useAsTFileStorage
          ? "Максимальный размер файла через сайт — 50 МБ. Большие файлы загружайте через Telegram-бот."
          : "Макс. 100 МБ"
      });
    }

    try {
      const file = await uploadFile(req.params.orderId, req.currentUser.id, fileType, data.filename, buffer, data.mimetype);
      return reply.status(201).send(file);
    } catch (err: any) { return reply.status(err.statusCode || 500).send({ error: err.message }); }
  });
}

export async function filesGlobalRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // Получить ссылку для скачивания (S3)
  app.get<{ Params: { fileId: string } }>("/:fileId/download", async (req, reply) => {
    try {
      const url = await getDownloadUrl(req.params.fileId);
      return { url };
    } catch (err: any) {
      if (err.message === "TG_FILE") {
        return reply.status(400).send({ error: "TG_FILE", message: "Этот файл хранится в Telegram. Используйте кнопку отправки в TG." });
      }
      return reply.status(err.statusCode || 500).send({ error: err.message });
    }
  });

  // Отправить файл пользователю в Telegram
  app.post<{ Params: { fileId: string } }>("/:fileId/send-to-tg", async (req, reply) => {
    try {
      await sendFileToUserTelegram(req.params.fileId, req.currentUser.id);
      return { success: true, message: "Файл отправлен в ваш Telegram!" };
    } catch (err: any) { return reply.status(err.statusCode || 500).send({ error: err.message }); }
  });

  app.delete<{ Params: { fileId: string } }>("/:fileId", async (req, reply) => {
    try { return await deleteFile(req.params.fileId, req.currentUser.id, req.currentUser.role as UserRole); }
    catch (err: any) { return reply.status(err.statusCode || 500).send({ error: err.message }); }
  });
}
