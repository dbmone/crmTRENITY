import {
  PrismaClient,
  StageName,
  StageStatus,
  OrderStatus,
  UserRole,
} from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Обновить статус этапа.
 * REVIEW → COMPLETED может только маркетолог, лид-креатор или админ.
 */
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

  // Проверка: переход REVIEW → COMPLETED
  if (
    stage.name === StageName.REVIEW &&
    newStatus === StageStatus.DONE
  ) {
    // Проверяем, является ли пользователь лид-креатором на этом заказе
    const isLeadOnOrder = await prisma.orderCreator.findFirst({
      where: { orderId, creatorId: userId, isLead: true },
    });

    const canApprove =
      userRole === UserRole.ADMIN ||
      userRole === UserRole.MARKETER ||
      userRole === UserRole.LEAD_CREATOR ||
      !!isLeadOnOrder;

    if (!canApprove) {
      throw {
        statusCode: 403,
        message: "Только маркетолог или главный креатор может утвердить этап ревью",
      };
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

  // Автоматически обновляем статус заказа
  await syncOrderStatus(orderId);

  return updated;
}

/**
 * Синхронизирует статус заказа на основе этапов.
 * - Все PENDING → NEW
 * - Есть IN_PROGRESS → IN_PROGRESS
 * - REVIEW в IN_PROGRESS → ON_REVIEW
 * - Все DONE → DONE
 */
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

  if (allDone) {
    newStatus = OrderStatus.DONE;
  } else if (allPending) {
    newStatus = OrderStatus.NEW;
  } else if (reviewActive) {
    newStatus = OrderStatus.ON_REVIEW;
  } else {
    newStatus = OrderStatus.IN_PROGRESS;
  }

  await prisma.order.update({
    where: { id: orderId },
    data: { status: newStatus },
  });
}

/**
 * Получить все этапы заказа
 */
export async function getStages(orderId: string) {
  return prisma.orderStage.findMany({
    where: { orderId },
    orderBy: { sortOrder: "asc" },
  });
}
