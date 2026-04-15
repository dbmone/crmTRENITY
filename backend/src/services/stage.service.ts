import { PrismaClient, StageName, StageStatus, OrderStatus, UserRole } from "@prisma/client";
import { getRoles } from "./permissions.service";

const prisma = new PrismaClient();

const STAGE_DEFAULTS = [
  { name: StageName.STORYBOARD, sortOrder: 1 },
  { name: StageName.ANIMATION,  sortOrder: 2 },
  { name: StageName.EDITING,    sortOrder: 3 },
  { name: StageName.REVIEW,     sortOrder: 4 },
  { name: StageName.COMPLETED,  sortOrder: 5 },
];

export async function updateStage(
  orderId: string,
  stageId: string,
  newStatus: StageStatus,
  userId: string,
  userRole: UserRole
) {
  const stage = await prisma.orderStage.findFirst({
    where: { id: stageId, orderId },
  });

  if (!stage) throw { statusCode: 404, message: "Этап не найден" };

  // REVIEW → DONE: проверяем через права доступа
  if (stage.name === StageName.REVIEW && newStatus === StageStatus.DONE) {
    const isLeadOnOrder = await prisma.orderCreator.findFirst({
      where: { orderId, creatorId: userId, isLead: true },
    });
    const approveRoles = getRoles("approve_review");
    const canApprove   = approveRoles.includes(userRole) || !!isLeadOnOrder;

    if (!canApprove) {
      throw { statusCode: 403, message: "Нет прав для утверждения этапа REVIEW" };
    }
  }

  const now = new Date();
  const updateData: any = { status: newStatus };

  if (newStatus === StageStatus.IN_PROGRESS && !stage.startedAt) {
    updateData.startedAt = now;
  }
  if (newStatus === StageStatus.DONE) {
    updateData.completedAt = now;
    // Завершение этапа снимает ожидание апрува клиента
    updateData.awaitingClientApproval = false;
  }
  if (newStatus === StageStatus.PENDING) {
    // Откат — сбрасываем временные метки
    updateData.startedAt   = null;
    updateData.completedAt = null;
    updateData.awaitingClientApproval = false;
  }

  const updated = await prisma.orderStage.update({
    where: { id: stageId },
    data: updateData,
  });

  await syncOrderStatus(orderId);
  return updated;
}

// Переключить "ожидание апрува от клиента" (STORYBOARD и ANIMATION)
export async function toggleClientApproval(
  orderId: string,
  stageId: string,
  action: "request" | "approve" | "skip",
  userId: string,
  userRole: UserRole
) {
  const stage = await prisma.orderStage.findFirst({
    where: { id: stageId, orderId },
  });
  if (!stage) throw { statusCode: 404, message: "Этап не найден" };

  const subStageSupported = (["STORYBOARD", "ANIMATION"] as string[]).includes(stage.name);
  if (!subStageSupported) {
    throw { statusCode: 400, message: "Подэтап доступен только для Раскадровки и Анимации" };
  }

  if (action === "request") {
    return prisma.orderStage.update({
      where: { id: stageId },
      data: { awaitingClientApproval: true, clientApprovalSkipped: false },
    });
  }

  if (action === "skip") {
    return prisma.orderStage.update({
      where: { id: stageId },
      data: { awaitingClientApproval: false, clientApprovalSkipped: true },
    });
  }

  // approve — только маркетолог/лид/админ
  const canApprove = getRoles("approve_review");
  const isLeadOnOrder = await prisma.orderCreator.findFirst({
    where: { orderId, creatorId: userId, isLead: true },
  });
  if (!canApprove.includes(userRole) && !isLeadOnOrder) {
    throw { statusCode: 403, message: "Нет прав для апрува клиента" };
  }

  return prisma.orderStage.update({
    where: { id: stageId },
    data: {
      awaitingClientApproval: false,
      clientApprovalSkipped: false,
      clientApprovedAt: new Date(),
    },
  });
}

