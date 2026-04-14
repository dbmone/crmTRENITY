import { PrismaClient, OrderStatus, UserRole, StageName } from "@prisma/client";

const prisma = new PrismaClient();

// ===================== Общий include для заказов =====================

const orderInclude = {
  marketer: {
    select: {
      id: true, displayName: true, telegramUsername: true,
      avatarUrl: true, role: true, teamLeadId: true,
    },
  },
  creators: {
    include: {
      creator: {
        select: {
          id: true, displayName: true, telegramUsername: true,
          avatarUrl: true, role: true, teamLeadId: true,
        },
      },
    },
  },
  stages: { orderBy: { sortOrder: "asc" as const } },
  files: { select: { id: true, fileType: true, fileName: true, fileSize: true, uploadedAt: true } },
  _count: { select: { reports: true, comments: true } },
};

// ===================== ПОЛУЧЕНИЕ С ПОИСКОМ И ПАГИНАЦИЕЙ =====================

interface OrderFilters {
  status?: OrderStatus;
  marketerId?: string;
  creatorId?: string;
  search?: string;
  page?: number;
  limit?: number;
  includeArchived?: boolean;
}

export async function getOrders(filters: OrderFilters) {
  const page = filters.page || 1;
  const limit = filters.limit || 50;
  const skip = (page - 1) * limit;

  const where: any = {};

  // По умолчанию не показываем архив
  if (!filters.includeArchived) {
    if (filters.status) {
      where.status = filters.status;
    } else {
      where.status = { not: OrderStatus.ARCHIVED };
    }
  } else if (filters.status) {
    where.status = filters.status;
  }

  if (filters.marketerId) where.marketerId = filters.marketerId;
  if (filters.creatorId) {
    where.creators = { some: { creatorId: filters.creatorId } };
  }
  if (filters.search) {
    where.title = { contains: filters.search, mode: "insensitive" };
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: orderInclude,
      orderBy: { updatedAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.order.count({ where }),
  ]);

  return { orders, total, page, limit, pages: Math.ceil(total / limit) };
}

export async function getOrderById(id: string) {
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      ...orderInclude,
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
            select: { id: true, displayName: true, telegramUsername: true, avatarUrl: true },
          },
        },
        orderBy: { reportDate: "desc" },
        take: 20,
      },
      comments: {
        include: {
          author: {
            select: { id: true, displayName: true, telegramUsername: true, avatarUrl: true, role: true },
          },
        },
        orderBy: { createdAt: "asc" },
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
      stages: { create: defaultStages },
    },
    include: orderInclude,
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

  if (
    userRole !== UserRole.ADMIN &&
    userRole !== UserRole.HEAD_MARKETER &&
    order.marketerId !== userId
  ) {
    throw { statusCode: 403, message: "Нет доступа к редактированию" };
  }

  return prisma.order.update({
    where: { id },
    data: {
      title: input.title,
      description: input.description,
      deadline: input.deadline ? new Date(input.deadline) : undefined,
      reminderDays: input.reminderDays,
    },
    include: orderInclude,
  });
}

// ===================== УДАЛЕНИЕ =====================

export async function deleteOrder(id: string, userId: string, userRole: UserRole) {
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) throw { statusCode: 404, message: "Заказ не найден" };

  if (
    userRole !== UserRole.ADMIN &&
    userRole !== UserRole.HEAD_MARKETER &&
    order.marketerId !== userId
  ) {
    throw { statusCode: 403, message: "Нет доступа к удалению" };
  }

  return prisma.order.delete({ where: { id } });
}

// ===================== СМЕНА СТАТУСА =====================

export async function updateOrderStatus(
  id: string,
  newStatus: OrderStatus,
  userId: string,
  userRole: UserRole
) {
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) throw { statusCode: 404, message: "Заказ не найден" };

  // DONE может ставить только маркетолог+ или лид-креатор
  if (
    newStatus === OrderStatus.DONE &&
    ![UserRole.ADMIN, UserRole.HEAD_MARKETER, UserRole.MARKETER, UserRole.LEAD_CREATOR].includes(userRole)
  ) {
    throw { statusCode: 403, message: "Только маркетолог или главный креатор может утвердить заказ" };
  }

  return prisma.order.update({
    where: { id },
    data: { status: newStatus },
    include: orderInclude,
  });
}

// ===================== АРХИВАЦИЯ =====================

export async function archiveOrder(id: string, userId: string, userRole: UserRole) {
  return updateOrderStatus(id, OrderStatus.ARCHIVED, userId, userRole);
}

export async function unarchiveOrder(id: string, userId: string, userRole: UserRole) {
  return updateOrderStatus(id, OrderStatus.DONE, userId, userRole);
}

// ===================== КРЕАТОРЫ =====================

export async function addCreator(
  orderId: string,
  creatorId: string,
  addedById: string,
  userRole: UserRole,
  isLead: boolean = false
) {
  if (userRole === UserRole.CREATOR && creatorId !== addedById) {
    throw { statusCode: 403, message: "Креатор может добавить только себя" };
  }

  const creator = await prisma.user.findUnique({ where: { id: creatorId } });
  if (
    !creator ||
    ![UserRole.CREATOR, UserRole.LEAD_CREATOR].includes(creator.role)
  ) {
    throw { statusCode: 400, message: "Пользователь не является креатором" };
  }

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw { statusCode: 404, message: "Заказ не найден" };

  const [assignment] = await prisma.$transaction([
    prisma.orderCreator.create({
      data: { orderId, creatorId, addedById, isLead },
      include: {
        creator: {
          select: {
            id: true, displayName: true, telegramUsername: true,
            avatarUrl: true, role: true, teamLeadId: true,
          },
        },
      },
    }),
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

  if (!assignment) throw { statusCode: 404, message: "Креатор не назначен" };

  if (
    userRole === UserRole.CREATOR &&
    assignment.addedById !== removedById
  ) {
    throw { statusCode: 403, message: "Вы можете удалить только тех, кого сами добавили" };
  }

  return prisma.orderCreator.delete({
    where: { orderId_creatorId: { orderId, creatorId } },
  });
}
