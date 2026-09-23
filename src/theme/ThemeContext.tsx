import React from 'react';
import { useColorScheme, type ColorSchemeName } from 'react-native';
import type { Settings, ThemeMode } from '../domain/types';
import { darkTheme, lightTheme, type AppTheme } from './tokens';

const ThemeContext = React.createContext<AppTheme>(lightTheme);

export function resolveAppTheme(mode: ThemeMode, systemScheme: ColorSchemeName): AppTheme {
  if (mode === 'dark') return darkTheme;
  if (mode === 'light') return lightTheme;
  return systemScheme === 'dark' ? darkTheme : lightTheme;
}

export function ThemeProvider({ settings, children }: { settings: Settings; children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const theme = React.useMemo(() => resolveAppTheme(settings.themeMode, systemScheme), [settings.themeMode, systemScheme]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  return React.useContext(ThemeContext);
}
