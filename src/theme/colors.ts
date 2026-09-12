// src/theme/colors.ts
// Design system color tokens for Flash Send (light + dark)

import { useSettingsStore } from '../store/settingsStore';

export interface Palette {
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceBorder: string;
  primary: string;
  primaryLight: string;
  primaryDark: string;
  primaryGlow: string;
  secondary: string;
  secondaryLight: string;
  success: string;
  successDark: string;
  warning: string;
  error: string;
  errorDark: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textDisabled: string;
  fabSend: string;
  fabReceive: string;
  gradientPrimary: readonly string[];
  gradientSecondary: readonly string[];
  gradientSuccess: readonly string[];
  gradientCard: readonly string[];
}

export const Colors: Palette = {
  // Backgrounds - white for most of the app, dark blue for navigation
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceElevated: '#F5F5F5',
  surfaceBorder: '#E0E0E0',

  // Dark Blue - primary color for navigation and accents
  primary: '#1E40AF', // DarkBlue
  primaryLight: '#3B82F6',
  primaryDark: '#1E3A8A',
  primaryGlow: 'rgba(30, 64, 175, 0.2)',

  // Secondary - same dark blue theme
  secondary: '#1E40AF',
  secondaryLight: '#3B82F6',

  // Semantic
  success: '#0E9F6E',
  successDark: '#057A55',
  warning: '#F59E0B',
  error: '#EF4444',
  errorDark: '#DC2626',

  // Text
  textPrimary: '#1F2937', // Dark gray for readability on white
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  textDisabled: '#D1D5DB',

  // FAB colors - royal blue with white icons
  fabSend: '#1E40AF',
  fabReceive: '#1E40AF',

  // Gradients (as arrays for LinearGradient)
  gradientPrimary: ['#1E40AF', '#1E3A8A'] as const,
  gradientSecondary: ['#1E40AF', '#1E3A8A'] as const,
  gradientSuccess: ['#0E9F6E', '#057A55'] as const,
  gradientCard: ['#FFFFFF', '#F5F5F5'] as const,
};

export const DarkColors: Palette = {
  // Backgrounds - dark navy to match brand
  background: '#0E1322',
  surface: '#151C31',
  surfaceElevated: '#1D2640',
  surfaceBorder: '#2C3A5C',

  // Dark Blue - kept for brand surfaces
  primary: '#1E40AF',
  primaryLight: '#5B8DEF',
  primaryDark: '#1E3A8A',
  primaryGlow: 'rgba(30, 64, 175, 0.35)',

  // Secondary
  secondary: '#3B82F6',
  secondaryLight: '#93B4F5',

  // Semantic
  success: '#2FBF8F',
  successDark: '#0E9F6E',
  warning: '#F5A623',
  error: '#F06464',
  errorDark: '#DC2626',

  // Text
  textPrimary: '#F2F4F7',
  textSecondary: '#AEB7CC',
  textMuted: '#7E89A3',
  textDisabled: '#3B4763',

  // FAB colors - royal blue with white icons
  fabSend: '#1E40AF',
  fabReceive: '#1E40AF',

  // Gradients (as arrays for LinearGradient)
  gradientPrimary: ['#1E40AF', '#1E3A8A'] as const,
  gradientSecondary: ['#1E40AF', '#1E3A8A'] as const,
  gradientSuccess: ['#2FBF8F', '#0E9F6E'] as const,
  gradientCard: ['#151C31', '#1D2640'] as const,
};

export type ThemeColors = Palette;

export function useColors(): ThemeColors {
  const darkMode = useSettingsStore((s) => s.darkMode);
  return darkMode ? DarkColors : Colors;
}

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

export const FontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semiBold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extraBold: 'Inter_800ExtraBold',
  display: 'Outfit_700Bold',
  displayExtra: 'Outfit_800ExtraBold',
} as const;
