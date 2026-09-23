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
  style?: ViewStyle;
};

export function AppButton({ label, onPress, icon, variant = 'dark', loading, style }: Props) {
  const theme = useAppTheme();
  const foreground = variant === 'dark' ? theme.paper : theme.ink;
  const background = variant === 'dark' ? theme.accent : variant === 'light' ? theme.paperElevated : 'rgba(255,255,255,0.22)';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [styles.base, styles[variant], { backgroundColor: background }, variant === 'light' && { borderWidth: 1, borderColor: theme.line }, pressed && styles.pressed, style]}
    >
      {loading ? <ActivityIndicator color={foreground} /> : null}
      {!loading && icon ? <Ionicons name={icon} size={18} color={foreground} /> : null}
      <Text style={[styles.label, { color: foreground }]}>{label}</Text>
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
  label: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  darkLabel: {
    color: palette.paper,
  },
  lightLabel: {
    color: palette.ink,
  },
});

