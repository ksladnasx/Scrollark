import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type GestureResponderEvent, type ViewStyle } from 'react-native';
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
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [styles.base, styles[variant], pressed && styles.pressed, style]}
    >
      {loading ? <ActivityIndicator color={variant === 'dark' ? palette.paper : palette.ink} /> : null}
      {!loading && icon ? <Ionicons name={icon} size={18} color={variant === 'dark' ? palette.paper : palette.ink} /> : null}
      <Text style={[styles.label, variant === 'dark' ? styles.darkLabel : styles.lightLabel]}>{label}</Text>
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

