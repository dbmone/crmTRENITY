/**
 * STT (Speech-to-Text) через Groq Whisper API
 * Бесплатный план: 7 200 запросов / день, max 25 MB на файл
 * Регистрация: https://console.groq.com
 * Env: GROQ_API_KEY=gsk_...
 */
import FormDataNode from "form-data";
import { proxyFetch } from "../utils/proxy-fetch";

export async function transcribeAudio(buffer: Buffer, filename: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw Object.assign(
      new Error("GROQ_API_KEY не настроен. Зарегистрируйтесь на console.groq.com и добавьте ключ в переменные окружения."),
      { statusCode: 501 }
    );
  }

  if (buffer.length > 25 * 1024 * 1024) {
    throw Object.assign(new Error("Файл слишком большой (макс. 25 МБ для расшифровки)"), { statusCode: 413 });
  }

  const ext = filename.split(".").pop()?.toLowerCase() ?? "ogg";
  const mimeMap: Record<string, string> = {
    ogg: "audio/ogg", webm: "audio/webm", mp3: "audio/mpeg",
    mp4: "audio/mp4", wav: "audio/wav", m4a: "audio/mp4",
  };
  const mimeType = mimeMap[ext] ?? "audio/ogg";

  // Используем npm form-data — корректно работает с node-fetch (в отличие от нативного FormData)
  const form = new FormDataNode();
  form.append("file", buffer, { filename, contentType: mimeType });
  form.append("model", "whisper-large-v3");
  form.append("language", "ru");
  form.append("response_format", "json");

  const res = await proxyFetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...form.getHeaders(),
    },
    body: form as any,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Groq API error ${res.status}: ${errText}`);
  }

  const data = await res.json() as { text?: string };
  return (data.text ?? "").trim();
}
