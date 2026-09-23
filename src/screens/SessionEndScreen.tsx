import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppButton } from '../components/AppButton';
import type { SessionSummary } from '../domain/types';
import { palette, radius } from '../theme/tokens';

export function SessionEndScreen({ summary, onHome, onContinue }: { summary: SessionSummary; onHome: () => void; onContinue: () => void }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Session Complete</Text>
        <Text style={styles.title}>这一轮完成了</Text>
        <Text style={styles.subtitle}>你的 get、收藏和批注都已经写入本地数据库。</Text>
        <View style={styles.grid}>
          <Metric label="浏览" value={summary.seen} />
          <Metric label="get" value={summary.got} />
          <Metric label="收藏" value={summary.favorites} />
          <Metric label="批注" value={summary.annotations} />
        </View>
        <View style={styles.actions}>
          <AppButton label="继续下一轮" icon="refresh-outline" onPress={onContinue} />
          <AppButton label="返回首页" icon="home-outline" variant="light" onPress={onHome} />
        </View>
      </View>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 18, justifyContent: 'center', backgroundColor: palette.paper },
  card: { borderRadius: radius.xl, backgroundColor: palette.paperElevated, padding: 24, borderWidth: 1, borderColor: palette.line, gap: 14 },
  eyebrow: { color: palette.inkMuted, textTransform: 'uppercase', fontWeight: '900', letterSpacing: 1.2, fontSize: 12 },
  title: { color: palette.ink, fontSize: 39, lineHeight: 44, fontWeight: '900', letterSpacing: -1.3 },
  subtitle: { color: palette.inkMuted, fontSize: 15, lineHeight: 23 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  metric: { width: '47.8%', borderRadius: radius.lg, backgroundColor: palette.paperSoft, padding: 15 },
  metricValue: { color: palette.ink, fontSize: 30, fontWeight: '900' },
  metricLabel: { color: palette.inkMuted, fontSize: 12, fontWeight: '800' },
  actions: { gap: 10, marginTop: 10 },
});
