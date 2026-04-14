export type UserRole = "MARKETER" | "CREATOR" | "LEAD_CREATOR" | "ADMIN";

export interface User {
  id: string;
  displayName: string;
  telegramUsername: string | null;
  role: UserRole;
  avatarUrl: string | null;
}

export type OrderStatus = "NEW" | "IN_PROGRESS" | "ON_REVIEW" | "DONE" | "ARCHIVED";

export type StageName = "STORYBOARD" | "ANIMATION" | "EDITING" | "REVIEW" | "COMPLETED";
export type StageStatus = "PENDING" | "IN_PROGRESS" | "DONE";

export interface OrderStage {
  id: string;
  orderId: string;
  name: StageName;
  status: StageStatus;
  startedAt: string | null;
  completedAt: string | null;
  sortOrder: number;
}

export interface OrderCreator {
  id: string;
  orderId: string;
  creatorId: string;
  addedById: string;
  isLead: boolean;
  assignedAt: string;
  creator: User;
}

export interface OrderFile {
  id: string;
  fileType: string;
  fileName: string;
  fileSize: number;
  uploadedAt: string;
  uploadedBy?: User;
}

export interface DailyReport {
  id: string;
  reportText: string;
  reportDate: string;
  submittedAt: string;
  creator: User;
}

export interface Order {
  id: string;
  title: string;
  description: string | null;
  status: OrderStatus;
  deadline: string | null;
  reminderDays: number;
  marketerId: string;
  createdAt: string;
  updatedAt: string;
  marketer: User;
  creators: OrderCreator[];
  stages: OrderStage[];
  files: OrderFile[];
  reports?: DailyReport[];
  _count?: { reports: number };
}

// Колонки канбана
export const KANBAN_COLUMNS: { status: OrderStatus; label: string; color: string }[] = [
  { status: "NEW", label: "Новые", color: "brand" },
  { status: "IN_PROGRESS", label: "В работе", color: "blue" },
  { status: "ON_REVIEW", label: "На правках", color: "amber" },
  { status: "DONE", label: "Готово", color: "green" },
];

export const STAGE_LABELS: Record<StageName, string> = {
  STORYBOARD: "Раскадровка",
  ANIMATION: "Анимация",
  EDITING: "Монтаж",
  REVIEW: "На правках",
  COMPLETED: "Видео готово",
};
