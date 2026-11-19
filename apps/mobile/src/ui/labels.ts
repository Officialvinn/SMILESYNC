import type { Priority, SymptomDuration } from '@smilesync/shared';
import type { CaseListItem } from '../core/caseRepo';

export const DURATION_LABEL: Record<SymptomDuration, string> = {
  LESS_THAN_1_DAY: 'Less than 1 day',
  DAYS_1_TO_7: '1 to 7 days',
  WEEKS_1_TO_4: '1 to 4 weeks',
  MORE_THAN_1_MONTH: 'More than 1 month',
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  ROUTINE: 'Routine',
  URGENT: 'Urgent',
  EMERGENCY: 'Emergency',
};

export const PRIORITY_COLOR: Record<Priority, string> = {
  ROUTINE: '#0B6E4F',
  URGENT: '#9A5B00',
  EMERGENCY: '#B42318',
};

/** FR 5.3: one plain status line per case. */
export function statusLine(c: Pick<CaseListItem, 'isDraft' | 'status' | 'canFinish' | 'hasAssessment' | 'imageCount' | 'needsAttention' | 'priority'>): string {
  if (c.isDraft) {
    if (!c.canFinish) return `In progress: ${c.imageCount} photos`;
    return c.hasAssessment ? 'Ready to save' : 'Photos done, symptoms next';
  }
  if (c.status === 'PENDING') return c.needsAttention ? 'Needs attention: not sent' : 'Saved, waiting to send';
  if (c.status === 'SYNCED') return 'Sent, waiting for dentist';
  return c.priority ? `Dentist replied: ${PRIORITY_LABEL[c.priority]}` : 'Dentist replied';
}
