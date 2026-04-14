/**
 * Рассчитывает интервал напоминаний.
 * Чем ближе дедлайн — тем чаще.
 * Если человек просрочил отчёт — интервал сокращается.
 */
export function calcReminderInterval(deadline: Date, missedReports: number = 0): number {
  const now = new Date();
  const diffMs = deadline.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  let base: number;
  if (diffDays <= 0) base = 1;        // Просрочено — каждый день
  else if (diffDays <= 3) base = 1;    // ≤ 3 дня — каждый день
  else if (diffDays <= 7) base = 2;    // 4-7 дней — каждые 2 дня
  else base = 3;                        // > 7 дней — каждые 3 дня

  // Эскалация: пропущенные отчёты сокращают интервал
  if (missedReports >= 3) return 1;     // 3+ пропусков — каждый день
  if (missedReports >= 1 && base > 1) return base - 1;

  return base;
}

/**
 * Считает сколько отчётов пропущено подряд
 */
export function countMissedReports(
  lastReportDate: Date | null,
  reminderInterval: number
): number {
  if (!lastReportDate) return 999; // Ни одного отчёта
  const now = new Date();
  const diffMs = now.getTime() - lastReportDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, Math.floor(diffDays / reminderInterval) - 1);
}

export function formatDeadline(deadline: Date): string {
  const now = new Date();
  const diffMs = deadline.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return `🔴 Просрочено на ${Math.abs(diffDays)} дн.`;
  if (diffDays === 0) return "🔴 Сегодня!";
  if (diffDays === 1) return "🟡 Завтра";
  if (diffDays <= 3) return `🟡 ${diffDays} дня`;
  return `${diffDays} дней`;
}
