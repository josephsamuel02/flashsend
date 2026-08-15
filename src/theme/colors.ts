// src/theme/colors.ts
// Design system color tokens for Flash Send

export const Colors = {
  // Backgrounds - white for most of the app, royal blue for navigation
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceElevated: '#F5F5F5',
  surfaceBorder: '#E0E0E0',

  // Royal Blue - primary color for navigation and accents
  primary: '#4169E1', // RoyalBlue
  primaryLight: '#6487E8',
  primaryDark: '#2E50B3',
  primaryGlow: 'rgba(65, 105, 225, 0.2)',

  // Secondary - same royal blue theme
  secondary: '#4169E1',
  secondaryLight: '#6487E8',

  // Semantic
  success: '#10B981',
  successDark: '#059669',
  warning: '#F59E0B',
  error: '#EF4444',
  errorDark: '#DC2626',

  // Text
  textPrimary: '#1F2937', // Dark gray for readability on white
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  textDisabled: '#D1D5DB',

  // FAB colors - royal blue with white icons
  fabSend: '#4169E1',
  fabReceive: '#4169E1',

  // Gradients (as arrays for LinearGradient)
  gradientPrimary: ['#4169E1', '#2E50B3'] as const,
  gradientSecondary: ['#4169E1', '#2E50B3'] as const,
  gradientSuccess: ['#10B981', '#059669'] as const,
  gradientCard: ['#FFFFFF', '#F5F5F5'] as const,
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

export const FontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semiBold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extraBold: 'Inter_800ExtraBold',
  display: 'Outfit_700Bold',
  displayExtra: 'Outfit_800ExtraBold',
} as const;
