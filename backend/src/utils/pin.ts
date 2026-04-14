import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

export function generatePin(): string {
  let pin = "";
  for (let i = 0; i < 4; i++) {
    const idx = crypto.randomInt(0, CHARS.length);
    pin += CHARS[idx];
  }
  return pin;
}

export async function generateUniquePin(prisma: PrismaClient): Promise<string> {
  let attempts = 0;
  while (attempts < 100) {
    const pin = generatePin();
    const existing = await prisma.user.findUnique({ where: { pinCode: pin } });
    if (!existing) return pin;
    attempts++;
  }
  throw new Error("Failed to generate unique PIN after 100 attempts");
}
