import { PrismaClient } from "@prisma/client";
import { transcribeAudio } from "./stt.service";

const prisma = new PrismaClient();

// Groq LLM бесплатно. Можно заменить на openai/claude через AI_PROVIDER
const GROQ_LLM_MODEL = "llama-3.3-70b-versatile";

export interface ParsedTask {
  title: string;
  description?: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  subtasks: string[];
  rawText: string;
}

/**
 * STT → LLM → структурированная задача с подзадачами.
 * Если GROQ_API_KEY не задан — возвращает rawText как title.
 * TODO: поддержка AI_PROVIDER=openai|claude через env
 */
export async function parseVoiceToTask(buffer: Buffer, filename: string): Promise<ParsedTask> {
  const rawText = await transcribeAudio(buffer, filename);

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return { title: rawText.slice(0, 80), rawText, priority: "MEDIUM", subtasks: [] };
  }

  const prompt = `Голосовая заметка: "${rawText}"

Создай структурированную задачу. Отвечай ТОЛЬКО валидным JSON:
{
  "title": "краткое название (до 80 символов)",
  "description": "подробное описание или null",
  "priority": "LOW|MEDIUM|HIGH",
  "subtasks": ["шаг 1", "шаг 2"]
}

Правила:
- title: ёмкое название задачи на русском
- subtasks: выдели 0-8 конкретных шагов из текста. Если шаги не упомянуты — пустой массив []
- priority: LOW если не срочно, HIGH если есть слова "срочно/сегодня/важно/ASAP"
- Отвечай на русском языке`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_LLM_MODEL,
        messages: [
          { role: "system", content: "Ты помощник по управлению задачами. Отвечай ТОЛЬКО валидным JSON без markdown." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 800,
      }),
    });

    if (res.ok) {
      const data = await res.json() as any;
      const parsed = JSON.parse(data.choices[0].message.content);
      return {
        title:       String(parsed.title || rawText).slice(0, 80),
        description: parsed.description || undefined,
        priority:    ["LOW", "MEDIUM", "HIGH"].includes(parsed.priority) ? parsed.priority : "MEDIUM",
        subtasks:    Array.isArray(parsed.subtasks)
          ? (parsed.subtasks as any[]).filter((s) => typeof s === "string").slice(0, 8)
          : [],
        rawText,
      };
    }
  } catch (e: any) {
    console.warn("LLM parse failed:", e.message);
  }

  // Fallback — просто текст
  return { title: rawText.slice(0, 80), rawText, priority: "MEDIUM", subtasks: [] };
}

export async function getTasksForUser(userId: string) {
  return prisma.task.findMany({
    where: { userId },
    include: { subtasks: { orderBy: { sortOrder: "asc" } } },
    orderBy: [{ createdAt: "desc" }],
  });
}

export async function createTask(userId: string, data: {
  title: string;
  description?: string;
  priority?: string;
  dueDate?: string;
  subtasks?: string[];
  aiGenerated?: boolean;
}) {
  return prisma.task.create({
    data: {
      userId,
      title:       data.title.trim(),
      description: data.description?.trim() || undefined,
      priority:    (data.priority as any) || "MEDIUM",
      dueDate:     data.dueDate ? new Date(data.dueDate) : undefined,
      aiGenerated: data.aiGenerated || false,
      subtasks:    data.subtasks?.length
        ? { create: data.subtasks.map((title, i) => ({ title: title.trim(), sortOrder: i })) }
        : undefined,
    },
    include: { subtasks: { orderBy: { sortOrder: "asc" } } },
  });
}

export async function updateTask(id: string, userId: string, data: {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  dueDate?: string | null;
}) {
  const task = await prisma.task.findFirst({ where: { id, userId } });
  if (!task) throw Object.assign(new Error("Задача не найдена"), { statusCode: 404 });

  return prisma.task.update({
    where: { id },
    data: {
      title:       data.title?.trim(),
      description: data.description !== undefined ? (data.description?.trim() || null) : undefined,
      status:      (data.status as any) || undefined,
      priority:    (data.priority as any) || undefined,
      dueDate:     data.dueDate === null ? null : data.dueDate ? new Date(data.dueDate) : undefined,
      updatedAt:   new Date(),
    },
    include: { subtasks: { orderBy: { sortOrder: "asc" } } },
  });
}

export async function deleteTask(id: string, userId: string) {
  const task = await prisma.task.findFirst({ where: { id, userId } });
  if (!task) throw Object.assign(new Error("Задача не найдена"), { statusCode: 404 });
  await prisma.task.delete({ where: { id } });
}

export async function addSubtask(taskId: string, userId: string, title: string) {
  const task = await prisma.task.findFirst({ where: { id: taskId, userId } });
  if (!task) throw Object.assign(new Error("Задача не найдена"), { statusCode: 404 });
  const count = await prisma.taskSubtask.count({ where: { taskId } });
  return prisma.taskSubtask.create({ data: { taskId, title: title.trim(), sortOrder: count } });
}

export async function updateSubtask(subtaskId: string, taskId: string, userId: string, data: {
  done?: boolean;
  title?: string;
}) {
  const task = await prisma.task.findFirst({ where: { id: taskId, userId } });
  if (!task) throw Object.assign(new Error("Задача не найдена"), { statusCode: 404 });
  return prisma.taskSubtask.update({
    where: { id: subtaskId },
    data: {
      done:  data.done  !== undefined ? data.done  : undefined,
      title: data.title !== undefined ? data.title.trim() : undefined,
    },
  });
}

export async function deleteSubtask(subtaskId: string, taskId: string, userId: string) {
  const task = await prisma.task.findFirst({ where: { id: taskId, userId } });
  if (!task) throw Object.assign(new Error("Задача не найдена"), { statusCode: 404 });
  await prisma.taskSubtask.delete({ where: { id: subtaskId } });
}