// Начать новый раунд правок
export async function startRevisionRound(
  orderId: string,
  userId: string,
  userRole: UserRole
) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw { statusCode: 404, message: "Заказ не найден" };

  // Только маркетолог заказа, HEAD_MARKETER или ADMIN
  const canRevise: string[] = [UserRole.ADMIN, UserRole.HEAD_MARKETER];
  if (!canRevise.includes(userRole) && order.marketerId !== userId) {
    throw { statusCode: 403, message: "Только маркетолог заказа может создавать раунд правок" };
  }

  // Найти текущий максимальный раунд
  const stages = await prisma.orderStage.findMany({ where: { orderId } });
  const maxRound = stages.length > 0 ? Math.max(...stages.map((s) => s.revisionRound)) : 0;

  // Проверить, что COMPLETED стадия текущего раунда выполнена
  const completedStage = stages.find(
    (s) => s.name === StageName.COMPLETED && s.revisionRound === maxRound
  );
  if (!completedStage || completedStage.status !== StageStatus.DONE) {
    throw { statusCode: 400, message: "Видео ещё не готово — нельзя создать раунд правок" };
  }

  const newRound = maxRound + 1;

  // Создать новый набор этапов для нового раунда
  await prisma.orderStage.createMany({
    data: STAGE_DEFAULTS.map((s) => ({
      orderId,
      name: s.name,
      sortOrder: s.sortOrder,
      revisionRound: newRound,
    })),
  });

  // Вернуть статус заказа в IN_PROGRESS
  await prisma.order.update({ where: { id: orderId }, data: { status: OrderStatus.IN_PROGRESS } });

  return prisma.orderStage.findMany({
    where: { orderId },
    orderBy: [{ revisionRound: "asc" }, { sortOrder: "asc" }],
  });
}

// Откатить этапы — найти последний полностью-DONE раунд и снять завершение текущего
export async function rollbackToRevision(
  orderId: string,
  stageId: string,
  userId: string,
  userRole: UserRole
) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw { statusCode: 404, message: "Заказ не найден" };

  const canRevise: string[] = [UserRole.ADMIN, UserRole.HEAD_MARKETER];
  if (!canRevise.includes(userRole) && order.marketerId !== userId) {
    throw { statusCode: 403, message: "Нет прав для отката" };
  }

  const stage = await prisma.orderStage.findFirst({ where: { id: stageId, orderId } });
  if (!stage) throw { statusCode: 404, message: "Этап не найден" };

  // Откатить этап в PENDING
  await prisma.orderStage.update({
    where: { id: stageId },
    data: { status: StageStatus.PENDING, startedAt: null, completedAt: null },
  });

  await syncOrderStatus(orderId);
  return prisma.orderStage.findMany({
    where: { orderId },
    orderBy: [{ revisionRound: "asc" }, { sortOrder: "asc" }],
  });
}

async function syncOrderStatus(orderId: string) {
  const stages = await prisma.orderStage.findMany({
    where: { orderId },
    orderBy: [{ revisionRound: "asc" }, { sortOrder: "asc" }],
  });

  // Смотрим только на последний раунд
  const maxRound = stages.length > 0 ? Math.max(...stages.map((s) => s.revisionRound)) : 0;
  const currentStages = stages.filter((s) => s.revisionRound === maxRound);

  const allDone    = currentStages.every((s) => s.status === StageStatus.DONE);
  const allPending = currentStages.every((s) => s.status === StageStatus.PENDING);
  const reviewStage   = currentStages.find((s) => s.name === StageName.REVIEW);
  const reviewActive  = reviewStage?.status === StageStatus.IN_PROGRESS;

  let newStatus: OrderStatus;
  if (allDone)    newStatus = OrderStatus.DONE;
  else if (allPending) newStatus = OrderStatus.NEW;
  else if (reviewActive) newStatus = OrderStatus.ON_REVIEW;
  else newStatus = OrderStatus.IN_PROGRESS;

  await prisma.order.update({ where: { id: orderId }, data: { status: newStatus } });
}

export async function getStages(orderId: string) {
  return prisma.orderStage.findMany({
    where: { orderId },
    orderBy: [{ revisionRound: "asc" }, { sortOrder: "asc" }],
  });
}
