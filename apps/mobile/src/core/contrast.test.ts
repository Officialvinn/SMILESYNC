/**
 * Accessibility: every text colour the phone app uses passes WCAG 2.1 AA
 * contrast (4.5:1 for normal text) on the background it sits on. CHWs often
 * work outdoors in bright sun.
 */
import { describe, expect, it } from 'vitest';
import { colors } from '../ui/theme';
import { PRIORITY_COLOR } from '../ui/labels';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const PAIRS: [string, string, string][] = [
  ['body text on page', colors.text, colors.bg],
  ['body text on cards', colors.text, colors.surface],
  ['muted text on page', colors.muted, colors.bg],
  ['muted text on cards', colors.muted, colors.surface],
  ['button text on primary', colors.primaryText, colors.primary],
  ['links and secondary buttons', colors.primary, colors.surface],
  ['links on page', colors.primary, colors.bg],
  ['danger text', colors.danger, colors.surface],
  ['offline banner', colors.warnText, colors.warnBg],
  ['error banner', colors.text, colors.errorBg],
  ['ok banner and tips', colors.text, colors.okBg],
  ['muted text on disabled button', colors.muted, colors.disabledBg],
  ['navy text on teal action buttons', colors.actionText, colors.action],
  ['titles on the navy band', colors.onNavy, colors.navy],
  ['secondary text on the navy band', colors.onNavyMuted, colors.navy],
  ['amber step label on navy', colors.accent, colors.navy],
  ['muted text on the warm banner', colors.muted, colors.warnBg],
  ...(Object.entries(PRIORITY_COLOR).map(([p, c]) => [`white on ${p} badge`, '#FFFFFF', c]) as [string, string, string][]),
];

describe('WCAG AA contrast (4.5:1)', () => {
  it('the formula matches known values', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(contrast('#777777', '#FFFFFF')).toBeCloseTo(4.48, 1);
  });

  it.each(PAIRS)('%s', (_name, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});
