// src/theme/colors.ts
// Design system color tokens

export const Colors = {
  // Backgrounds
  background: '#0A0A1A',
  surface: '#12122A',
  surfaceElevated: '#1A1A36',
  surfaceBorder: '#2A2A4A',

  // Accent
  primary: '#6C63FF',
  primaryLight: '#8B85FF',
  primaryDark: '#4C43DF',
  primaryGlow: 'rgba(108, 99, 255, 0.25)',

  // Secondary
  secondary: '#FF6584',
  secondaryLight: '#FF85A0',

  // Semantic
  success: '#00D4AA',
  successDark: '#00A88A',
  warning: '#FFB800',
  error: '#FF4757',
  errorDark: '#CC3344',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#A0A0C0',
  textMuted: '#606080',
  textDisabled: '#404060',

  // FAB colors
  fabSend: '#6C63FF',
  fabReceive: '#00D4AA',

  // Gradients (as arrays for LinearGradient)
  gradientPrimary: ['#6C63FF', '#4C43DF'] as const,
  gradientSecondary: ['#FF6584', '#CC3344'] as const,
  gradientSuccess: ['#00D4AA', '#00A88A'] as const,
  gradientCard: ['#1A1A36', '#12122A'] as const,
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  round: 100,
};

export const FontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  heading: 28,
};
