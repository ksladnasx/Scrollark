export const palette = {
  ink: '#171611',
  inkMuted: '#6E6A5E',
  paper: '#F7F1E6',
  paperElevated: '#FFF9EE',
  paperSoft: '#EFE6D5',
  line: '#DED2BE',
  accent: '#11110F',
  accentSoft: '#D6C2A0',
  sage: '#87927C',
  blue: '#526B78',
  red: '#8E5148',
  white: '#FFFFFF',
  dark: '#11110F',
  darkSoft: '#201F1A',
};

export const lightTheme = {
  dark: false,
  ink: palette.ink,
  inkMuted: palette.inkMuted,
  paper: palette.paper,
  paperElevated: palette.paperElevated,
  paperSoft: palette.paperSoft,
  line: palette.line,
  accent: palette.accent,
  accentSoft: palette.accentSoft,
  sage: palette.sage,
  blue: palette.blue,
  red: palette.red,
  white: palette.white,
  card: '#FFFFFF',
  tableHeader: '#EFE3D0',
  tableAlt: '#FBF7EF',
};

export const darkTheme = {
  dark: true,
  ink: '#F7F1E6',
  inkMuted: '#BEB4A3',
  paper: '#11110F',
  paperElevated: '#1B1A17',
  paperSoft: '#27231D',
  line: '#3B352A',
  accent: '#F1E5D1',
  accentSoft: '#7C6A4E',
  sage: '#A9B59B',
  blue: '#8EADBD',
  red: '#D28B81',
  white: '#FFFFFF',
  card: '#151412',
  tableHeader: '#332D23',
  tableAlt: '#211F1A',
};

export type AppTheme = typeof lightTheme;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  xxl: 40,
};

export const radius = {
  sm: 10,
  md: 16,
  lg: 24,
  xl: 34,
  pill: 999,
};

export const shadow = {
  soft: {
    shadowColor: '#2E2618',
    shadowOpacity: 0.12,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
    elevation: 6,
  },
};
