export function nowIso() {
  return new Date().toISOString();
}

export function startOfLocalDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function formatDayLabel(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

// 相对日时间：今天 / 昨天 / M月D日，统一带 HH:mm。用于「上次复习」等历史时间展示。
export function formatRelativeDayLabel(iso: string): string {
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return '';
  const day = startOfLocalDay(target);
  const today = startOfLocalDay();
  const diff = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  const time = `${String(target.getHours()).padStart(2, '0')}:${String(target.getMinutes()).padStart(2, '0')}`;
  if (diff <= 0) return `今天 ${time}`;
  if (diff === 1) return `昨天 ${time}`;
  return `${target.getMonth() + 1}月${target.getDate()}日 ${time}`;
}

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
