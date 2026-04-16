import { FastifyInstance } from "fastify";
import { getAllSettings, upsertSetting, DEFAULT_TASK_PROMPT, DEFAULT_TZ_PROMPT } from "../services/settings.service";

const ALLOWED_KEYS = ["task_parse_prompt", "tz_structure_prompt"];

export async function settingsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // GET /api/settings — возвращает все настройки (только ADMIN и HEAD_CREATOR)
  app.get("/", async (req, reply) => {
    const role = req.currentUser.role;
    if (role !== "ADMIN" && role !== "HEAD_CREATOR") {
      return reply.status(403).send({ error: "Нет доступа" });
    }
    const settings = await getAllSettings();
    return {
      task_parse_prompt:  settings.task_parse_prompt  ?? DEFAULT_TASK_PROMPT,
      tz_structure_prompt: settings.tz_structure_prompt ?? DEFAULT_TZ_PROMPT,
    };
  });

  // PUT /api/settings/:key — обновить настройку
  app.put<{ Params: { key: string }; Body: { value: string } }>(
    "/:key",
    async (req, reply) => {
      const role = req.currentUser.role;
      if (role !== "ADMIN" && role !== "HEAD_CREATOR") {
        return reply.status(403).send({ error: "Нет доступа" });
      }
      if (!ALLOWED_KEYS.includes(req.params.key)) {
        return reply.status(400).send({ error: "Неизвестный ключ настройки" });
      }
      if (typeof req.body.value !== "string" || !req.body.value.trim()) {
        return reply.status(400).send({ error: "Значение не может быть пустым" });
      }
      await upsertSetting(req.params.key, req.body.value.trim(), req.currentUser.id);
      return { success: true };
    }
  );

  // DELETE /api/settings/:key — сбросить к дефолту
  app.delete<{ Params: { key: string } }>("/:key", async (req, reply) => {
    const role = req.currentUser.role;
    if (role !== "ADMIN" && role !== "HEAD_CREATOR") {
      return reply.status(403).send({ error: "Нет доступа" });
    }
    if (!ALLOWED_KEYS.includes(req.params.key)) {
      return reply.status(400).send({ error: "Неизвестный ключ настройки" });
    }
    const defaults: Record<string, string> = {
      task_parse_prompt:   DEFAULT_TASK_PROMPT,
      tz_structure_prompt: DEFAULT_TZ_PROMPT,
    };
    await upsertSetting(req.params.key, defaults[req.params.key], req.currentUser.id);
    return { success: true, value: defaults[req.params.key] };
  });
}
