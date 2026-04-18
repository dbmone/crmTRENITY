import { PrismaClient, UserRole } from "@prisma/client";
import { getSetting } from "./settings.service";

const prisma = new PrismaClient();

export interface PercentageSettings {
  CREATOR:           number;
  LEAD_CREATOR:      number;
  HEAD_LEAD_CREATOR: number;
  HEAD_CREATOR:      number;
  MARKETER:          number;
  HEAD_MARKETER:     number;
  checkboxStoryboard: number;
  checkboxAnimation:  number;
  checkboxEditing:    number;
  checkboxScenario:   number;
}

export const DEFAULT_PERCENTAGE_SETTINGS: PercentageSettings = {
  CREATOR:           35,
  LEAD_CREATOR:      5,
  HEAD_LEAD_CREATOR: 5,
  HEAD_CREATOR:      5,
  MARKETER:          20,
  HEAD_MARKETER:     5,
  checkboxStoryboard: 8.75,
  checkboxAnimation:  8.75,
  checkboxEditing:    8.75,
  checkboxScenario:   8.75,
};

export async function getPercentageSettings(): Promise<PercentageSettings> {
  try {
    const raw = await getSetting("percentage_settings");
    if (!raw) return DEFAULT_PERCENTAGE_SETTINGS;
    return { ...DEFAULT_PERCENTAGE_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PERCENTAGE_SETTINGS;
  }
}

export interface EarningEntry {
  orderId:     string;
  orderTitle:  string;
  orderPrice:  number;
  hasTax:      boolean;
  effectivePrice: number;
  role:        string;        // в какой роли получает
  basePct:     number;        // базовый % по роли
  adjustedPct: number;        // итоговый % (после вычета за галочки)
  amount:      number;        // сумма в рублях
  orderStatus: string;
  createdAt:   string;
}

// Рассчитать заработок пользователя за все (DONE) заказы
export async function calculateUserEarnings(userId: string): Promise<EarningEntry[]> {
  const pct = await getPercentageSettings();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, teamLeadId: true },
  });
  if (!user) return [];

  const entries: EarningEntry[] = [];

  // ---- MARKETER: заказы которые создал сам ----
  if (user.role === "MARKETER") {
    const orders = await prisma.order.findMany({
      where: { marketerId: userId, status: "DONE", price: { not: null } },
      select: { id: true, title: true, price: true, hasTax: true, status: true, createdAt: true },
    });
    for (const o of orders) {
      const ep = effectivePrice(o.price!, o.hasTax);
      entries.push(makeEntry(o, ep, "MARKETER", pct.MARKETER, pct.MARKETER));
    }
  }

  // ---- HEAD_MARKETER: заказы своих подчинённых-маркетологов ----
  if (user.role === "HEAD_MARKETER" || user.role === "ADMIN") {
    const subs = await prisma.user.findMany({
      where: { teamLeadId: userId, role: "MARKETER" },
      select: { id: true },
    });
    const subIds = subs.map((s) => s.id);
    // Если HEAD_MARKETER сам создал заказ — тоже считаем (как MARKETER + HEAD_MARKETER)
    if (user.role === "HEAD_MARKETER") subIds.push(userId);

    if (subIds.length > 0) {
      const orders = await prisma.order.findMany({
        where: { marketerId: { in: subIds }, status: "DONE", price: { not: null } },
        select: { id: true, title: true, price: true, hasTax: true, status: true, createdAt: true, marketerId: true },
      });
      for (const o of orders) {
        const ep = effectivePrice(o.price!, o.hasTax);
        // Если сам создал — получает marketer% + headMarketer%
        const basePct = o.marketerId === userId
          ? pct.MARKETER + pct.HEAD_MARKETER
          : pct.HEAD_MARKETER;
        entries.push(makeEntry(o, ep, "HEAD_MARKETER", basePct, basePct));
      }
    }
  }

  // ---- CREATOR: заказы где назначен исполнителем ----
  if (user.role === "CREATOR" || user.role === "LEAD_CREATOR" || user.role === "HEAD_LEAD_CREATOR") {
    const assignments = await prisma.orderCreator.findMany({
      where: { creatorId: userId },
      include: {
        order: {
          select: { id: true, title: true, price: true, hasTax: true, status: true, createdAt: true },
        },
      },
    });
    for (const a of assignments) {
      const o = a.order;
      if (o.status !== "DONE" || !o.price) continue;
      const ep = effectivePrice(o.price, o.hasTax);

      // Базовый % по роли — если LEAD_CREATOR или HEAD_LEAD_CREATOR работает как исполнитель,
      // получает свой роль-процент ИЛИ CREATOR-процент (берём бо́льший)
      const rolePct = user.role === "CREATOR" ? pct.CREATOR
        : user.role === "LEAD_CREATOR" ? Math.max(pct.CREATOR, pct.LEAD_CREATOR)
        : Math.max(pct.CREATOR, pct.HEAD_LEAD_CREATOR);

      // Применяем вычеты по галочкам
      const result = await prisma.orderCreatorResult.findUnique({
        where: { orderId_creatorId: { orderId: o.id, creatorId: userId } },
      });
      const adjusted = applyCheckboxDeductions(rolePct, result, pct);
      entries.push(makeEntry(o, ep, user.role, rolePct, adjusted));
    }

    // Также проверяем — помогал ли пользователь кому-то (получает % за конкретные галочки)
    const helpEntries = await getHelperEarnings(userId, pct);
    entries.push(...helpEntries);
  }

  // ---- LEAD_CREATOR: % за заказы своих подчинённых (CREATOR) ----
  if (user.role === "LEAD_CREATOR" || user.role === "HEAD_LEAD_CREATOR") {
    const subs = await getSubordinateIds(userId, ["CREATOR"]);
    if (subs.length > 0) {
      const assignments = await prisma.orderCreator.findMany({
        where: { creatorId: { in: subs } },
        include: {
          order: {
            select: { id: true, title: true, price: true, hasTax: true, status: true, createdAt: true },
          },
        },
      });
      const seen = new Set<string>();
      for (const a of assignments) {
        const o = a.order;
        if (o.status !== "DONE" || !o.price || seen.has(o.id)) continue;
        seen.add(o.id);
        const ep = effectivePrice(o.price, o.hasTax);
        const rolePct = user.role === "LEAD_CREATOR" ? pct.LEAD_CREATOR : pct.HEAD_LEAD_CREATOR;
        entries.push(makeEntry(o, ep, user.role + "_TEAM", rolePct, rolePct));
      }
    }
  }

  // ---- HEAD_LEAD_CREATOR: % за заказы LEAD_CREATOR подчинённых ----
  if (user.role === "HEAD_LEAD_CREATOR") {
    const leadSubs = await getSubordinateIds(userId, ["LEAD_CREATOR"]);
    if (leadSubs.length > 0) {
      const creatorSubs = await getSubordinateIds2(leadSubs, ["CREATOR"]);
      const allSubIds = [...leadSubs, ...creatorSubs];
      if (allSubIds.length > 0) {
        const assignments = await prisma.orderCreator.findMany({
          where: { creatorId: { in: allSubIds } },
          include: {
            order: {
              select: { id: true, title: true, price: true, hasTax: true, status: true, createdAt: true },
            },
          },
        });
        const seen = new Set<string>();
        for (const a of assignments) {
          const o = a.order;
          if (o.status !== "DONE" || !o.price || seen.has(o.id)) continue;
          seen.add(o.id);
          const ep = effectivePrice(o.price, o.hasTax);
          entries.push(makeEntry(o, ep, "HEAD_LEAD_CREATOR_TEAM", pct.HEAD_LEAD_CREATOR, pct.HEAD_LEAD_CREATOR));
        }
      }
    }
  }

  // ---- HEAD_CREATOR: % за заказы всей цепочки ----
  if (user.role === "HEAD_CREATOR" || user.role === "ADMIN") {
    const allCreatorIds = await getAllCreatorSubordinates(userId);
    if (allCreatorIds.length > 0) {
      const assignments = await prisma.orderCreator.findMany({
        where: { creatorId: { in: allCreatorIds } },
        include: {
          order: {
            select: { id: true, title: true, price: true, hasTax: true, status: true, createdAt: true },
          },
        },
      });
      const seen = new Set<string>();
      for (const a of assignments) {
        const o = a.order;
        if (o.status !== "DONE" || !o.price || seen.has(o.id)) continue;
        seen.add(o.id);
        const ep = effectivePrice(o.price, o.hasTax);
        entries.push(makeEntry(o, ep, "HEAD_CREATOR_TEAM", pct.HEAD_CREATOR, pct.HEAD_CREATOR));
      }
    }

    // Если сам назначен исполнителем на заказ
    const selfAssignments = await prisma.orderCreator.findMany({
      where: { creatorId: userId },
      include: {
        order: {
          select: { id: true, title: true, price: true, hasTax: true, status: true, createdAt: true },
        },
      },
    });
    for (const a of selfAssignments) {
      const o = a.order;
      if (o.status !== "DONE" || !o.price) continue;
      const ep = effectivePrice(o.price, o.hasTax);
      const result = await prisma.orderCreatorResult.findUnique({
        where: { orderId_creatorId: { orderId: o.id, creatorId: userId } },
      });
      const adjusted = applyCheckboxDeductions(pct.CREATOR, result, pct);
      entries.push(makeEntry(o, ep, "HEAD_CREATOR_SELF", pct.CREATOR, adjusted));
    }
  }

  // Убираем дубликаты одного и того же заказа в одной роли
  const seen = new Map<string, EarningEntry>();
  for (const e of entries) {
    const key = `${e.orderId}::${e.role}`;
    if (!seen.has(key)) seen.set(key, e);
  }
  return Array.from(seen.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

// ---- helpers ----

function effectivePrice(price: number, hasTax: boolean): number {
  return hasTax ? price * 1.06 : price;
}

function makeEntry(
  o: { id: string; title: string; price: number | null; hasTax: boolean; status: string; createdAt: Date },
  ep: number,
  role: string,
  basePct: number,
  adjustedPct: number
): EarningEntry {
  return {
    orderId:       o.id,
    orderTitle:    o.title,
    orderPrice:    o.price ?? 0,
    hasTax:        o.hasTax,
    effectivePrice: ep,
    role,
    basePct,
    adjustedPct,
    amount:        Math.round((ep * adjustedPct) / 100 * 100) / 100,
    orderStatus:   o.status,
    createdAt:     o.createdAt.toISOString(),
  };
}

function applyCheckboxDeductions(
  basePct: number,
  result: { didStoryboard: boolean; didAnimation: boolean; didEditing: boolean; didScenario: boolean } | null,
  pct: PercentageSettings
): number {
  if (!result) return basePct;
  let adjusted = basePct;
  if (!result.didStoryboard) adjusted -= pct.checkboxStoryboard;
  if (!result.didAnimation)  adjusted -= pct.checkboxAnimation;
  if (!result.didEditing)    adjusted -= pct.checkboxEditing;
  if (!result.didScenario)   adjusted -= pct.checkboxScenario;
  return Math.max(0, adjusted);
}

async function getHelperEarnings(userId: string, pct: PercentageSettings): Promise<EarningEntry[]> {
  const entries: EarningEntry[] = [];
  const fields = [
    { field: "helperStoryboardId", pctKey: "checkboxStoryboard" as const },
    { field: "helperAnimationId",  pctKey: "checkboxAnimation" as const },
    { field: "helperEditingId",    pctKey: "checkboxEditing" as const },
    { field: "helperScenarioId",   pctKey: "checkboxScenario" as const },
  ];
  for (const { field, pctKey } of fields) {
    const results = await (prisma.orderCreatorResult as any).findMany({
      where: { [field]: userId },
      include: {
        order: {
          select: { id: true, title: true, price: true, hasTax: true, status: true, createdAt: true },
        },
      },
    });
    for (const r of results) {
      const o = r.order;
      if (o.status !== "DONE" || !o.price) continue;
      const ep = effectivePrice(o.price, o.hasTax);
      const helperPct = pct[pctKey];
      entries.push(makeEntry(o, ep, `HELPER_${pctKey.toUpperCase()}`, helperPct, helperPct));
    }
  }
  return entries;
}

async function getSubordinateIds(userId: string, roles: string[]): Promise<string[]> {
  const subs = await prisma.user.findMany({
    where: { teamLeadId: userId, role: { in: roles as any[] } },
    select: { id: true },
  });
  return subs.map((s) => s.id);
}

async function getSubordinateIds2(userIds: string[], roles: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const subs = await prisma.user.findMany({
    where: { teamLeadId: { in: userIds }, role: { in: roles as any[] } },
    select: { id: true },
  });
  return subs.map((s) => s.id);
}

async function getAllCreatorSubordinates(userId: string): Promise<string[]> {
  const creatorRoles = ["CREATOR", "LEAD_CREATOR", "HEAD_LEAD_CREATOR"] as UserRole[];
  const all: string[] = [];
  const queue = [userId];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const subs = await prisma.user.findMany({
      where: { teamLeadId: id, role: { in: creatorRoles } },
      select: { id: true },
    });
    for (const s of subs) {
      all.push(s.id);
      queue.push(s.id);
    }
  }
  return all;
}
