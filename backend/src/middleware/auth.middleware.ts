import { FastifyRequest, FastifyReply } from "fastify";

export interface JwtPayload {
  id: string;
  role: string;
  status: string;
  telegramUsername: string | null;
}

declare module "fastify" {
  interface FastifyRequest {
    currentUser: JwtPayload;
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const decoded = await request.jwtVerify<JwtPayload>();

    // Только одобренные пользователи могут работать
    if (decoded.status !== "APPROVED") {
      return reply.status(403).send({
        error: "Ваша заявка ещё не одобрена. Дождитесь подтверждения.",
      });
    }

    request.currentUser = decoded;
  } catch (err) {
    reply.status(401).send({ error: "Не авторизован. Войдите по PIN-коду." });
  }
}
