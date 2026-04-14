import { FastifyInstance } from "fastify";
import { FileType, UserRole } from "@prisma/client";
import {
  uploadFile,
  getDownloadUrl,
  deleteFile,
  getOrderFiles,
} from "../services/file.service";

export async function filesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // GET /api/orders/:orderId/files — список файлов заказа
  app.get<{ Params: { orderId: string } }>(
    "/",
    async (request) => {
      return getOrderFiles(request.params.orderId);
    }
  );

  // POST /api/orders/:orderId/files — загрузить файл
  app.post<{
    Params: { orderId: string };
  }>(
    "/",
    async (request, reply) => {
      const data = await request.file();

      if (!data) {
        return reply.status(400).send({ error: "Файл не прикреплён" });
      }

      // Получаем fileType из полей формы
      const fileTypeField = data.fields?.fileType;
      let fileType: FileType = FileType.OTHER;

      if (fileTypeField && "value" in fileTypeField) {
        const val = fileTypeField.value as string;
        if (Object.values(FileType).includes(val as FileType)) {
          fileType = val as FileType;
        }
      }

      // Читаем файл в буфер
      const chunks: Buffer[] = [];
      for await (const chunk of data.file) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      // Лимит 100 МБ
      if (buffer.length > 100 * 1024 * 1024) {
        return reply
          .status(413)
          .send({ error: "Файл слишком большой (макс. 100 МБ)" });
      }

      try {
        const file = await uploadFile(
          request.params.orderId,
          request.currentUser.id,
          fileType,
          data.filename,
          buffer,
          data.mimetype
        );

        return reply.status(201).send(file);
      } catch (err: any) {
        return reply
          .status(err.statusCode || 500)
          .send({ error: err.message });
      }
    }
  );

  // GET /api/files/:fileId/download — скачать файл (presigned URL)
  app.get<{ Params: { fileId: string } }>(
    "/download/:fileId",
    async (request, reply) => {
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

  // DELETE /api/files/:fileId — удалить файл
  app.delete<{ Params: { fileId: string } }>(
    "/:fileId",
    async (request, reply) => {
      try {
        return await deleteFile(
          request.params.fileId,
          request.currentUser.id,
          request.currentUser.role as UserRole
        );
      } catch (err: any) {
        return reply
          .status(err.statusCode || 500)
          .send({ error: err.message });
      }
    }
  );
}
