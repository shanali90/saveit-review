import { Platform } from '@/types';

export const colors = {
  primary: '#534AB7',
  primarySoft: '#EFEDFF',
  primaryPressed: '#433BA0',
  background: '#FBFAFF',
  surface: '#FFFFFF',
  surfaceMuted: '#F5F4FA',
  text: '#15141F',
  textMuted: '#6E6A7D',
  border: '#E8E5F2',
  success: '#2F9B6B',
  successSoft: '#E6F7EF',
  danger: '#D44B5E',
  dangerSoft: '#FDECEF',
  warning: '#A96B00',
  warningSoft: '#FFF4DA',
  shadow: 'rgba(28, 20, 55, 0.06)'
};

export const platformColors: Record<Platform, { fg: string; bg: string; accent: string }> = {
  youtube: { fg: '#FF0033', bg: '#FFF0F3', accent: '#FF0033' },
  instagram: { fg: '#C13584', bg: '#FFF0F7', accent: '#F77737' },
  tiktok: { fg: '#111111', bg: '#EEF8FA', accent: '#00F2EA' },
  other: { fg: '#4F5D75', bg: '#EEF1F7', accent: '#4F5D75' }
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32
};

export const radii = {
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999
};

export const shadow = {
  shadowColor: '#1C1437',
  shadowOpacity: 0.08,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2
};
