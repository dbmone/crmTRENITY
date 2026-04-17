export type UserRole = "MARKETER" | "HEAD_MARKETER" | "CREATOR" | "LEAD_CREATOR" | "HEAD_CREATOR" | "ADMIN";

export type PermissionKey =
  | "create_order" | "approve_review" | "approve_order" | "access_admin"
  | "approve_user" | "reject_user" | "block_user" | "restore_user"
  | "pre_approve_user" | "manage_team_lead" | "change_user_role" | "submit_report";

export interface User {
  id: string;
  displayName: string;
  telegramUsername: string | null;
  role: UserRole;
  avatarUrl: string | null;
  guideSeenAt?: string | null;
  permissions?: Record<PermissionKey, boolean>;
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
  revisionRound: number;
  awaitingClientApproval: boolean;
  clientApprovalSkipped: boolean;
  clientApprovedAt: string | null;
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
  mimeType: string;
  uploadedAt: string;
  uploadedBy?: User;
  telegramFileId?: string | null;
  telegramChatId?: string | null;
  telegramMsgId?: number | null;
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

export const KANBAN_COLUMNS: { status: OrderStatus; label: string; color: string }[] = [
  { status: "NEW", label: "Новые", color: "blue" },
  { status: "IN_PROGRESS", label: "В работе", color: "amber" },
  { status: "ON_REVIEW", label: "На правках", color: "purple" },
  { status: "DONE", label: "Готово", color: "green" },
  { status: "ARCHIVED", label: "Архив", color: "muted" },
];

export const STAGE_LABELS: Record<StageName, string> = {
  STORYBOARD: "Раскадровка",
  ANIMATION: "Анимация",
  EDITING: "Монтаж",
  REVIEW: "На правках",
  COMPLETED: "Видео готово",
};

export type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH";

export interface TaskSubtask {
  id: string;
  taskId: string;
  title: string;
  done: boolean;
  sortOrder: number;
}

export interface Task {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  aiGenerated: boolean;
  createdAt: string;
  updatedAt: string;
  subtasks: TaskSubtask[];
}

export interface ParsedTask {
  title: string;
  description?: string;
  priority: TaskPriority;
  subtasks: string[];
  rawText: string;
}

export interface OrderComment {
  id: string;
  orderId: string;
  text: string;
  source?: "WEB" | "TELEGRAM" | string;
  createdAt: string;
  author: User;
}

export interface Notification {
  id: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
  orderId?: string;
  order?: { id: string; title: string };
}

export interface UserProfile extends User {
  teamLeadId?: string | null;
  teamLead?: User | null;
  subordinates?: User[];
  status?: string;
  _count?: { createdOrders: number; assignments: number };
}
