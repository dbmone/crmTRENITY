import { FastifyInstance } from "fastify";
import {
  getTasksForUser, createTask, updateTask, deleteTask,
  addSubtask, updateSubtask, deleteSubtask, parseVoiceToTask,
} from "../services/task.service";

export async function tasksRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // GET /api/tasks
  app.get("/", async (req) => getTasksForUser(req.currentUser.id));

  // POST /api/tasks/parse-voice — STT + AI → возвращает превью (не сохраняет)
  app.post("/parse-voice", async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: "Аудиофайл не прикреплён" });
    const chunks: Buffer[] = [];
    for await (const chunk of data.file) chunks.push(chunk);
    try {
      const result = await parseVoiceToTask(Buffer.concat(chunks), data.filename || "voice.ogg");
      return result;
    } catch (err: any) {
      return reply.status(err.statusCode || 500).send({ error: err.message });
    }
  });

  // POST /api/tasks — создать задачу вручную или после AI-превью
  app.post<{ Body: {
    title: string;
    description?: string;
    priority?: string;
    dueDate?: string;
    subtasks?: string[];
    aiGenerated?: boolean;
  } }>("/", async (req, reply) => {
    if (!req.body.title?.trim()) return reply.status(400).send({ error: "Название обязательно" });
    try {
      const task = await createTask(req.currentUser.id, req.body);
      return reply.status(201).send(task);
    } catch (err: any) {
      return reply.status(err.statusCode || 500).send({ error: err.message });
    }
  });

  // PUT /api/tasks/:id — обновить поля задачи
  app.put<{ Params: { id: string }; Body: {
    title?: string; description?: string; status?: string;
    priority?: string; dueDate?: string | null;
  } }>("/:id", async (req, reply) => {
    try {
      return await updateTask(req.params.id, req.currentUser.id, req.body);
    } catch (err: any) {
      return reply.status(err.statusCode || 500).send({ error: err.message });
    }
  });

  // DELETE /api/tasks/:id
  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    try {
      await deleteTask(req.params.id, req.currentUser.id);
      return { success: true };
    } catch (err: any) {
      return reply.status(err.statusCode || 500).send({ error: err.message });
    }
  });

  // POST /api/tasks/:id/subtasks
  app.post<{ Params: { id: string }; Body: { title: string } }>("/:id/subtasks", async (req, reply) => {
    if (!req.body.title?.trim()) return reply.status(400).send({ error: "Текст подзадачи обязателен" });
    try {
      const sub = await addSubtask(req.params.id, req.currentUser.id, req.body.title);
      return reply.status(201).send(sub);
    } catch (err: any) {
      return reply.status(err.statusCode || 500).send({ error: err.message });
    }
  });

  // PATCH /api/tasks/:id/subtasks/:sid
  app.patch<{ Params: { id: string; sid: string }; Body: { done?: boolean; title?: string } }>(
    "/:id/subtasks/:sid", async (req, reply) => {
      try {
        return await updateSubtask(req.params.sid, req.params.id, req.currentUser.id, req.body);
      } catch (err: any) {
        return reply.status(err.statusCode || 500).send({ error: err.message });
      }
    }
  );

  // DELETE /api/tasks/:id/subtasks/:sid
  app.delete<{ Params: { id: string; sid: string } }>("/:id/subtasks/:sid", async (req, reply) => {
    try {
      await deleteSubtask(req.params.sid, req.params.id, req.currentUser.id);
      return { success: true };
    } catch (err: any) {
      return reply.status(err.statusCode || 500).send({ error: err.message });
    }
  });
}
