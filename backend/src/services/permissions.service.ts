import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

// ==================== КЛЮЧИ И МЕТАДАННЫЕ ====================

export const PERMISSION_KEYS = [
  "create_order",
  "approve_review",
  "approve_order",
  "access_admin",
  "approve_user",
  "reject_user",
  "block_user",
  "restore_user",
  "pre_approve_user",
  "manage_team_lead",
  "change_user_role",
  "submit_report",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  create_order:     "Создание заказов",
  approve_review:   "Утверждение этапа REVIEW",
  approve_order:    "Завершение заказа (DONE)",
  access_admin:     "Доступ к панели управления",
  approve_user:     "Одобрение заявок на регистрацию",
  reject_user:      "Отклонение заявок",
  block_user:       "Блокировка пользователей",
  restore_user:     "Восстановление заблокированных",
  pre_approve_user: "Pre-approve по TG нику",
  manage_team_lead: "Назначение тимлидов",
  change_user_role: "Изменение ролей пользователей",
  submit_report:    "Отправка ежедневных отчётов",
};

export const DEFAULT_ROLES: Record<PermissionKey, UserRole[]> = {
  create_order:     [UserRole.ADMIN, UserRole.HEAD_MARKETER, UserRole.MARKETER, UserRole.HEAD_CREATOR],
  approve_review:   [UserRole.ADMIN, UserRole.HEAD_MARKETER, UserRole.MARKETER, UserRole.LEAD_CREATOR],
  approve_order:    [UserRole.ADMIN, UserRole.HEAD_MARKETER, UserRole.MARKETER, UserRole.HEAD_CREATOR, UserRole.LEAD_CREATOR],
  access_admin:     [UserRole.ADMIN, UserRole.HEAD_MARKETER, UserRole.HEAD_CREATOR, UserRole.LEAD_CREATOR],
  approve_user:     [UserRole.ADMIN, UserRole.HEAD_MARKETER, UserRole.HEAD_CREATOR, UserRole.LEAD_CREATOR],
  reject_user:      [UserRole.ADMIN, UserRole.HEAD_MARKETER, UserRole.HEAD_CREATOR, UserRole.LEAD_CREATOR],
  block_user:       [UserRole.ADMIN],
  restore_user:     [UserRole.ADMIN, UserRole.HEAD_MARKETER, UserRole.HEAD_CREATOR],
  pre_approve_user: [UserRole.ADMIN, UserRole.HEAD_MARKETER, UserRole.HEAD_CREATOR],
  manage_team_lead: [UserRole.ADMIN, UserRole.HEAD_CREATOR, UserRole.HEAD_MARKETER, UserRole.LEAD_CREATOR],
  change_user_role: [UserRole.ADMIN, UserRole.HEAD_MARKETER, UserRole.HEAD_CREATOR, UserRole.LEAD_CREATOR],
  submit_report:    [UserRole.CREATOR, UserRole.LEAD_CREATOR, UserRole.HEAD_CREATOR, UserRole.ADMIN],
};

// ==================== КЭШ ====================

let permissionsCache: Map<string, UserRole[]> | null = null;

export async function loadPermissions() {
  const rows = await prisma.permission.findMany();
  permissionsCache = new Map();
  // Заполняем значениями по умолчанию
  for (const key of PERMISSION_KEYS) {
    permissionsCache.set(key, [...DEFAULT_ROLES[key]]);
  }
  // Перезаписываем значениями из БД (если есть)
  for (const row of rows) {
    permissionsCache.set(row.key, row.roles as UserRole[]);
  }
}

export function invalidateCache() {
  permissionsCache = null;
}

// ==================== ПРОВЕРКА ПРАВ ====================

export function getRoles(key: PermissionKey): UserRole[] {
  if (!permissionsCache) return DEFAULT_ROLES[key] ?? [];
  return permissionsCache.get(key) ?? DEFAULT_ROLES[key] ?? [];
}

/** Проверка по роли (без учёта индивидуальных настроек). ADMIN всегда проходит. */
export function hasRolePermission(role: UserRole, key: PermissionKey): boolean {
  if (role === UserRole.ADMIN) return true;
  return getRoles(key).includes(role);
}

/** Полная проверка с учётом индивидуальных override. */
export async function checkUserPermission(
  userId: string,
  role: UserRole,
  key: PermissionKey
): Promise<boolean> {
  // Индивидуальный override (grant/deny)
  const override = await prisma.userPermission.findUnique({
    where: { userId_permission: { userId, permission: key } },
  });
  if (override !== null) return override.granted;
  return hasRolePermission(role, key);
}

/** Все права пользователя (для включения в /me). */
export async function getUserEffectivePermissions(
  userId: string,
  role: UserRole
): Promise<Record<PermissionKey, boolean>> {
  const userPerms = await prisma.userPermission.findMany({ where: { userId } });
  const overrides = new Map(userPerms.map((p) => [p.permission, p.granted]));

  const result = {} as Record<PermissionKey, boolean>;
  for (const key of PERMISSION_KEYS) {
    result[key] = overrides.has(key) ? overrides.get(key)! : hasRolePermission(role, key);
  }
  return result;
}

/** Конфиг всех прав (для UI редактора). */
export async function getAllPermissionsConfig() {
  if (!permissionsCache) await loadPermissions();
  return PERMISSION_KEYS.map((key) => ({
    key,
    label: PERMISSION_LABELS[key],
    roles: getRoles(key),
    defaultRoles: DEFAULT_ROLES[key],
  }));
}
