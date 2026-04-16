import { FastifyInstance } from "fastify";
import {
  getAllSettings,
  upsertSetting,
  DEFAULT_TASK_PROMPT,
  DEFAULT_TZ_PROMPT,
  DEFAULT_KANBAN_DRAG_ENABLED,
} from "../services/settings.service";

const ALL_KEYS = ["task_parse_prompt", "tz_structure_prompt", "kanban_drag_enabled"] as const;
const PROMPT_KEYS = ["task_parse_prompt", "tz_structure_prompt"] as const;
const ADMIN_ONLY_KEYS = ["kanban_drag_enabled"] as const;

function canReadPromptSettings(role: string) {
  return role === "ADMIN" || role === "HEAD_CREATOR";
}

function canEditSetting(role: string, key: string) {
  if (ADMIN_ONLY_KEYS.includes(key as (typeof ADMIN_ONLY_KEYS)[number])) {
    return role === "ADMIN";
  }
  if (PROMPT_KEYS.includes(key as (typeof PROMPT_KEYS)[number])) {
    return role === "ADMIN" || role === "HEAD_CREATOR";
  }
  return false;
}

export async function settingsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/", async (req) => {
    const role = req.currentUser.role;
    const settings = await getAllSettings();

    const result: Record<string, string> = {
      kanban_drag_enabled: settings.kanban_drag_enabled ?? DEFAULT_KANBAN_DRAG_ENABLED,
    };

    if (canReadPromptSettings(role)) {
      result.task_parse_prompt = settings.task_parse_prompt ?? DEFAULT_TASK_PROMPT;
      result.tz_structure_prompt = settings.tz_structure_prompt ?? DEFAULT_TZ_PROMPT;
    }

    return result;
  });

  app.put<{ Params: { key: string }; Body: { value: string } }>(
    "/:key",
    async (req, reply) => {
      const role = req.currentUser.role;
      const key = req.params.key;

      if (!ALL_KEYS.includes(key as (typeof ALL_KEYS)[number])) {
        return reply.status(400).send({ error: "Неизвестный ключ настройки" });
      }
      if (!canEditSetting(role, key)) {
        return reply.status(403).send({ error: "Нет доступа" });
      }
      if (typeof req.body.value !== "string") {
        return reply.status(400).send({ error: "Некорректное значение" });
      }

      const value = req.body.value.trim();

      if (key === "kanban_drag_enabled") {
        if (value !== "true" && value !== "false") {
          return reply.status(400).send({ error: "Значение должно быть true или false" });
        }
      } else if (!value) {
        return reply.status(400).send({ error: "Значение не может быть пустым" });
      }

      await upsertSetting(key, value, req.currentUser.id);
      return { success: true };
    }
  );

  app.delete<{ Params: { key: string } }>("/:key", async (req, reply) => {
    const role = req.currentUser.role;
    const key = req.params.key;

    if (!ALL_KEYS.includes(key as (typeof ALL_KEYS)[number])) {
      return reply.status(400).send({ error: "Неизвестный ключ настройки" });
    }
    if (!canEditSetting(role, key)) {
      return reply.status(403).send({ error: "Нет доступа" });
    }

    const defaults: Record<string, string> = {
      task_parse_prompt: DEFAULT_TASK_PROMPT,
      tz_structure_prompt: DEFAULT_TZ_PROMPT,
      kanban_drag_enabled: DEFAULT_KANBAN_DRAG_ENABLED,
    };

    await upsertSetting(key, defaults[key], req.currentUser.id);
    return { success: true, value: defaults[key] };
  });
}
