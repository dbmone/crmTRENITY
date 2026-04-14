import { PrismaClient, OrderStatus, UserRole, StageName } from "@prisma/client";

const prisma = new PrismaClient();

// ===================== ПОЛУЧЕНИЕ =====================

interface OrderFilters {
  status?: OrderStatus;
  marketerId?: string;
  creatorId?: string;
}

export async function getOrders(filters: OrderFilters) {
  const where: any = {};

  if (filters.status) where.status = filters.status;
  if (filters.marketerId) where.marketerId = filters.marketerId;
  if (filters.creatorId) {
    where.creators = { some: { creatorId: filters.creatorId } };
  }

  return prisma.order.findMany({
    where,
    include: {
      marketer: {
        select: {
          id: true,
          displayName: true,
          telegramUsername: true,
          avatarUrl: true,
          role: true,
        },
      },
      creators: {
        include: {
          creator: {
            select: {
              id: true,
              displayName: true,
              telegramUsername: true,
              avatarUrl: true,
              role: true,
            },
          },
        },
      },
      stages: { orderBy: { sortOrder: "asc" } },
      files: { select: { id: true, fileType: true, fileName: true } },
      _count: { select: { reports: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getOrderById(id: string) {
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      marketer: {
        select: {
          id: true,
          displayName: true,
          telegramUsername: true,
          avatarUrl: true,
          role: true,
        },
      },
      creators: {
        include: {
          creator: {
            select: {
              id: true,
              displayName: true,
              telegramUsername: true,
              avatarUrl: true,
              role: true,
            },
          },
        },
      },
      stages: { orderBy: { sortOrder: "asc" } },
      files: {
        include: {
          uploadedBy: {
            select: { id: true, displayName: true, telegramUsername: true },
          },
        },
      },
      reports: {
        include: {
          creator: {
            select: { id: true, displayName: true, telegramUsername: true },
          },
        },
        orderBy: { reportDate: "desc" },
      },
    },
  });

  if (!order) throw { statusCode: 404, message: "Заказ не найден" };
  return order;
}

// ===================== СОЗДАНИЕ =====================

interface CreateOrderInput {
  title: string;
  description?: string;
  deadline?: string;
  reminderDays?: number;
}

export async function createOrder(input: CreateOrderInput, marketerId: string) {
  // Создаём заказ с 5 этапами
  const defaultStages = [
    { name: StageName.STORYBOARD, sortOrder: 1 },
    { name: StageName.ANIMATION, sortOrder: 2 },
    { name: StageName.EDITING, sortOrder: 3 },
    { name: StageName.REVIEW, sortOrder: 4 },
    { name: StageName.COMPLETED, sortOrder: 5 },
  ];

  return prisma.order.create({
    data: {
      title: input.title,
      description: input.description,
      deadline: input.deadline ? new Date(input.deadline) : null,
      reminderDays: input.reminderDays || 2,
      marketerId,
      stages: {
        create: defaultStages,
      },
    },
    include: {
      marketer: {
        select: {
          id: true,
          displayName: true,
          telegramUsername: true,
          avatarUrl: true,
          role: true,
        },
      },
      stages: { orderBy: { sortOrder: "asc" } },
    },
  });
}

// ===================== ОБНОВЛЕНИЕ =====================

interface UpdateOrderInput {
  title?: string;
  description?: string;
  deadline?: string;
  reminderDays?: number;
}

export async function updateOrder(
  id: string,
  input: UpdateOrderInput,
  userId: string,
  userRole: UserRole
) {
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) throw { statusCode: 404, message: "Заказ не найден" };

  // Только маркетолог-создатель или админ
  if (userRole !== UserRole.ADMIN && order.marketerId !== userId) {
    throw { statusCode: 403, message: "Только создатель заказа может его редактировать" };
  }

  return prisma.order.update({
    where: { id },
    data: {
      title: input.title,
      description: input.description,
      deadline: input.deadline ? new Date(input.deadline) : undefined,
      reminderDays: input.reminderDays,
    },
  });
}

// ===================== УДАЛЕНИЕ =====================

export async function deleteOrder(
  id: string,
  userId: string,
  userRole: UserRole
) {
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) throw { statusCode: 404, message: "Заказ не найден" };

  if (userRole !== UserRole.ADMIN && order.marketerId !== userId) {
    throw { statusCode: 403, message: "Только создатель заказа может его удалить" };
  }

  return prisma.order.delete({ where: { id } });
}

// ===================== СМЕНА СТАТУСА (КАНБАН) =====================

export async function updateOrderStatus(
  id: string,
  newStatus: OrderStatus,
  userId: string,
  userRole: UserRole
) {
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) throw { statusCode: 404, message: "Заказ не найден" };

  // DONE может поставить только маркетолог / лид-креатор / админ
  if (
    newStatus === OrderStatus.DONE &&
    ![UserRole.MARKETER, UserRole.LEAD_CREATOR, UserRole.ADMIN].includes(userRole)
  ) {
    throw {
      statusCode: 403,
      message: "Только маркетолог или главный креатор может утвердить заказ",
    };
  }

  return prisma.order.update({
    where: { id },
    data: { status: newStatus },
  });
}

// ===================== КРЕАТОРЫ НА ЗАКАЗЕ =====================

export async function addCreator(
  orderId: string,
  creatorId: string,
  addedById: string,
  userRole: UserRole,
  isLead: boolean = false
) {
  // Креатор может добавить только себя
  if (
    userRole === UserRole.CREATOR &&
    creatorId !== addedById
  ) {
    throw { statusCode: 403, message: "Креатор может добавить только себя" };
  }

  // Проверяем что пользователь — креатор или лид-креатор
  const creator = await prisma.user.findUnique({ where: { id: creatorId } });
  if (
    !creator ||
    ![UserRole.CREATOR, UserRole.LEAD_CREATOR].includes(creator.role)
  ) {
    throw { statusCode: 400, message: "Пользователь не является креатором" };
  }

  // Если заказ был NEW — переводим в IN_PROGRESS
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw { statusCode: 404, message: "Заказ не найден" };

  const [assignment] = await prisma.$transaction([
    prisma.orderCreator.create({
      data: { orderId, creatorId, addedById, isLead },
      include: {
        creator: {
          select: {
            id: true,
            displayName: true,
            telegramUsername: true,
            avatarUrl: true,
            role: true,
          },
        },
      },
    }),
    // Автоматически переводим в IN_PROGRESS при назначении первого креатора
    ...(order.status === OrderStatus.NEW
      ? [prisma.order.update({ where: { id: orderId }, data: { status: OrderStatus.IN_PROGRESS } })]
      : []),
  ]);

  return assignment;
}

export async function removeCreator(
  orderId: string,
  creatorId: string,
  removedById: string,
  userRole: UserRole
) {
  const assignment = await prisma.orderCreator.findUnique({
    where: { orderId_creatorId: { orderId, creatorId } },
  });

  if (!assignment) {
    throw { statusCode: 404, message: "Креатор не назначен на этот заказ" };
  }

  // Маркетолог / админ — удаляет любого
  // Креатор — только тех, кого сам добавил
  if (
    userRole === UserRole.CREATOR &&
    assignment.addedById !== removedById
  ) {
    throw {
      statusCode: 403,
      message: "Вы можете удалить только тех креаторов, которых сами добавили",
    };
  }

  return prisma.orderCreator.delete({
    where: { orderId_creatorId: { orderId, creatorId } },
  });
}
