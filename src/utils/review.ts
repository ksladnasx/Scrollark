import type { CardRecord } from '../domain/types';
import { masteryColors } from '../theme/tokens';

export type ReviewStatus = {
  key: 'unread' | 'recent' | 'due' | 'mastered' | 'strengthening';
  label: string;
  color: string;
};

const unreadColor = '#9A948A';

// 卡片当前的复习状态：GET 流程与复习流程共用的一套口径。
// 新近记忆 = 已 get 但还没在复习里评过级；之后按评级与档位流转。
export function cardReviewStatus(card: Pick<CardRecord, 'isGot' | 'mastery' | 'nextReviewAt' | 'reviewStage'>): ReviewStatus {
  if (!card.isGot) return { key: 'unread', label: '未 GET', color: unreadColor };
  if (card.mastery === null || card.mastery === undefined) return { key: 'recent', label: '新近记忆', color: '#526B78' };
  if (card.nextReviewAt && card.nextReviewAt <= new Date().toISOString()) return { key: 'due', label: '待复习', color: masteryColors[1] };
  if (card.reviewStage >= 3) return { key: 'mastered', label: '已掌握', color: masteryColors[3] };
  return { key: 'strengthening', label: '巩固中', color: masteryColors[2] };
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
