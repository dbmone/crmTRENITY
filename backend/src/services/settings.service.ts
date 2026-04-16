import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const DEFAULT_TASK_PROMPT = `Голосовая заметка пользователя: "{{TEXT}}"

Создай структурированную задачу. Отвечай ТОЛЬКО валидным JSON без пояснений:
{
  "title": "краткое название задачи (до 80 символов)",
  "description": "подробное описание или null",
  "priority": "LOW|MEDIUM|HIGH",
  "subtasks": ["шаг 1", "шаг 2"]
}

Правила:
- title: ёмкое название на русском
- subtasks: 0-8 конкретных шагов из текста. Если шагов нет — []
- priority: HIGH если слова "срочно/сегодня/важно", LOW если не срочно, иначе MEDIUM
- Отвечай на русском`;

export async function getSetting(key: string): Promise<string | null> {
  try {
    const s = await prisma.appSetting.findUnique({ where: { key } });
    return s?.value ?? null;
  } catch {
    return null;
  }
}

export async function getAllSettings(): Promise<Record<string, string>> {
  try {
    const all = await prisma.appSetting.findMany();
    return Object.fromEntries(all.map((s) => [s.key, s.value]));
  } catch {
    return {};
  }
}

export async function upsertSetting(key: string, value: string, updatedById?: string): Promise<void> {
  await prisma.appSetting.upsert({
    where:  { key },
    update: { value, updatedAt: new Date(), updatedById },
    create: { key, value, updatedById },
  });
}
