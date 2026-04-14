/**
 * Рассчитывает интервал напоминаний на основе оставшегося времени до дедлайна.
 * - ≤ 3 дня → каждый день
 * - 4-7 дней → каждые 2 дня
 * - > 7 дней → каждые 3 дня
 */
export function calcReminderInterval(deadline: Date): number {
  const now = new Date();
  const diffMs = deadline.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 3) return 1;
  if (diffDays <= 7) return 2;
  return 3;
}

/**
 * Проверяет, нужно ли сегодня отправить напоминание.
 * Считает от даты создания заказа.
 */
export function shouldRemindToday(
  createdAt: Date,
  deadline: Date,
  reminderDays: number
): boolean {
  const now = new Date();
  const diffMs = now.getTime() - createdAt.getTime();
  const daysSinceCreated = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // Пересчитываем интервал динамически по оставшемуся времени
  const interval = calcReminderInterval(deadline);

  return daysSinceCreated > 0 && daysSinceCreated % interval === 0;
}

/**
 * Форматирует оставшееся время до дедлайна
 */
export function formatDeadline(deadline: Date): string {
  const now = new Date();
  const diffMs = deadline.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return `Просрочено на ${Math.abs(diffDays)} дн.`;
  if (diffDays === 0) return "Сегодня!";
  if (diffDays === 1) return "Завтра";
  if (diffDays <= 4) return `${diffDays} дня`;
  return `${diffDays} дней`;
}
