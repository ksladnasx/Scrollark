import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TabKey } from '../domain/types';
import { useAppTheme } from '../theme/ThemeContext';
import { shadow } from '../theme/tokens';

// 底部一级导航（iOS 风格）：悬浮圆角容器，脱离屏幕底边，留出 Home Indicator。
// 首页 / 复习 / 学习 / 知识库；收藏与批注、设置分别从学习页和首页右上角进入。
const tabBarItems: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap; activeIcon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'home', label: '首页', icon: 'home-outline', activeIcon: 'home' },
  { key: 'review', label: '复习', icon: 'repeat-outline', activeIcon: 'repeat' },
  { key: 'stats', label: '学习', icon: 'school-outline', activeIcon: 'school' },
  { key: 'knowledge', label: '知识库', icon: 'library-outline', activeIcon: 'library' },
];

type Props = {
  active: TabKey;
  onChange: (tab: TabKey) => void;
};

export function TabBar({ active, onChange }: Props) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  // 悬浮在内容之上：与底边保持间距，手势导航机型再抬升一点。
  const bottomOffset = Math.max(insets.bottom, 8) + 10;
  return (
    <View pointerEvents="box-none" style={[styles.floatWrap, { bottom: bottomOffset }]}>
      <View
        style={[
          styles.bar,
          {
            backgroundColor: theme.dark ? 'rgba(26,25,21,0.9)' : 'rgba(255,249,238,0.94)',
            borderColor: theme.line,
          },
        ]}
      >
        {tabBarItems.map((item) => {
          const focused = active === item.key;
          const color = focused ? theme.ink : theme.inkMuted;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: focused }}
              onPress={() => onChange(item.key)}
              style={({ pressed }) => [styles.item, pressed && styles.pressed]}
            >
              <Ionicons name={focused ? item.activeIcon : item.icon} size={20} color={color} />
              <Text style={[styles.label, { color }]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  floatWrap: {
    position: 'absolute',
    left: 18,
    right: 18,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 9,
    paddingHorizontal: 8,
    ...shadow.soft,
  },
  item: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 4 },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.94 }] },
});
