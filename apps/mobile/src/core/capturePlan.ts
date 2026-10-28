/**
 * FR 3.2: on-screen guidance for the 3 standard views, then optional extras.
 * Written for a phone held by hand with no mirror or cheek retractor.
 */
import { REQUIRED_VIEWS, type ViewType } from '@smilesync/shared';
import { MAX_EXTRA_IMAGES } from './compression';

export interface ViewGuide {
  title: string;
  steps: string[];
}

export const VIEW_GUIDANCE: Record<ViewType, ViewGuide> = {
  FRONT: {
    title: 'Front teeth, biting together',
    steps: [
      'Patient bites the back teeth together and pulls the lips apart with clean fingers.',
      'Hold the phone level with the mouth, about one hand-span away.',
      'All front teeth and gums should fill the box.',
    ],
  },
  UPPER_ARCH: {
    title: 'Upper teeth, from below',
    steps: [
      'Patient tilts the head back and opens wide.',
      'Hold the phone below the chin, pointing up at the upper teeth.',
      'Show all the upper teeth, from one side to the other.',
    ],
  },
  LOWER_ARCH: {
    title: 'Lower teeth, from above',
    steps: [
      'Patient tilts the head down, opens wide and lifts the tongue behind the top teeth.',
      'Hold the phone above the mouth, pointing down at the lower teeth.',
      'Show all the lower teeth, from one side to the other.',
    ],
  },
  EXTRA: {
    title: 'Extra photo of the problem area',
    steps: [
      'Use this for swelling, a broken tooth or a sore the other photos do not show well.',
      'Get close, but keep the area sharp.',
    ],
  },
};

/** Shown on every capture screen. */
export const GENERAL_TIPS = ['Use daylight or turn on the light.', 'Hold still and tap the screen to focus.'];

export interface CaptureProgress {
  /** Next required view still missing, or null when all are done. */
  next: ViewType | null;
  done: number;
  total: number;
  canFinish: boolean;
  canAddExtra: boolean;
}

export function captureProgress(captured: readonly ViewType[]): CaptureProgress {
  const missing = REQUIRED_VIEWS.filter((v) => !captured.includes(v));
  const extras = captured.filter((v) => v === 'EXTRA').length;
  return {
    next: missing[0] ?? null,
    done: REQUIRED_VIEWS.length - missing.length,
    total: REQUIRED_VIEWS.length,
    canFinish: missing.length === 0,
    canAddExtra: extras < MAX_EXTRA_IMAGES,
  };
}
