import type { DailyReport, Order, OrderComment, OrderFile, OrderStage, User } from "../types";

const DEMO_MARKETER: User = {
  id: "tour-demo-marketer",
  displayName: "Алина",
  telegramUsername: "alina_marketing",
  role: "MARKETER",
  avatarUrl: null,
};

const DEMO_CREATOR: User = {
  id: "tour-demo-creator",
  displayName: "Илья",
  telegramUsername: "ilya_creator",
  role: "CREATOR",
  avatarUrl: null,
};

const DEMO_LEAD_CREATOR: User = {
  id: "tour-demo-lead",
  displayName: "Марина",
  telegramUsername: "marina_lead",
  role: "LEAD_CREATOR",
  avatarUrl: null,
};

const DEMO_STAGES: OrderStage[] = [
  {
    id: "tour-stage-storyboard",
    orderId: "tour-demo-order",
    name: "STORYBOARD",
    status: "DONE",
    startedAt: "2026-04-15T09:00:00.000Z",
    completedAt: "2026-04-15T12:30:00.000Z",
    sortOrder: 1,
    revisionRound: 0,
    awaitingClientApproval: false,
    clientApprovalSkipped: false,
    clientApprovedAt: "2026-04-15T14:00:00.000Z",
  },
  {
    id: "tour-stage-animation",
    orderId: "tour-demo-order",
    name: "ANIMATION",
    status: "IN_PROGRESS",
    startedAt: "2026-04-16T09:30:00.000Z",
    completedAt: null,
    sortOrder: 2,
    revisionRound: 0,
    awaitingClientApproval: false,
    clientApprovalSkipped: false,
    clientApprovedAt: null,
  },
  {
    id: "tour-stage-editing",
    orderId: "tour-demo-order",
    name: "EDITING",
    status: "PENDING",
    startedAt: null,
    completedAt: null,
    sortOrder: 3,
    revisionRound: 0,
    awaitingClientApproval: false,
    clientApprovalSkipped: false,
    clientApprovedAt: null,
  },
  {
    id: "tour-stage-review",
    orderId: "tour-demo-order",
    name: "REVIEW",
    status: "PENDING",
    startedAt: null,
    completedAt: null,
    sortOrder: 4,
    revisionRound: 0,
    awaitingClientApproval: false,
    clientApprovalSkipped: false,
    clientApprovedAt: null,
  },
  {
    id: "tour-stage-completed",
    orderId: "tour-demo-order",
    name: "COMPLETED",
    status: "PENDING",
    startedAt: null,
    completedAt: null,
    sortOrder: 5,
    revisionRound: 0,
    awaitingClientApproval: false,
    clientApprovalSkipped: false,
    clientApprovedAt: null,
  },
];

const DEMO_FILES: OrderFile[] = [
  {
    id: "tour-file-tz-note",
    fileType: "TZ",
    fileName: "Нужно собрать ролик 15–20 секунд с ярким первым кадром и призывом записаться на консультацию.",
    fileSize: 182,
    mimeType: "text/plain",
    uploadedAt: "2026-04-15T10:15:00.000Z",
    uploadedBy: DEMO_MARKETER,
  },
  {
    id: "tour-file-tz-pdf",
    fileType: "TZ",
    fileName: "Референсы и пожелания клиента.pdf",
    fileSize: 248000,
    mimeType: "application/pdf",
    uploadedAt: "2026-04-15T10:20:00.000Z",
    uploadedBy: DEMO_MARKETER,
  },
  {
    id: "tour-file-storyboard",
    fileType: "STORYBOARD",
    fileName: "Раскадровка_v2.pdf",
    fileSize: 624000,
    mimeType: "application/pdf",
    uploadedAt: "2026-04-16T11:10:00.000Z",
    uploadedBy: DEMO_LEAD_CREATOR,
  },
  {
    id: "tour-file-other",
    fileType: "OTHER",
    fileName: "Список правок_после созвона.docx",
    fileSize: 182000,
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    uploadedAt: "2026-04-16T15:45:00.000Z",
    uploadedBy: DEMO_MARKETER,
  },
];

const DEMO_REPORTS: DailyReport[] = [
  {
    id: "tour-report-1",
    reportText: "Собрал черновую анимацию и обновил раскадровку после комментариев маркетолога.",
    reportDate: "2026-04-16T00:00:00.000Z",
    submittedAt: "2026-04-16T18:10:00.000Z",
    creator: DEMO_CREATOR,
  },
];

export const TOUR_DEMO_ORDER: Order = {
  id: "tour-demo-order",
  title: "Демо-заказ: рекламный ролик для запуска",
  description:
    "Сделать короткий ролик для соцсетей. Тон: уверенный, живой, без перегруза текстом. В конце должен быть явный призыв написать в Telegram.",
  status: "IN_PROGRESS",
  deadline: "2026-04-19T18:00:00.000Z",
  reminderDays: 2,
  price: null,
  hasTax: false,
  marketerId: DEMO_MARKETER.id,
  createdAt: "2026-04-15T09:00:00.000Z",
  updatedAt: "2026-04-16T18:10:00.000Z",
  marketer: DEMO_MARKETER,
  creators: [
    {
      id: "tour-assignment-1",
      orderId: "tour-demo-order",
      creatorId: DEMO_CREATOR.id,
      addedById: DEMO_MARKETER.id,
      isLead: false,
      assignedAt: "2026-04-15T09:05:00.000Z",
      creator: DEMO_CREATOR,
    },
    {
      id: "tour-assignment-2",
      orderId: "tour-demo-order",
      creatorId: DEMO_LEAD_CREATOR.id,
      addedById: DEMO_MARKETER.id,
      isLead: true,
      assignedAt: "2026-04-15T09:06:00.000Z",
      creator: DEMO_LEAD_CREATOR,
    },
  ],
  stages: DEMO_STAGES,
  files: DEMO_FILES,
  reports: DEMO_REPORTS,
  _count: { reports: DEMO_REPORTS.length },
};

