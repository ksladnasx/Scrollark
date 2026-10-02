import type { CardRecord } from '../domain/types';
import { masteryColors } from '../theme/tokens';

export type ReviewStatus = {
  key: 'unread' | 'recent' | 'due' | 'mastered' | 'fuzzy' | 'forgot';
  label: string;
  color: string;
};

const unreadColor = '#9A948A';

// 卡片当前的复习状态：与复习 Tab 的四状态仪表同一口径 ——
// 按「最近一次反馈」划分（记得 → 已掌握，模糊记得 → 巩固中，不记得 → 遗忘，未评级 → 新近记忆）；
// 到期待复习是调度层面的瞬时状态，优先展示。
export function cardReviewStatus(card: Pick<CardRecord, 'isGot' | 'mastery' | 'nextReviewAt' | 'reviewStage'>): ReviewStatus {
  if (!card.isGot) return { key: 'unread', label: '未 GET', color: unreadColor };
  if (card.mastery === null || card.mastery === undefined) return { key: 'recent', label: '新近记忆', color: '#526B78' };
  if (card.nextReviewAt && card.nextReviewAt <= new Date().toISOString()) return { key: 'due', label: '待复习', color: masteryColors[2] };
  if (card.mastery === 3) return { key: 'mastered', label: '已掌握', color: masteryColors[3] };
  if (card.mastery === 2) return { key: 'fuzzy', label: '巩固中', color: masteryColors[2] };
  return { key: 'forgot', label: '遗忘', color: masteryColors[1] };
}

// 下次复习时间的人类表达：今天/明天用词，其余显示日期。
export function formatNextReview(nextReviewAt: string | null): string {
  if (!nextReviewAt) return '未安排';
  const target = new Date(nextReviewAt);
  if (Number.isNaN(target.getTime())) return '未安排';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(target);
  day.setHours(0, 0, 0, 0);
  const diff = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  if (diff <= 0) return '今天到期';
  if (diff === 1) return '明天';
  return `${target.getMonth() + 1}/${target.getDate()}`;
}
