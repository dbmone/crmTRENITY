import { FastifyRequest, FastifyReply } from "fastify";

export interface JwtPayload {
  id: string;
  role: string;
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
    request.currentUser = decoded;
  } catch (err) {
    reply.status(401).send({ error: "Не авторизован. Войдите по PIN-коду." });
  }
}