export const TOUR_DEMO_COMMENTS: OrderComment[] = [
  {
    id: "tour-comment-1",
    orderId: "tour-demo-order",
    text: "Сделайте первый кадр более цепляющим: клиент хочет, чтобы оффер считывался сразу.",
    source: "WEB",
    createdAt: "2026-04-15T11:20:00.000Z",
    author: DEMO_MARKETER,
  },
  {
    id: "tour-comment-2",
    orderId: "tour-demo-order",
    text: "Принято, сегодня обновлю раскадровку и прикреплю новую версию во вкладке файлов.",
    source: "TELEGRAM",
    createdAt: "2026-04-15T11:28:00.000Z",
    author: DEMO_CREATOR,
  },
];

export const TOUR_DEMO_USERS: User[] = [DEMO_MARKETER, DEMO_CREATOR, DEMO_LEAD_CREATOR];

export function isTourDemoOrder(order?: Pick<Order, "id"> | null) {
  return Boolean(order?.id?.startsWith("tour-demo-"));
}

function cloneUser(user: User): User {
  return { ...user };
}

function buildDemoCreators(currentUser?: User | null) {
  const isMarketingLike = Boolean(
    currentUser && ["MARKETER", "HEAD_MARKETER", "ADMIN", "HEAD_CREATOR"].includes(currentUser.role)
  );

  const primaryCreator = !isMarketingLike && currentUser ? cloneUser(currentUser) : cloneUser(DEMO_CREATOR);
  const leadCreator =
    currentUser?.role === "LEAD_CREATOR" ? cloneUser(currentUser) : cloneUser(DEMO_LEAD_CREATOR);

  const creators = [
    {
      id: "tour-assignment-1",
      orderId: "tour-demo-order",
      creatorId: primaryCreator.id,
      addedById: (isMarketingLike && currentUser ? currentUser.id : DEMO_MARKETER.id),
      isLead: currentUser?.role === "LEAD_CREATOR",
      assignedAt: "2026-04-15T09:05:00.000Z",
      creator: primaryCreator,
    },
  ];

  if (leadCreator.id !== primaryCreator.id) {
    creators.push({
      id: "tour-assignment-2",
      orderId: "tour-demo-order",
      creatorId: leadCreator.id,
      addedById: (isMarketingLike && currentUser ? currentUser.id : DEMO_MARKETER.id),
      isLead: true,
      assignedAt: "2026-04-15T09:06:00.000Z",
      creator: leadCreator,
    });
  }

  return creators;
}

export function createTourDemoOrder(currentUser?: User | null): Order {
  const isMarketingLike = Boolean(
    currentUser && ["MARKETER", "HEAD_MARKETER", "ADMIN", "HEAD_CREATOR"].includes(currentUser.role)
  );
  const marketer = isMarketingLike && currentUser ? cloneUser(currentUser) : cloneUser(DEMO_MARKETER);
  const creators = buildDemoCreators(currentUser);
  const reportAuthor = creators[0]?.creator ?? cloneUser(DEMO_CREATOR);

  return {
    ...TOUR_DEMO_ORDER,
    marketerId: marketer.id,
    marketer,
    creators,
    files: DEMO_FILES.map((file) => ({
      ...file,
      uploadedBy: file.uploadedBy?.id === DEMO_MARKETER.id ? marketer : file.uploadedBy,
    })),
    reports: DEMO_REPORTS.map((report) => ({
      ...report,
      creator: reportAuthor,
    })),
    _count: { reports: DEMO_REPORTS.length },
  };
}

export function createTourDemoComments(currentUser?: User | null): OrderComment[] {
  const order = createTourDemoOrder(currentUser);
  const marketer = order.marketer;
  const creator = order.creators[0]?.creator ?? cloneUser(DEMO_CREATOR);

  return [
    {
      id: "tour-comment-1",
      orderId: order.id,
      text: "Сделайте первый кадр более цепляющим: клиент хочет, чтобы оффер считывался сразу.",
      source: "WEB",
      createdAt: "2026-04-15T11:20:00.000Z",
      author: marketer,
    },
    {
      id: "tour-comment-2",
      orderId: order.id,
      text: "Принято, сегодня обновлю раскадровку и прикреплю новую версию во вкладке файлов.",
      source: "TELEGRAM",
      createdAt: "2026-04-15T11:28:00.000Z",
      author: creator,
    },
  ];
}

export function createTourDemoUsers(currentUser?: User | null): User[] {
  const order = createTourDemoOrder(currentUser);
  const users = [order.marketer, ...order.creators.map((item) => item.creator)];
  const seen = new Set<string>();
  return users.filter((user) => {
    if (seen.has(user.id)) return false;
    seen.add(user.id);
    return true;
  });
}
