import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const CHARS = "abcdefghjkmnpqrstuvwxyz23456789";

export function normalizePin(pin: string): string {
  return pin.trim().toLowerCase();
}

export function generatePin(): string {
  let pin = "";
  for (let i = 0; i < 4; i++) {
    const idx = crypto.randomInt(0, CHARS.length);
    pin += CHARS[idx];
  }
  return pin;
}

export async function generateUniquePin(
  prisma: PrismaClient,
  excludeUserId?: string,
  reservedPins: Set<string> = new Set()
): Promise<string> {
  let attempts = 0;
  while (attempts < 200) {
    const pin = generatePin();
    if (reservedPins.has(pin)) {
      attempts++;
      continue;
    }

    const existing = await prisma.user.findFirst({
      where: {
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
        pinCode: { equals: pin, mode: "insensitive" },
      },
      select: { id: true },
    });

    if (!existing) return pin;
    attempts++;
  }
  throw new Error("Failed to generate unique PIN after 200 attempts");
}
