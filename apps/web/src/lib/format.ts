import type { Priority, Sex, SymptomDuration, ViewType } from '@smilesync/shared';

export const DURATION: Record<SymptomDuration, string> = {
  LESS_THAN_1_DAY: '< 1 day',
  DAYS_1_TO_7: '1-7 days',
  WEEKS_1_TO_4: '1-4 weeks',
  MORE_THAN_1_MONTH: '> 1 month',
};

export const PRIORITY: Record<Priority, string> = { ROUTINE: 'Routine', URGENT: 'Urgent', EMERGENCY: 'Emergency' };

export const SEX: Record<Sex, string> = { FEMALE: 'F', MALE: 'M', OTHER: 'Other', NOT_STATED: '-' };

export const VIEW: Record<ViewType, string> = {
  FRONT: 'Front, teeth together',
  UPPER_ARCH: 'Upper arch',
  LOWER_ARCH: 'Lower arch',
  EXTRA: 'Extra',
};

export function painClass(pain: number | null): string {
  if (pain === null) return '';
  return pain >= 8 ? 'pain-high' : pain >= 5 ? 'pain-mid' : 'pain-low';
}

export function relativeAge(iso: string, now = new Date()): string {
  const min = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (min < 60) return `${Math.max(min, 0)} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
