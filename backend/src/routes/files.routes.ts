import { FastifyInstance } from "fastify";
import { FileType, UserRole } from "@prisma/client";
import { uploadFile, getDownloadUrl, deleteFile, getOrderFiles } from "../services/file.service";

export async function filesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get<{ Params: { orderId: string } }>("/", async (req) => getOrderFiles(req.params.orderId));

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

    if (buffer.length > 100 * 1024 * 1024) {
      return reply.status(413).send({ error: "Макс. 100 МБ" });
    }

    try {
      const file = await uploadFile(req.params.orderId, req.currentUser.id, fileType, data.filename, buffer, data.mimetype);
      return reply.status(201).send(file);
    } catch (err: any) { return reply.status(err.statusCode || 500).send({ error: err.message }); }
  });
}

export async function filesGlobalRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get<{ Params: { fileId: string } }>("/:fileId/download", async (req, reply) => {
    try { return { url: await getDownloadUrl(req.params.fileId) }; }
    catch (err: any) { return reply.status(err.statusCode || 500).send({ error: err.message }); }
  });

  app.delete<{ Params: { fileId: string } }>("/:fileId", async (req, reply) => {
    try { return await deleteFile(req.params.fileId, req.currentUser.id, req.currentUser.role as UserRole); }
    catch (err: any) { return reply.status(err.statusCode || 500).send({ error: err.message }); }
  });
}
