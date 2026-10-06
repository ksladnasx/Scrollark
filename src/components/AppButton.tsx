import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type GestureResponderEvent, type ViewStyle } from 'react-native';
import { useAppTheme } from '../theme/ThemeContext';
import { palette, radius } from '../theme/tokens';

type Props = {
  label: string;
  onPress?: (event: GestureResponderEvent) => void;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: 'dark' | 'light' | 'ghost';
  loading?: boolean;
  // 置灰不可点（如「确定导入」在未选文件时）；loading 仍然独立生效。
  disabled?: boolean;
  // 紧凑规格：用于卡片内右列的成组小按钮。
  compact?: boolean;
  style?: ViewStyle;
};

export function AppButton({ label, onPress, icon, variant = 'dark', loading, disabled, compact, style }: Props) {
  const theme = useAppTheme();
  const foreground = variant === 'dark' ? theme.paper : theme.ink;
  const background = variant === 'dark' ? theme.accent : variant === 'light' ? theme.paperElevated : 'rgba(255,255,255,0.22)';
  const inactive = loading || disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(inactive), busy: Boolean(loading) }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [styles.base, styles[variant], compact && styles.compact, { backgroundColor: background }, variant === 'light' && { borderWidth: 1, borderColor: theme.line }, pressed && !inactive && styles.pressed, inactive && styles.inactive, style]}
    >
      {loading ? <ActivityIndicator color={foreground} /> : null}
      {!loading && icon ? <Ionicons name={icon} size={compact ? 15 : 18} color={foreground} /> : null}
      <Text style={[styles.label, compact && styles.compactLabel, { color: foreground }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  compact: {
    minHeight: 40,
    paddingHorizontal: 12,
    gap: 6,
  },
  dark: {
    backgroundColor: palette.accent,
  },
  light: {
    backgroundColor: 'rgba(255,249,238,0.86)',
  },
  ghost: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  pressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.86,
  },
  inactive: {
    opacity: 0.45,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  compactLabel: {
    fontSize: 13,
  },
  darkLabel: {
    color: palette.paper,
  },
  lightLabel: {
    color: palette.ink,
  },
});

