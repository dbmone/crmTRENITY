import { PrismaClient, StageName, StageStatus, OrderStatus, UserRole } from "@prisma/client";
import { getRoles } from "./permissions.service";

const prisma = new PrismaClient();

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
  }

  const updated = await prisma.orderStage.update({
    where: { id: stageId },
    data: updateData,
  });

  await syncOrderStatus(orderId);
  return updated;
}

async function syncOrderStatus(orderId: string) {
  const stages = await prisma.orderStage.findMany({
    where: { orderId },
    orderBy: { sortOrder: "asc" },
  });

  const allDone = stages.every((s) => s.status === StageStatus.DONE);
  const allPending = stages.every((s) => s.status === StageStatus.PENDING);
  const reviewStage = stages.find((s) => s.name === StageName.REVIEW);
  const reviewActive = reviewStage?.status === StageStatus.IN_PROGRESS;

  let newStatus: OrderStatus;
  if (allDone) newStatus = OrderStatus.DONE;
  else if (allPending) newStatus = OrderStatus.NEW;
  else if (reviewActive) newStatus = OrderStatus.ON_REVIEW;
  else newStatus = OrderStatus.IN_PROGRESS;

  await prisma.order.update({ where: { id: orderId }, data: { status: newStatus } });
}

export async function getStages(orderId: string) {
  return prisma.orderStage.findMany({
    where: { orderId },
    orderBy: { sortOrder: "asc" },
  });
}
